/**
 * public/script.js (Full Version with Streaming)
 * Frontend JavaScript for the TorDirect Web App
 */

// --- DOM Elements ---
const torrentsList = document.getElementById('torrents');
const addTorrentForm = document.getElementById('add-torrent-form');
const magnetUriInput = document.getElementById('magnet-uri');
const loadingPlaceholder = document.querySelector('.loading-placeholder');
const addStatusMessage = document.getElementById('add-status');
const playerModal = document.getElementById('player-modal');
const playerContainer = document.getElementById('player-container');
const playerTitle = document.getElementById('player-title');

// --- Utility Functions ---
// (formatBytes, formatSpeed, msToTime - include as before)
function formatBytes(bytes, decimals = 2) { /* ... */ }
function formatSpeed(bytesPerSecond) { /* ... */ }
function msToTime(duration) { /* ... */ }

// --- Torrent Rendering ---

// Renders a single torrent item, including its file list
function renderTorrent(torrent) {
    if (!torrent || !torrent.infoHash) return;

    let torrentItem = document.getElementById(`torrent-${torrent.infoHash}`);
    const isNew = !torrentItem;

    if (isNew) {
        torrentItem = document.createElement('li');
        torrentItem.classList.add('torrent-item');
        torrentItem.id = `torrent-${torrent.infoHash}`;
    }

    // --- File List Rendering ---
    let fileListHTML = '<div class="no-files">Waiting for metadata...</div>';
    if (torrent.files && torrent.files.length > 0) {
        fileListHTML = `<ul class="file-list">`;
        // Determine which files are likely streamable (simple check)
        const streamableTypes = /^(video|audio)\/.+|application\/(ogg|octet-stream)$/i; // Adjust regex as needed
        const commonVideoExt = /\.(mp4|mkv|webm|mov|avi|flv)$/i;
        const commonAudioExt = /\.(mp3|ogg|wav|flac|aac|m4a)$/i;

        torrent.files.forEach((file) => {
             const mimeType = mime.getType(file.name) || 'application/octet-stream'; // Basic MIME type check
             const isVideo = commonVideoExt.test(file.name) || mimeType.startsWith('video/');
             const isAudio = !isVideo && (commonAudioExt.test(file.name) || mimeType.startsWith('audio/'));
             const canStream = isVideo || isAudio;

             // Build buttons/links
             const streamButton = canStream
                ? `<button class="stream-button" data-infohash="${torrent.infoHash}" data-fileindex="${file.index}" data-filename="${escape(file.name)}" data-type="${isVideo ? 'video' : 'audio'}">Stream</button>`
                : '';
             const downloadLink = `<a href="/api/torrents/${torrent.infoHash}/download/${file.index}" class="download-link" download="${file.name}">Download</a>`; // Use download route

            fileListHTML += `
                <li class="file-item">
                    <div class="file-info">
                       <span class="file-name">${file.path}</span>
                        (<span class="file-size">${formatBytes(file.length)}</span>)
                     </div>
                     <div class="file-actions">
                        ${streamButton}
                        ${downloadLink}
                     </div>
                </li>
            `;
        });
        fileListHTML += `</ul>`;
    } else if (torrent.name !== 'Fetching metadata...') {
        fileListHTML = '<div class="no-files">Torrent contains no files or metadata error.</div>';
    }

    // --- Torrent Status and Progress ---
    // (Calculate statusText, progressBarStyle, etc., as before)
     let statusText = 'Connecting...'; // ... (status calculation logic) ...
     let progressBarStyle = `width: ${torrent.progress}%`; // ... (style logic) ...

    // --- Update Torrent Item HTML ---
    torrentItem.innerHTML = `
        <h3>${torrent.name || 'Loading metadata...'}</h3>
        <div class="info">
             <span>Peers: ${torrent.numPeers || 0}</span> |
             <span>Down: ${formatSpeed(torrent.downloadSpeed || 0)}</span> |
             <span>Up: ${formatSpeed(torrent.uploadSpeed || 0)}</span> |
             <span>${formatBytes(torrent.downloaded || 0)} / ${torrent.length ? formatBytes(torrent.length) : '?'}</span> |
             <span class="status ${torrent.hasError ? 'error' : (torrent.done ? 'done' : '')}">${statusText}</span>
             ${!torrent.done && !torrent.paused && !torrent.hasError && torrent.timeRemaining ? `| ETA: ${msToTime(torrent.timeRemaining)}` : ''}
        </div>
        <div class="progress-bar-container">
            <div class="progress-bar ${torrent.done ? 'done' : (torrent.hasError ? 'error': '')}" style="${progressBarStyle}">${torrent.progress}%</div>
        </div>
        <details class="file-list-container">
             <summary>Files (${torrent.files?.length || 0})</summary>
             ${fileListHTML}
         </details>
         <div class="actions" style="margin-top: 10px; display: flex; justify-content: flex-end;">
             <button class="remove" data-infohash="${torrent.infoHash}">Remove</button>
         </div>
         <div class="info-hash">${torrent.infoHash}</div>
    `;

     // Add/remove classes for overall state styling
     torrentItem.classList.toggle('is-done', torrent.done);
     torrentItem.classList.toggle('is-error', torrent.hasError);
     // ... other states ...

    // Insert into DOM if it's a new item
    if (isNew) {
         if (loadingPlaceholder && torrentsList.contains(loadingPlaceholder)) {
             torrentsList.insertBefore(torrentItem, loadingPlaceholder);
         } else {
            torrentsList.appendChild(torrentItem);
        }
    }

    // Remove loading placeholder if present
    if (loadingPlaceholder) loadingPlaceholder.style.display = 'none';
}

// (removeTorrentElement, checkEmptyList - include as before)
function removeTorrentElement(infoHash) { /* ... */ }
function checkEmptyList() { /* ... */ }


// --- Socket.IO Connection & Handlers ---
// (socket event handlers 'connect', 'disconnect', 'connect_error', 'initialState', 'torrentUpdate', 'torrentRemove', 'torrentDone', 'torrentError' - Include as before, ensuring initialState/torrentUpdate call the updated renderTorrent)
 const socket = io(); // ... (rest of socket handlers) ...
socket.on('initialState', (torrents) => {
  console.log('Received initial state:', torrents);
  torrentsList.innerHTML = '';
  if(loadingPlaceholder) torrentsList.appendChild(loadingPlaceholder);
  if (torrents && torrents.length > 0) {
    // Use getMime function defined globally if needed for initial render too
    torrents.forEach(torrent => renderTorrent(torrent)); // Call the updated renderTorrent
  }
  checkEmptyList();
});
socket.on('torrentUpdate', (torrent) => {
  if (loadingPlaceholder) loadingPlaceholder.style.display = 'none';
  renderTorrent(torrent); // Call the updated renderTorrent
});
// ... other socket listeners


// --- User Interactions ---

// Add Torrent Form Submission
addTorrentForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const magnetURI = magnetUriInput.value.trim();
    if (!magnetURI) return;

    const submitButton = addTorrentForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = 'Adding...';
    addStatusMessage.textContent = ''; // Clear previous status
    addStatusMessage.className = 'status-message'; // Reset class

    try {
        const response = await fetch('/api/torrents/add', { /* ... */ });
        const result = await response.json().catch(() => ({}));

        if (response.ok) { // 2xx status
            magnetUriInput.value = '';
            addStatusMessage.textContent = 'Torrent addition initiated successfully!';
            addStatusMessage.classList.add('success');
        } else if (response.status === 409) { // Duplicate
             addStatusMessage.textContent = `Warning: ${result.message || 'Torrent already exists.'}`;
             addStatusMessage.classList.add('error'); // Use error class for warning too
        } else { // Other errors
             addStatusMessage.textContent = `Error: ${result.error || result.message || 'Server error adding torrent.'}`;
             addStatusMessage.classList.add('error');
        }
    } catch (error) {
         addStatusMessage.textContent = 'Network error: Could not contact server.';
         addStatusMessage.classList.add('error');
        console.error('Network error adding torrent:', error);
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'Add Magnet';
        // Optional: clear status message after a few seconds
        setTimeout(() => { addStatusMessage.textContent = ''; addStatusMessage.className = 'status-message'; }, 5000);
    }
});

// Handle Clicks within the Torrent List (Stream, Download, Remove)
torrentsList.addEventListener('click', async (e) => {
    // --- Stream Button Click ---
    if (e.target.classList.contains('stream-button')) {
        const button = e.target;
        const infoHash = button.dataset.infohash;
        const fileIndex = button.dataset.fileindex;
        const fileName = unescape(button.dataset.filename); // Unescape filename
        const type = button.dataset.type; // 'video' or 'audio'

        if (!infoHash || fileIndex === undefined) return;

        console.log(`Stream requested: ${fileName} (Type: ${type})`);
        const streamUrl = `/api/torrents/${infoHash}/stream/${fileIndex}`;
        showPlayer(streamUrl, type, fileName);
    }

    // --- Download Link Click ---
    // Using a standard link with 'download' attribute and correct route is simpler
    // Event listener delegation could potentially interfere, but direct links are fine.
    // No specific JS needed here if using <a href="..." download="...">

    // --- Remove Button Click ---
    if (e.target.classList.contains('remove')) {
        const button = e.target;
        const infoHash = button.dataset.infohash;
         if (!infoHash || !confirm('Are you sure you want to remove this torrent?')) return;

         button.disabled = true;
         button.textContent = 'Removing...';
        try {
            const response = await fetch(`/api/torrents/${infoHash}`, { method: 'DELETE' });
            // ... (rest of remove fetch logic, rely on WS for UI removal) ...
            if(!response.ok) {
                 const result = await response.json().catch(() => ({}));
                 alert(`Error removing: ${result.error || response.statusText}`);
                 button.disabled = false;
                 button.textContent = 'Remove';
            }
         } catch (error) {
              alert('Network error during removal.');
              button.disabled = false;
              button.textContent = 'Remove';
              console.error('Remove Error:', error);
         }
    }
});


// --- Player Modal Functions ---
function showPlayer(streamUrl, type, title) {
    playerTitle.textContent = `Streaming: ${title}`;
    playerContainer.innerHTML = ''; // Clear previous player

    let playerElement;
    if (type === 'video') {
        playerElement = document.createElement('video');
        playerElement.controls = true;
        playerElement.autoplay = true; // Optional: start playing automatically
        playerElement.preload = 'auto'; // Suggest browser preload metadata/some data
    } else if (type === 'audio') {
        playerElement = document.createElement('audio');
        playerElement.controls = true;
        playerElement.autoplay = true;
         playerElement.preload = 'auto';
    } else {
        console.error("Unsupported type for player:", type);
        return; // Don't show modal for unsupported types
    }

    playerElement.src = streamUrl;
    playerContainer.appendChild(playerElement);
    playerModal.style.display = 'block'; // Show the modal
}

function closePlayer() {
    playerModal.style.display = 'none'; // Hide the modal
    playerContainer.innerHTML = ''; // Clear the player (stops playback/loading)
    playerTitle.textContent = 'Streaming File'; // Reset title
}

// Close modal if user clicks outside the content area
window.onclick = function(event) {
    if (event.target == playerModal) {
        closePlayer();
    }
}

// Add mime library (can't use node's 'mime' directly in browser)
// We'll do simple extension checking instead, or rely on backend Content-Type
// Add a helper for basic type checking
function getMimeTypeSimple(filename) {
     const ext = filename.split('.').pop()?.toLowerCase();
     // Simple mapping - enhance as needed
     const mimeMap = {
         'mp4': 'video/mp4', 'mkv': 'video/x-matroska', 'webm': 'video/webm', 'mov': 'video/quicktime', 'avi': 'video/x-msvideo',
         'mp3': 'audio/mpeg', 'ogg': 'audio/ogg', 'wav': 'audio/wav', 'flac': 'audio/flac', 'aac': 'audio/aac', 'm4a': 'audio/mp4',
         // Add more types...
         'txt': 'text/plain', 'pdf': 'application/pdf', 'zip': 'application/zip'
     };
     return mimeMap[ext] || 'application/octet-stream';
}


// --- Initial Setup ---
checkEmptyList();

// Utility functions need to be accessible globally or passed where needed
window.formatBytes = formatBytes;
window.formatSpeed = formatSpeed;
window.msToTime = msToTime;
window.getMimeTypeSimple = getMimeTypeSimple; // Make accessible for renderTorrent if needed later

// Global MIME lookup (browser doesn't have easy access to the 'mime' npm package)
// For frontend decisions, we often rely on simple extension checks or let the browser figure it out from the Content-Type header set by the backend.
// We added simple video/audio extension checks directly in renderTorrent.
