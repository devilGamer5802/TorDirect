// script.js - Browser app compatible with WebTorrent v2.8.4
// Expects a WebTorrent bundle available as window.WebTorrent (set by index.html loader)

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
  const sizes = ['Bytes','KB','MB','GB','TB'];
  return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + (sizes[i] || 'Bytes');
}

function formatTime(seconds) {
  if (!seconds || !isFinite(seconds) || seconds < 0) return 'N/A';
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return (h > 0 ? `${String(h).padStart(2,'0')}:` : '') + `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

async function fetchTrackers() {
  log('Fetching trackers...');
  const combined = new Set();

  // local tracker.txt (only ws/wss)
  try {
    const r = await fetch('tracker.txt');
    if (r.ok) {
      const txt = await r.text();
      txt.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#') && /^(wss?:\/\/)/i.test(l)).forEach(t => combined.add(t));
      log('Loaded local trackers');
    }
  } catch (e) { log('No local tracker.txt or failed to fetch.'); }

  // remote API via proxy (optional)
  try {
    const api = 'https://newtrackon.com/api/stable';
    const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(api)}`;
    const r = await fetch(proxy);
    if (r.ok) {
      const txt = await r.text();
      txt.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#') && /^(wss?:\/\/)/i.test(l)).forEach(t => combined.add(t));
      log('Fetched trackers from API proxy');
    }
  } catch (e) { log('Failed to fetch trackers via proxy.'); }

  // fallback GitHub list
  if (combined.size === 0) {
    try {
      const gh = 'https://raw.githubusercontent.com/ngosang/trackerslist/master/trackers_best.txt';
      const r = await fetch(gh);
      if (r.ok) {
        const txt = await r.text();
        txt.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#') && /^(wss?:\/\/)/i.test(l)).forEach(t => combined.add(t));
        log('Fetched trackers from GitHub');
      }
    } catch (e) { log('Failed to fetch trackers from GitHub.'); }
  }

  // defaults
  ['wss://tracker.webtorrent.io', 'wss://tracker.openwebtorrent.com', 'wss://tracker.btorrent.xyz'].forEach(d => combined.add(d));

  fetchedTrackers = Array.from(combined);
  log(`Total trackers: ${fetchedTrackers.length}`);
  return fetchedTrackers;
}

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

    const dlBtn = document.createElement('button'); dlBtn.textContent = 'Download';
    dlBtn.onclick = async () => {
      dlBtn.disabled = true; dlBtn.textContent = 'Preparing...';
      try {
        if (typeof file.getBlobURL === 'function' || typeof file.getBlob === 'function') {
          const url = await new Promise((resolve, reject) => {
            if (typeof file.getBlobURL === 'function') {
              try { file.getBlobURL((err, u) => err ? reject(err) : resolve(u)); } catch (e) { reject(e); }
            } else {
              try { file.getBlob((err, blob) => err ? reject(err) : resolve(URL.createObjectURL(blob))); } catch (e) { reject(e); }
            }
          });
          const a = document.createElement('a'); a.href = url; a.download = file.name || 'download'; document.body.appendChild(a); a.click(); document.body.removeChild(a);
          dlBtn.textContent = 'Download'; dlBtn.disabled = false;
          return;
        }
        log('No blob API available to download file.');
        dlBtn.textContent='Error';
      } catch (e) { log('Download error: ' + (e && e.message ? e.message : e)); dlBtn.textContent='Error'; }
      setTimeout(()=>{ dlBtn.textContent='Download'; dlBtn.disabled=false; }, 2000);
    };
    actions.appendChild(dlBtn);

    const streamBtn = document.createElement('button'); streamBtn.textContent = 'Stream';
    const streamable = /\.(mp4|webm|m4v|mkv|ogv|ogg|mp3|wav|aac|m4a|flac|opus|oga)$/i.test(name);
    streamBtn.disabled = !streamable;
    streamBtn.onclick = async () => {
      streamBtn.disabled = true;
      try { await streamFileToPlayer(file); } catch (e) { log('Stream failed: ' + (e && e.message ? e.message : e)); } finally { streamBtn.disabled = false; }
    };
    actions.appendChild(streamBtn);

    li.appendChild(actions);
    fileListUl.appendChild(li);
  });
}

async function streamFileToPlayer(file) {
  if (!playerDiv) throw new Error('Player element missing');
  const safeName = file.name || file.path || 'Unknown';
  playerDiv.innerHTML = `<h2>Streaming: ${safeName}</h2><p><i>Preparing stream...</i></p>`;

  // prefer streamTo
  if (typeof file.streamTo === 'function') {
    const video = document.createElement('video');
    video.controls = true; video.autoplay = false; video.style.maxWidth = '100%';
    playerDiv.appendChild(video);
    await new Promise((resolve, reject) => {
      try { file.streamTo(video, (err, el) => err ? reject(err) : resolve(el || video)); } catch (e) { reject(e); }
    });
    attachMediaListeners(playerDiv.querySelector('video') || playerDiv.querySelector('audio'));
    return;
  }

  // appendTo fallback
  if (typeof file.appendTo === 'function') {
    await new Promise((resolve, reject) => {
      try { file.appendTo(playerDiv, { autoplay: false, controls: true }, (err, elem) => err ? reject(err) : resolve(elem)); } catch (e) { reject(e); }
    });
    attachMediaListeners(playerDiv.querySelector('video') || playerDiv.querySelector('audio'));
    return;
  }

  // blob fallback
  if (typeof file.getBlobURL === 'function' || typeof file.getBlob === 'function') {
    const url = await new Promise((resolve, reject) => {
      if (typeof file.getBlobURL === 'function') {
        try { file.getBlobURL((err, u) => err ? reject(err) : resolve(u)); } catch (e) { reject(e); }
      } else {
        try { file.getBlob((err, blob) => err ? reject(err) : resolve(URL.createObjectURL(blob))); } catch (e) { reject(e); }
      }
    });
    const mediaEl = document.createElement(/\.(mp3|wav|aac|m4a|flac|oga|opus)$/i.test(file.name) ? 'audio' : 'video');
    mediaEl.controls = true; mediaEl.autoplay = false; mediaEl.src = url; mediaEl.style.maxWidth = '100%';
    playerDiv.appendChild(mediaEl);
    attachMediaListeners(mediaEl);
    return;
  }

  throw new Error('No streaming method available for this file');
}

function attachMediaListeners(elem) {
  if (!elem) return;
  let statusP = playerDiv.querySelector('.playback-status');
  if (!statusP) { statusP = document.createElement('p'); statusP.className = 'playback-status'; statusP.style.marginTop = '6px'; playerDiv.appendChild(statusP); }
  elem.addEventListener('playing', () => { log('Playing'); statusP.textContent = '▶️ Playing'; statusP.style.color = 'lightgreen'; });
  elem.addEventListener('pause', () => { log('Paused'); statusP.textContent = '⏸️ Paused'; statusP.style.color = 'orange'; });
  elem.addEventListener('waiting', () => { log('Buffering'); statusP.textContent = '⏳ Buffering...'; });
  elem.addEventListener('error', () => { log('Media error'); statusP.innerHTML = '<span style="color:red">❌ Playback error</span>'; });
}

function updateProgress(torrent) {
  if (!progressDiv || !peersDiv) return;
  const percent = ((torrent.progress || 0) * 100).toFixed(2);
  const downloaded = formatBytes(torrent.downloaded || 0);
  const total = formatBytes(torrent.length || 0);
  const dlSpeed = formatBytes(torrent.downloadSpeed || 0) + '/s';
  const ulSpeed = formatBytes(torrent.uploadSpeed || 0) + '/s';
  const remaining = (torrent.timeRemaining && isFinite(torrent.timeRemaining)) ? formatTime(torrent.timeRemaining / 1000) : (torrent.done ? 'Done' : 'N/A');
  progressDiv.innerHTML = `Torrent: ${torrent.name || torrent.infoHash}<br/>Progress: ${percent}%<br/>Downloaded: ${downloaded} / ${total}<br/>Speed: ↓ ${dlSpeed} / ↑ ${ulSpeed}<br/>Time Remaining: ${remaining}`;
  peersDiv.innerText = `Peers: ${torrent.numPeers || 0}`;
}

function initializeAndAddTorrent(torrentId, trackers) {
  if (typeof window.WebTorrent === 'undefined') {
    log('Fatal: WebTorrent not available.');
    return;
  }
  log('Initializing WebTorrent client...');
  try {
    client = new window.WebTorrent();
  } catch (e) {
    log('Client init failed: ' + (e && e.message ? e.message : e));
    return;
  }

  client.on('error', err => { log('WebTorrent Client Error: ' + (err && err.message ? err.message : err)); });

  const addOptions = {};
  if (Array.isArray(trackers) && trackers.length) addOptions.announce = trackers;

  try {
    client.add(torrentId, addOptions, torrent => {
      const name = torrent.name || torrent.infoHash;
      log('Metadata received for: ' + name);
      displayFiles(torrent);
      updateProgress(torrent);

      torrent.on('download', () => updateProgress(torrent));
      torrent.on('upload', () => updateProgress(torrent));
      torrent.on('done', () => { updateProgress(torrent); log('Torrent finished: ' + name); });
      torrent.on('noPeers', type => log('No peers via ' + type));
    });
  } catch (e) {
    log('Add torrent failed: ' + (e && e.message ? e.message : e));
  }
}

async function startTorrent(torrentIdOrFile) {
  if (startButton) startButton.disabled = true;
  if (client) {
    log('Destroying previous client...');
    try { await new Promise(resolve => client.destroy(resolve)); client = null; } catch (e) { log('Destroy error: ' + (e && e.message ? e.message : e)); client = null; }
  }

  try {
    const trackers = await fetchTrackers();
    initializeAndAddTorrent(torrentIdOrFile, trackers);
  } catch (e) { log('Start failed: ' + (e && e.message ? e.message : e)); }

  if (startButton) startButton.disabled = false;
}

document.addEventListener('DOMContentLoaded', () => {
  if (!torrentIdInput || !torrentFileInput || !startButton || !logsDiv || !progressDiv || !peersDiv || !fileListUl || !playerDiv) {
    alert('Missing essential elements; check HTML IDs.');
    return;
  }

  startButton.addEventListener('click', () => {
    const torrentId = torrentIdInput.value.trim();
    const file = torrentFileInput.files && torrentFileInput.files[0];
    if (file) { log('Starting from .torrent file: ' + file.name); startTorrent(file); torrentIdInput.value = ''; }
    else if (torrentId) { log('Starting from magnet/info hash/url.'); startTorrent(torrentId); torrentFileInput.value = ''; }
    else { log('Input Error: Provide a magnet link/info hash or select a .torrent file.'); }
  });

  torrentIdInput.addEventListener('input', () => { if (torrentIdInput.value.trim() !== '' && torrentFileInput.value !== '') torrentFileInput.value = ''; });
  torrentFileInput.addEventListener('change', () => { if (torrentFileInput.files.length > 0 && torrentIdInput.value.trim() !== '') torrentIdInput.value = ''; });

  // initial tracker fetch
  fetchTrackers().then(t => { log('Initial trackers loaded: ' + t.length); }).catch(e => log('Initial tracker fetch failed: ' + (e && e.message ? e.message : e)));
});
