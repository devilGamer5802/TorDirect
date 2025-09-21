// Fixed script for WebTorrent v2.8.4
// Major changes / improvements:
// - Keeps backwards-compatible API usage but adds promise-wrappers so code works with both callback and promise styles
// - Adds default WebRTC trackers if none were found (helps browser discovery)
// - Uses file.appendTo / file.renderTo when available, and falls back to file.getBlob() -> URL.createObjectURL
// - Optionally uses client.loadWorker() + file.streamTo when supported for lower-memory streaming
// - Better error handling around playback and more robust UI updates
// - Avoids synchronous AbortSignal.timeout where not supported (polyfill fallback)

(function () {
  // --- Helper to safely call AbortSignal.timeout if available ---
  function fetchWithTimeout(url, opts = {}, timeoutMs = 10000) {
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
      return fetch(url, { ...opts, signal: AbortSignal.timeout(timeoutMs) });
    }
    // Fallback: manual timeout
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timeout')) , timeoutMs);
      fetch(url, opts).then(r => { clearTimeout(timer); resolve(r); }).catch(e => { clearTimeout(timer); reject(e); });
    });
  }

  // --- DOM refs ---
  const torrentIdInput = document.getElementById('torrentIdInput');
  const torrentFileInput = document.getElementById('torrentFileInput');
  const startButton = document.getElementById('startButton');
  const logsDiv = document.getElementById('logs');
  const progressDiv = document.getElementById('progress');
  const peersDiv = document.getElementById('peers');
  const fileListUl = document.getElementById('fileList');
  const playerDiv = document.getElementById('player');

  let client = null;
  let fetchedTrackers = [];

  function log(message) {
    console.log(message);
    if (!logsDiv) return;
    const time = new Date().toLocaleTimeString();
    const sanitized = ('' + message).replace(/</g, '&lt;').replace(/>/g, '&gt;');
    logsDiv.innerHTML = `[${time}] ${sanitized}<br>` + logsDiv.innerHTML;
  }

  function formatBytes(bytes, decimals = 2) {
    if (!bytes || isNaN(bytes) || bytes === 0) return '0 Bytes';
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + ['Bytes','KB','MB','GB'][i] || 'Bytes';
  }

  function formatTime(seconds) {
    if (!seconds || !isFinite(seconds) || seconds < 0) return 'N/A';
    const total = Math.round(seconds);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return (h > 0 ? `${String(h).padStart(2,'0')}:` : '') + `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  // --- Tracker fetching (same logic simplified) ---
  async function fetchTrackers() {
    log('Fetching trackers...');
    const combined = new Set();
    // local tracker.txt
    try {
      const r = await fetchWithTimeout('tracker.txt', {}, 5000);
      if (r.ok) {
        const txt = await r.text();
        txt.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#')).forEach(t => combined.add(t));
        log('Loaded local trackers');
      }
    } catch (e) { log('No local tracker.txt or failed to fetch.'); }

    // remote API via proxy
    try {
      const api = 'https://newtrackon.com/api/stable';
      const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(api)}`;
      const r = await fetchWithTimeout(proxy, {}, 10000);
      if (r.ok) {
        const txt = await r.text();
        txt.split('\n').map(l => l.trim()).filter(l=>l && !l.startsWith('#')).forEach(t=>combined.add(t));
        log('Fetched trackers from API proxy');
      }
    } catch (e) { log('Failed to fetch trackers via proxy.'); }

    // fallback to GitHub list
    if (combined.size === 0) {
      try {
        const gh = 'https://raw.githubusercontent.com/ngosang/trackerslist/master/trackers_best.txt';
        const r = await fetchWithTimeout(gh, {}, 8000);
        if (r.ok) {
          const txt = await r.text();
          txt.split('\n').map(l => l.trim()).filter(l=>l && !l.startsWith('#')).forEach(t=>combined.add(t));
          log('Fetched trackers from GitHub');
        }
      } catch (e) { log('Failed to fetch trackers from GitHub.'); }
    }

    // Ensure some default WebRTC trackers exist (helps browser discovery)
    const defaults = [
      'wss://tracker.webtorrent.io',
      'wss://tracker.openwebtorrent.com',
      'wss://tracker.btorrent.xyz'
    ];
    defaults.forEach(d => combined.add(d));

    fetchedTrackers = Array.from(combined);
    log(`Total trackers: ${fetchedTrackers.length}`);
    return fetchedTrackers;
  }

  // --- promisify file methods for easier usage ---
  function getBlobURLAsync(file, maxBlobLength) {
    return new Promise((resolve, reject) => {
      // If getBlobURL exists (callback style)
      if (typeof file.getBlobURL === 'function') {
        try {
          // some versions require callback, some return value when callback omitted
          file.getBlobURL((err, url) => { if (err) reject(err); else resolve(url); });
        } catch (e) {
          reject(e);
        }
        return;
      }
      // fallback: getBlob -> createObjectURL
      if (typeof file.getBlob === 'function') {
        file.getBlob((err, blob) => {
          if (err) return reject(err);
          try { const url = URL.createObjectURL(blob); resolve(url); } catch (e) { reject(e); }
        });
        return;
      }
      reject(new Error('No supported blob API on file object'));
    });
  }

  async function streamFileToPlayer(file) {
    if (!playerDiv) throw new Error('Player element missing');
    const safeName = String(file.name || file.path || 'Unknown');
    playerDiv.innerHTML = `<h2>Streaming: ${safeName}</h2><p><i>Preparing stream...</i></p>`;

    // Prefer renderTo (render into given video element) if user has an existing <video> element
    try {
      // Use streamTo (best) if worker is loaded
      if (typeof client.loadWorker === 'function') {
        try {
          await client.loadWorker();
        } catch (e) {
          // Not fatal -- continue with other methods
          log('client.loadWorker failed or not available, fallback to appendTo/getBlobURL');
        }
      }

      if (typeof file.streamTo === 'function') {
        // Create a video element and let streamTo set it up
        const video = document.createElement('video');
        video.controls = true; video.autoplay = false; video.style.maxWidth = '100%';
        playerDiv.appendChild(video);
        await new Promise((resolve, reject) => {
          file.streamTo(video, (err, elem) => {
            if (err) return reject(err);
            resolve(elem || video);
          });
        });
        // success
        removePreparingText();
        attachMediaListeners(playerDiv.querySelector('video') || playerDiv.querySelector('audio'));
        return;
      }

      // Next prefer appendTo (streams via mediasource where possible)
      if (typeof file.appendTo === 'function') {
        await new Promise((resolve, reject) => {
          file.appendTo(playerDiv, { autoplay: false, controls: true }, (err, elem) => {
            if (err) return reject(err);
            resolve(elem);
          });
        });
        removePreparingText();
        attachMediaListeners(playerDiv.querySelector('video') || playerDiv.querySelector('audio'));
        return;
      }

      // Last resort: get blob URL and set as src. This may require full download.
      const url = await getBlobURLAsync(file);
      removePreparingText();
      const mediaEl = document.createElement(isAudioFile(file.name) ? 'audio' : 'video');
      mediaEl.controls = true; mediaEl.autoplay = false; mediaEl.src = url; mediaEl.style.maxWidth = '100%';
      playerDiv.appendChild(mediaEl);
      attachMediaListeners(mediaEl);

    } catch (err) {
      log('Streaming failed: ' + (err && err.message ? err.message : String(err)));
      const placeholder = playerDiv.querySelector('p > i');
      if (placeholder) placeholder.parentElement.innerHTML = `<p style=\"color:red;\">Could not stream file: ${err.message || err}. Try downloading instead.</p>`;
      throw err;
    }

    function removePreparingText() {
      const placeholder = playerDiv.querySelector('p > i');
      if (placeholder) placeholder.parentElement.remove();
    }
  }

  function isAudioFile(name) {
    return /\.(mp3|wav|aac|m4a|flac|oga|opus)$/i.test(name);
  }

  function attachMediaListeners(elem) {
    if (!elem) return;
    const statusP = document.createElement('p'); statusP.className = 'playback-status'; statusP.style.marginTop = '6px'; playerDiv.appendChild(statusP);
    elem.addEventListener('playing', () => { log('Playing'); statusP.textContent = '▶️ Playing'; statusP.style.color = 'lightgreen'; });
    elem.addEventListener('pause', () => { log('Paused'); statusP.textContent = '⏸️ Paused'; statusP.style.color = 'orange'; });
    elem.addEventListener('waiting', () => { log('Buffering'); statusP.textContent = '⏳ Buffering...'; });
    elem.addEventListener('error', () => { log('Media error'); statusP.innerHTML = '<span style=\"color:red\">❌ Playback error</span>'; });
  }

  // --- UI: display files & actions ---
  function displayFiles(torrent) {
    if (!fileListUl || !playerDiv) return;
    fileListUl.innerHTML = '';
    playerDiv.innerHTML = '<h2>Streaming Player</h2>';

    if (!torrent.files || torrent.files.length === 0) {
      const li = document.createElement('li'); li.textContent = 'Waiting for file info...'; fileListUl.appendChild(li); return;
    }

    torrent.files.forEach(file => {
      const li = document.createElement('li');
      const name = file.name || file.path || 'unknown';
      const info = document.createElement('span'); info.textContent = `${name} (${formatBytes(file.length || 0)})`; li.appendChild(info);

      const actions = document.createElement('div'); actions.style.marginTop='6px'; actions.style.display='flex'; actions.style.gap='6px';

      const dlBtn = document.createElement('button'); dlBtn.textContent = 'Download'; dlBtn.onclick = async () => {
        dlBtn.disabled = true; dlBtn.textContent = 'Preparing...';
        try {
          // Prefer file.getBlobURL or file.getBlob
          if (typeof file.getBlobURL === 'function' || typeof file.getBlob === 'function') {
            const url = await getBlobURLAsync(file);
            const a = document.createElement('a'); a.href = url; a.download = file.name || file.path || 'download'; document.body.appendChild(a); a.click(); document.body.removeChild(a);
            dlBtn.textContent = 'Download'; dlBtn.disabled = false;
            return;
          }
          log('No blob API available to download file.'); dlBtn.textContent='Error';
        } catch (e) { log('Download error: ' + e.message); dlBtn.textContent='Error'; }
        setTimeout(()=>{ dlBtn.textContent='Download'; dlBtn.disabled=false; }, 2000);
      };
      actions.appendChild(dlBtn);

      const streamable = /\.(mp4|webm|m4v|mkv|ogv|ogg|mp3|wav|aac|m4a|flac|opus|oga)$/i.test(name);
      const streamBtn = document.createElement('button'); streamBtn.textContent = 'Stream'; streamBtn.disabled = !streamable; streamBtn.onclick = async () => {
        try { streamBtn.disabled = true; await streamFileToPlayer(file); } catch (e) { log('Stream failed: '+e.message); } finally { streamBtn.disabled=false; }
      };
      actions.appendChild(streamBtn);

      li.appendChild(actions); fileListUl.appendChild(li);
    });
  }

  // --- Progress updater ---
  function updateProgress(torrent) {
    if (!progressDiv || !peersDiv) return;
    const percent = ((torrent.progress || 0) * 100).toFixed(2);
    const downloaded = formatBytes(torrent.downloaded || 0);
    const total = formatBytes(torrent.length || 0);
    const dlSpeed = formatBytes(torrent.downloadSpeed || 0) + '/s';
    const ulSpeed = formatBytes(torrent.uploadSpeed || 0) + '/s';
    const remaining = torrent.timeRemaining && isFinite(torrent.timeRemaining) ? formatTime(torrent.timeRemaining / 1000) : (torrent.done ? 'Done' : 'N/A');
    progressDiv.innerHTML = `Torrent: ${torrent.name || torrent.infoHash}<br/>Progress: ${percent}%<br/>Downloaded: ${downloaded} / ${total}<br/>Speed: ↓ ${dlSpeed} / ↑ ${ulSpeed}<br/>Time Remaining: ${remaining}`;
    peersDiv.innerText = `Peers: ${torrent.numPeers || 0}`;
  }

  // --- Initialize and add torrent ---
  function initializeAndAddTorrent(torrentId, trackers) {
    log('Initializing WebTorrent client...');
    try { client = new WebTorrent({}); } catch (e) { log('Client init failed: '+e.message); return; }
    client.on('error', e => { log('Client error: '+e.message); });

    const addOptions = {};
    if (Array.isArray(trackers) && trackers.length) addOptions.announce = trackers;

    try {
      const torrent = client.add(torrentId, addOptions, (torrent) => {
        log('Metadata fetched: ' + (torrent.name || torrent.infoHash));
        displayFiles(torrent);
        updateProgress(torrent);

        // events
        torrent.on('download', () => updateProgress(torrent));
        torrent.on('upload', () => updateProgress(torrent));
        torrent.on('done', () => { updateProgress(torrent); log('Torrent done'); });
        torrent.on('noPeers', (type) => log('No peers for ' + type));
      });

      // immediate reference
      if (torrent) { log('Torrent added, infoHash: ' + torrent.infoHash); updateProgress(torrent); }
    } catch (e) { log('Add torrent failed: ' + e.message); if (client) { try { client.destroy(() => {}); } catch (_) {} client = null; } }
  }

  // --- Start flow ---
  async function startTorrent(torrentId) {
    if (startButton) startButton.disabled = true;
    if (client) {
      log('Destroy previous client');
      try { await new Promise(resolve => client.destroy(resolve)); client = null; } catch (e) { log('Destroy error: '+e.message); client = null; }
    }
    try {
      const trackers = await fetchTrackers();
      initializeAndAddTorrent(torrentId, trackers);
    } catch (e) { log('Start failed: '+e.message); }
    if (startButton) startButton.disabled = false;
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (!torrentIdInput || !torrentFileInput || !startButton || !logsDiv || !progressDiv || !peersDiv || !fileListUl || !playerDiv) {
      alert('Missing essential elements. Check IDs.'); return;
    }

    startButton.addEventListener('click', () => {
      const text = torrentIdInput.value.trim();
      const file = (torrentFileInput.files && torrentFileInput.files[0]) || null;
      if (file) { startTorrent(file); torrentIdInput.value=''; }
      else if (text) { startTorrent(text); torrentFileInput.value=''; }
      else { log('No input provided'); }
    });

    // initial fetch trackers in background
    fetchTrackers().catch(e=>log('Initial tracker fetch failed.'));
  });
})();
