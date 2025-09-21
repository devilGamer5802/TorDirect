// videostream.fixed.js
// Browser-friendly replacement for the original VideoStream that
// uses the MediaSource API directly (no `pump`, no `mediasource` pkg).
// Assumes MP4Remuxer emits 'ready' and provides `muxed` readable-like streams
// that emit 'data' (Uint8Array / Buffer) and 'end' and have destroy().

const MP4Remuxer = require('./mp4-remuxer')

function VideoStream (file, mediaElem, opts = {}) {
  if (!(this instanceof VideoStream)) {
    return new VideoStream(file, mediaElem, opts)
  }

  this.detailedError = null
  this._file = file
  this._elem = mediaElem
  this._waitingFired = false
  this._tracks = null
  this._muxer = null
  this._ms = null
  this._onError = this._onError.bind(this)
  this._onWaiting = this._onWaiting.bind(this)

  // if preload isn't 'none' create muxer so init segments can be prepared
  if (this._elem.preload !== 'none') {
    this._createMuxer()
  }

  if (mediaElem.autoplay) { mediaElem.preload = 'auto' }
  mediaElem.addEventListener('waiting', this._onWaiting)
  mediaElem.addEventListener('error', this._onError)
}

VideoStream.prototype = {
  _onError () {
    // try to gather any details we can
    this.detailedError = (this._elem && this._elem.error) ? this._elem.error : null
    this.destroy()
  },

  _onWaiting () {
    this._waitingFired = true
    if (!this._muxer) {
      this._createMuxer()
    } else if (this._tracks) {
      this._pump()
    }
  },

  _createMuxer () {
    // create remuxer
    this._muxer = new MP4Remuxer(this._file)

    // when remuxer ready -> gives track init segments & mime
    this._muxer.on('ready', data => {
      // data = [ { mime, init }, ... ]
      this._tracks = data.map(trackData => {
        // create a writeStream backed by MediaSource/SourceBuffer
        const writer = this._createMediaSourceWriter(trackData.mime)
        // write init segment then mark initFlushed
        writer.write(trackData.init, err => {
          if (err) writer._onError && writer._onError(err)
          writer.initFlushed = true
          if (writer.onInitFlushed) writer.onInitFlushed(err)
        })
        return {
          muxed: null,           // will be set in _pump()
          writer,                // the write target (has write(chunk, cb), destroy())
          initFlushed: writer.initFlushed || false,
          onInitFlushed: null
        }
      })

      if (this._waitingFired || this._elem.preload === 'auto') {
        this._pump()
      }
    })

    this._muxer.on('error', err => {
      // bubble to media element
      this._elem.error = err
      this.destroy()
    })
  },

  _createMediaSourceWriter (mime) {
    // MediaSource writer which mimics the `.write(chunk, cb)` callback style
    // and provides `.on('error', fn)` and `.destroy()`.
    // Returns an object: { write(buf, cb), destroy(), on, initFlushed }
    const elem = this._elem
    // Lazy create MediaSource when first called to allow multiple tracks
    if (!this._ms) {
      if (!('MediaSource' in window)) {
        const err = new Error('MediaSource API not supported in this browser')
        throw err
      }
      this._ms = new MediaSource()
      // create object URL for video element
      elem.src = URL.createObjectURL(this._ms)
      // store sourceBuffers map by mime
      this._ms._buffers = []
    }

    const ms = this._ms
    let sourceBuffer = null
    let queue = []
    let updating = false
    let destroyed = false
    const listeners = { error: [] }

    function emitError (err) {
      listeners.error.forEach(fn => fn(err))
    }

    function tryAppend () {
      if (destroyed) return
      if (!sourceBuffer || sourceBuffer.updating) return
      if (queue.length === 0) return
      const chunk = queue.shift()
      try {
        sourceBuffer.appendBuffer(chunk)
      } catch (e) {
        emitError(e)
      }
    }

    // create placeholder writer object
    const writer = {
      initFlushed: false,
      onInitFlushed: null,
      write (buf, cb) {
        if (destroyed) {
          const e = new Error('Writer destroyed')
          if (cb) cb(e)
          return
        }

        // If SourceBuffer not created yet, create it on msopen
        if (!sourceBuffer) {
          if (ms.readyState === 'open') {
            try {
              sourceBuffer = ms.addSourceBuffer(mime)
              ms._buffers.push(sourceBuffer)
              sourceBuffer.addEventListener('updateend', () => {
                // when update finishes, call callbacks attached to appended chunk:
                updating = false
                tryAppend()
              })
              sourceBuffer.addEventListener('error', (ev) => {
                emitError(new Error('SourceBuffer error: ' + (ev && ev.message ? ev.message : 'unknown')))
              })
            } catch (e) {
              // this can fail if codec not supported
              if (cb) cb(e)
              emitError(e)
              return
            }
          } else {
            // wait for MediaSource to open
            const onOpen = () => {
              ms.removeEventListener('sourceopen', onOpen)
              // re-try write
              try { writer.write(buf, cb) } catch (e) { if (cb) cb(e) }
            }
            ms.addEventListener('sourceopen', onOpen)
            return
          }
        }

        // push into queue and try append
        queue.push(buf instanceof Uint8Array ? buf : new Uint8Array(buf))
        // mark init flushed if this looks like init segment - caller expects callback called after writing init
        if (!writer.initFlushed) {
          writer.initFlushed = true
          // call callback asynchronously after we've queued init
          setTimeout(() => { if (cb) cb(null) }, 0)
        } else {
          // for normal chunks, we don't know when append finishes, but call cb asap (behaviour mirrors old write callback semantics)
          if (cb) cb(null)
        }
        tryAppend()
      },
      on (evt, fn) {
        if (evt === 'error') listeners.error.push(fn)
      },
      destroy () {
        destroyed = true
        try {
          if (sourceBuffer && ms && ms.readyState === 'open') {
            try {
              if (ms._buffers && ms._buffers.indexOf(sourceBuffer) !== -1) {
                // remove buffer if needed
                // Note: removing SourceBuffer ranges can be tricky; we'll just abort appends and let GC handle it
              }
            } catch (e) {}
          }
        } catch (e) {}
      }
    }

    return writer
  },

  _pump () {
    if (!this._muxer || !this._tracks) return
    // Asking muxer for streams starting at currentTime.
    // Original code: const muxed = this._muxer.seek(this._elem.currentTime, !this._tracks)
    // We'll call same API and expect an array of readable-like objects (one per track).
    const muxed = this._muxer.seek(this._elem.currentTime, !this._tracks)

    // iterate per-track and pipe data by listening to 'data' and 'end'
    this._tracks.forEach((track, i) => {
      const pumpTrack = () => {
        // cleanup previous muxed if exists
        if (track.muxed && typeof track.muxed.destroy === 'function') {
          try { track.muxed.destroy() } catch (e) {}
        }
        track.muxed = muxed[i]
        if (!track.muxed) return

        // many remuxers provide .on('data', cb) and .on('end'), .destroy()
        if (typeof track.muxed.on === 'function') {
          track.muxed.on('data', chunk => {
            try {
              // writer.write expects (buf, cb)
              track.writer.write(chunk, err => {
                if (err) track.writer._onError && track.writer._onError(err)
              })
            } catch (e) {
              track.writer._onError && track.writer._onError(e)
            }
          })
          track.muxed.on('end', () => {
            // when muxed ends, we do nothing special; MediaSource remains open for more segments.
          })
          track.muxed.on('error', err => {
            track.writer._onError && track.writer._onError(err)
          })
        } else if (typeof track.muxed.pipe === 'function') {
          // fallback: try piping if it's a Node-style stream and writer implements .write
          try {
            // naive piping: pull data events and write into writer
            track.muxed.on('data', d => track.writer.write(d, () => {}))
            track.muxed.on('end', () => {})
            track.muxed.on('error', err => track.writer._onError && track.writer._onError(err))
          } catch (e) {
            track.writer._onError && track.writer._onError(e)
          }
        } else {
          // Unknown stream type: attempt to read buffer property (rare)
          // No-op
        }
      }

      if (!track.initFlushed) {
        track.onInitFlushed = err => {
          if (err) {
            track.writer._onError && track.writer._onError(err)
            return
          }
          pumpTrack()
        }
      } else {
        pumpTrack()
      }
    })
  },

  destroy () {
    if (this.destroyed) return
    this.destroyed = true

    this._elem.removeEventListener('waiting', this._onWaiting)
    this._elem.removeEventListener('error', this._onError)

    if (this._tracks) {
      this._tracks.forEach(track => {
        try { if (track.muxed && typeof track.muxed.destroy === 'function') track.muxed.destroy() } catch (e) {}
        try { if (track.writer && typeof track.writer.destroy === 'function') track.writer.destroy() } catch (e) {}
      })
    }

    // revoke object URL if created
    try {
      if (this._ms && this._elem && this._elem.src) {
        URL.revokeObjectURL(this._elem.src)
      }
    } catch (e) {}

    // clear media element src so element stops using buffers
    try { this._elem.removeAttribute('src'); this._elem.load && this._elem.load() } catch (e) {}
  }
}

module.exports = VideoStream
