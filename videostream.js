/* videostream.js - Browser VideoStream (no Node-only deps)
   Works if you have a remuxer exposed as window.MP4Remuxer (optional).
   Otherwise the script prefers file.streamTo(), file.appendTo(), or getBlob()/getBlobURL() on the WebTorrent File object.
*/

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VideoStream = factory();
}(typeof self !== 'undefined' ? self : this, function () {

  function VideoStream(file, mediaElem, opts) {
    if (!(this instanceof VideoStream)) return new VideoStream(file, mediaElem, opts);
    opts = opts || {};
    this._file = file;
    this._elem = mediaElem;
    this._destroyed = false;
    this._waitingFired = false;
    this._tracks = null;
    this._muxer = null;
    this._ms = null;

    this._onWaiting = this._onWaiting.bind(this);
    this._onError = this._onError.bind(this);

    mediaElem.addEventListener('waiting', this._onWaiting);
    mediaElem.addEventListener('error', this._onError);

    if (this._elem.preload !== 'none') this._maybeCreateMuxer();
  }

  VideoStream.prototype._onError = function () {
    try { this.detailedError = this._elem && this._elem.error ? this._elem.error : null; } catch (e) {}
    this.destroy();
  };

  VideoStream.prototype._onWaiting = function () {
    this._waitingFired = true;
    if (!this._muxer) this._maybeCreateMuxer();
    else if (this._tracks) this._pump();
  };

  VideoStream.prototype._maybeCreateMuxer = function () {
    var self = this;
    if (typeof window !== 'undefined' && window.MP4Remuxer) {
      try {
        this._muxer = new window.MP4Remuxer(this._file);
        this._muxer.on('ready', function (data) {
          // data: [{ mime, init }, ...]
          self._tracks = data.map(function (td) {
            return { muxed: null, writer: { initFlushed: false, onInitFlushed: null }, initFlushed: false, onInitFlushed: null };
          });
          if (self._waitingFired || self._elem.preload === 'auto') self._pump();
        });
        this._muxer.on('error', function (err) { try { self._elem.error = err; } catch (e) {} self.destroy(); });
      } catch (e) {
        console.warn('MP4Remuxer init failed, falling back to built-ins', e);
        this._muxer = null;
      }
    }
  };

  // Primary streaming method (exposed if user wants to call). But typical usage is to let script.js call file.appendTo / streamTo.
  VideoStream.prototype.stream = function () {
    var file = this._file;
    var elem = this._elem;
    var self = this;

    if (file && typeof file.streamTo === 'function') {
      return new Promise(function (resolve, reject) {
        try {
          var video = elem.tagName && (elem.tagName.toLowerCase() === 'video' || elem.tagName.toLowerCase() === 'audio') ? elem : document.createElement('video');
          video.controls = true;
          if (!video.parentElement) elem.parentElement && elem.parentElement.appendChild(video);
          file.streamTo(video, function (err, el) { if (err) { self.destroy(); reject(err); } else resolve(el || video); });
        } catch (e) { reject(e); }
      });
    }

    if (file && typeof file.appendTo === 'function') {
      return new Promise(function (resolve, reject) {
        try {
          file.appendTo(elem, { autoplay: false, controls: true }, function (err, el) { if (err) { self.destroy(); reject(err); } else resolve(el); });
        } catch (e) { reject(e); }
      });
    }

    if (file && (typeof file.getBlobURL === 'function' || typeof file.getBlob === 'function')) {
      return new Promise(function (resolve, reject) {
        try {
          if (typeof file.getBlobURL === 'function') {
            file.getBlobURL(function (err, url) { if (err) reject(err); else { elem.src = url; resolve(elem); } });
            return;
          }
          file.getBlob(function (err, blob) { if (err) reject(err); else { var url = URL.createObjectURL(blob); elem.src = url; resolve(elem); } });
        } catch (e) { reject(e); }
      });
    }

    return Promise.reject(new Error('No streaming APIs available (streamTo/appendTo/getBlob).'));
  };

  VideoStream.prototype._pump = function () {
    if (!this._muxer || !this._tracks) return;
    var muxed = this._muxer.seek(this._elem.currentTime || 0, !this._tracks);
    var self = this;
    this._tracks.forEach(function (track, i) {
      if (track.muxed && typeof track.muxed.destroy === 'function') try { track.muxed.destroy(); } catch (e) {}
      track.muxed = muxed[i];
      if (!track.muxed) return;
      if (typeof track.muxed.on === 'function' && track.writer && typeof track.writer.write === 'function') {
        track.muxed.on('data', function (chunk) { try { track.writer.write(chunk, function () {}); } catch (e) { console.error(e); } });
        track.muxed.on('end', function () {});
        track.muxed.on('error', function (err) { console.error('Muxed stream error', err); });
      } else if (typeof track.muxed.pipe === 'function') {
        try {
          track.muxed.on('data', function (d) { track.writer.write(d, function () {}); });
          track.muxed.on('end', function () {});
          track.muxed.on('error', function (err) { console.error(err); });
        } catch (e) { console.error(e); }
      }
    });
  };

  VideoStream.prototype.destroy = function () {
    if (this._destroyed) return;
    this._destroyed = true;
    try { this._elem.removeEventListener('waiting', this._onWaiting); this._elem.removeEventListener('error', this._onError); } catch (e) {}
    try { if (this._muxer && typeof this._muxer.destroy === 'function') this._muxer.destroy(); } catch (e) {}
    try { if (this._elem && this._elem.src) { try { URL.revokeObjectURL(this._elem.src); } catch (e) {} this._elem.removeAttribute('src'); this._elem.load && this._elem.load(); } } catch (e) {}
  };

  return VideoStream;
}));
