const torrentsList = document.getElementById('torrents');
const addTorrentForm = document.getElementById('add-torrent-form');
const magnetUriInput = document.getElementById('magnet-uri');
const loadingPlaceholder = document.querySelector('.loading-placeholder');

// Format bytes nicely
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Format speed
function formatSpeed(bytesPerSecond) {
    return formatBytes(bytesPerSecond) + '/s';
}

// Render single torrent item
function renderTorrent(torrent) {
    let torrentItem = document.getElementById(`torrent-${torrent.infoHash}`);

    if (!torrentItem) {
        torrentItem = document.createElement('li');
        torrentItem.classList.add('torrent-item');
        torrentItem.id = `torrent-${torrent.infoHash}`;
        torrentsList.appendChild(torrentItem);
    }

    torrentItem.innerHTML = `
        <h3>${torrent.name || 'Loading metadata...'}</h3>
        <div class="info">
            <span>Peers: ${torrent.numPeers}</span> |
            <span>Down: ${formatSpeed(torrent.downloadSpeed)}</span> |
            <span>Up: ${formatSpeed(torrent.uploadSpeed)}</span> |
            <span>${formatBytes(torrent.downloaded)} / ${torrent.length ? formatBytes(torrent.length) : '?'}</span> |
            <span class="status">${torrent.done ? 'Done' : (torrent.paused ? 'Paused' : 'Downloading')}</span>
            ${torrent.timeRemaining && !torrent.done && !isNaN(torrent.timeRemaining) ? `| ETA: ${msToTime(torrent.timeRemaining)}` : ''}
        </div>
        <div class="progress-bar-container">
            <div class="progress-bar" style="width: ${torrent.progress}%">${torrent.progress}%</div>
        </div>
        <div class="actions">
            <!-- <button class="pause-resume" data-infohash="${torrent.infoHash}">${torrent.paused ? 'Resume' : 'Pause'}</button> -->
            <button class="remove" data-infohash="${torrent.infoHash}">Remove</button>
        </div>
        <div class="info-hash" style="font-size: 0.7em; color: #aaa; margin-top: 5px;">${torrent.infoHash}</div>
    `;
}

function msToTime(duration) {
    let seconds = Math.floor((duration / 1000) % 60),
        minutes = Math.floor((duration / (1000 * 60)) % 60),
        hours = Math.floor((duration / (1000 * 60 * 60)) % 24);
        days = Math.floor(duration / (1000 * 60 * 60 * 24));

    let timeString = "";
    if (days > 0) timeString += days + "d ";
    if (hours > 0 || days > 0) timeString += hours + "h ";
    if (minutes > 0 || hours > 0 || days > 0) timeString += minutes + "m ";
    timeString += seconds + "s";

    return timeString.trim() || '0s'; // Handle 0ms case
}

function removeTorrentElement(infoHash) {
    const torrentItem = document.getElementById(`torrent-${infoHash}`);
    if (torrentItem) {
        torrentItem.remove();
    }
    checkEmptyList();
}

function checkEmptyList() {
    const items = torrentsList.querySelectorAll('.torrent-item');
    if (items.length === 0 && loadingPlaceholder) {
        loadingPlaceholder.textContent = "No active torrents.";
        loadingPlaceholder.style.display = 'block';
    } else if (loadingPlaceholder) {
        loadingPlaceholder.style.display = 'none';
    }
}


// --- Socket.IO Connection ---
// Use the relative path which works when served from the same origin
// Or use the full Render URL in production if needed: const socket = io('https://your-app-name.onrender.com');
const socket = io();

socket.on('connect', () => {
    console.log('Connected to WebSocket server');
    // Clear any previous loading message
    if (loadingPlaceholder) loadingPlaceholder.textContent = 'Loading torrents...';
});

socket.on('disconnect', () => {
    console.log('Disconnected from WebSocket server');
    if (loadingPlaceholder) {
         loadingPlaceholder.textContent = 'Disconnected. Attempting to reconnect...';
         loadingPlaceholder.style.display = 'block';
    }
});

socket.on('connect_error', (err) => {
    console.error('Connection Error:', err);
     if (loadingPlaceholder) {
         loadingPlaceholder.textContent = `Connection Error: ${err.message}. Check server status.`;
         loadingPlaceholder.style.display = 'block';
    }
});


socket.on('initialState', (torrents) => {
    console.log('Received initial state:', torrents);
    torrentsList.innerHTML = ''; // Clear existing (like placeholder)
    if (torrents.length > 0) {
        torrents.forEach(renderTorrent);
    }
    checkEmptyList(); // Set empty message if needed
});

socket.on('torrentUpdate', (torrent) => {
    // console.log('Torrent update received:', torrent.infoHash);
    if (loadingPlaceholder) loadingPlaceholder.style.display = 'none';
    renderTorrent(torrent);
    checkEmptyList(); // Just in case
});

socket.on('torrentRemove', (data) => {
    console.log('Torrent removed:', data.infoHash);
    removeTorrentElement(data.infoHash);
    checkEmptyList();
});

socket.on('torrentDone', (data) => {
    console.log(`Torrent finished: ${data.name} (${data.infoHash})`);
    // Optionally add a visual indication besides the status update
    const item = document.getElementById(`torrent-${data.infoHash}`);
    if (item) {
        item.style.borderColor = 'lightgreen'; // Example highlight
    }
});

socket.on('torrentError', (data) => {
    console.error(`Error on torrent ${data.name} (${data.infoHash}): ${data.error}`);
    const item = document.getElementById(`torrent-${data.infoHash}`);
     if (item) {
        item.style.borderColor = 'red'; // Example highlight
        const statusEl = item.querySelector('.status');
        if(statusEl) statusEl.textContent = `Error: ${data.error}`;
     }
});


// --- Event Listeners ---

// Add torrent form submission
addTorrentForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const magnetURI = magnetUriInput.value.trim();
    if (!magnetURI) return;

    try {
        // Use fetch to call the backend API
        const response = await fetch('/api/torrents/add', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ magnetURI }),
        });

        const result = await response.json();

        if (response.ok) {
            console.log('Torrent add request sent:', result);
            magnetUriInput.value = ''; // Clear input
            if (response.status === 202) {
                // Addition initiated, wait for WebSocket update
            } else if (response.status === 200 || response.status === 409) { // Or if already exists (handled via WebSocket)
                 console.log(result.message)
            }

        } else {
            console.error('Failed to add torrent:', result.error);
            alert(`Error: ${result.error || 'Failed to add torrent'}`);
        }
    } catch (error) {
        console.error('Network or fetch error:', error);
        alert('Network error while adding torrent. Is the server running?');
    }
});

// Handle Remove clicks (using event delegation)
torrentsList.addEventListener('click', async (e) => {
    if (e.target.classList.contains('remove')) {
        const button = e.target;
        const infoHash = button.dataset.infohash;
        if (!infoHash || !confirm(`Are you sure you want to remove torrent ${infoHash}? This might delete downloaded files.`)) {
            return;
        }

        button.disabled = true; // Prevent double clicks
        button.textContent = 'Removing...';

        try {
             const response = await fetch(`/api/torrents/${infoHash}`, {
                method: 'DELETE',
             });
             const result = await response.json();

             if (response.ok) {
                 console.log(`Remove request successful for ${infoHash}`);
                 // Let the WebSocket event 'torrentRemove' handle UI update
                 // removeTorrentElement(infoHash); // Or remove immediately
             } else {
                 console.error(`Failed to remove torrent ${infoHash}:`, result.error);
                 alert(`Error removing torrent: ${result.error || 'Server error'}`);
                 button.disabled = false;
                 button.textContent = 'Remove';
             }

        } catch (error) {
             console.error('Network or fetch error during remove:', error);
             alert('Network error while removing torrent.');
             button.disabled = false;
             button.textContent = 'Remove';
        }
    }

    // TODO: Add Pause/Resume handling here if implemented
    /*
    if (e.target.classList.contains('pause-resume')) {
        const button = e.target;
        const infoHash = button.dataset.infohash;
        // Determine action based on current state (maybe add data-paused attribute)
        // Call POST /api/torrents/:infoHash/pause or /resume
    }
    */
});

// Initial check in case WS connection takes time or fails
checkEmptyList();
