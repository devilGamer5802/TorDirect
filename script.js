// Ensure WebTorrent is loaded
if (!WebTorrent.WEBRTC_SUPPORT) {
    log('WebRTC is not supported in this browser. WebTorrent will not work.');
    // You might want to disable the input/button here
}

// Get DOM elements
const torrentIdInput = document.getElementById('torrentIdInput');
const torrentFileInput = document.getElementById('torrentFileInput');
const startButton = document.getElementById('startButton');
const logsDiv = document.getElementById('logs');
const progressDiv = document.getElementById('progress');
const peersDiv = document.getElementById('peers');
const fileListUl = document.getElementById('fileList');
const playerDiv = document.getElementById('player');

let client = null; // Initialize client variable

// --- Logging Utility ---
function log(message) {
    console.log(message);
    const time = new Date().toLocaleTimeString();
    logsDiv.innerHTML = `[${time}] ${message}<br>` + logsDiv.innerHTML; // Prepend new logs
}

// --- Display Progress ---
function updateProgress(torrent) {
    const percent = (torrent.progress * 100).toFixed(2);
    const downloaded = formatBytes(torrent.downloaded);
    const total = formatBytes(torrent.length);
    const dlSpeed = formatBytes(torrent.downloadSpeed) + '/s';
    const ulSpeed = formatBytes(torrent.uploadSpeed) + '/s';
    const remaining = torrent.timeRemaining ? formatTime(torrent.timeRemaining / 1000) : 'N/A';

    progressDiv.innerHTML = `
        Progress: ${percent}% <br>
        Downloaded: ${downloaded} / ${total} <br>
        Speed: ↓ ${dlSpeed} / ↑ ${ulSpeed} <br>
        Time Remaining: ${remaining}
    `;
    peersDiv.innerText = `Peers: ${torrent.numPeers}`;
}

// --- Format Bytes ---
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// --- Format Time (seconds to H:M:S) ---
function formatTime(seconds) {
    const date = new Date(0);
    date.setSeconds(seconds);
    return date.toISOString().substr(11, 8);
}

// --- Display Files ---
function displayFiles(torrent) {
    fileListUl.innerHTML = ''; // Clear previous list
    playerDiv.innerHTML = '<h2>Streaming Player</h2>'; // Clear player

    torrent.files.forEach(file => {
        const li = document.createElement('li');
        li.textContent = `${file.name} (${formatBytes(file.length)})`;

        // Download Button
        const downloadButton = document.createElement('a'); // Use 'a' for direct download link
        downloadButton.textContent = 'Download';
        downloadButton.href = '#'; // Placeholder, will be updated
        downloadButton.download = file.name; // Suggest filename
        downloadButton.title = `Download ${file.name}`;
        downloadButton.addEventListener('click', (e) => {
            // Generate blob URL on demand
            log(`Generating download link for ${file.name}...`);
             e.target.textContent = 'Generating...';
             e.target.style.pointerEvents = 'none'; // Disable clicking while generating
            file.getBlobURL((err, url) => {
                if (err) {
                    log(`Error getting blob URL: ${err.message}`);
                     e.target.textContent = 'Error';
                    return;
                }
                log(`Download link ready for ${file.name}`);
                downloadButton.href = url;
                 e.target.textContent = 'Download Ready';
                 e.target.style.pointerEvents = 'auto';
                 // Optional: Programmatically click the link
                 // downloadButton.click();
            });
        });
        li.appendChild(downloadButton);


        // Stream Button (only for supported video/audio)
        const isStreamable = /\.(mp4|webm|ogg|mp3|wav|flac|aac|m4a)$/i.test(file.name);
        if (isStreamable) {
            const streamButton = document.createElement('button');
            streamButton.textContent = 'Stream';
            streamButton.title = `Stream ${file.name}`;
            streamButton.onclick = () => streamFile(file);
            li.appendChild(streamButton);
        }

        fileListUl.appendChild(li);
    });
}

// --- Stream File ---
function streamFile(file) {
    log(`Attempting to stream ${file.name}...`);
    playerDiv.innerHTML = '<h2>Streaming Player</h2>'; // Clear previous player

    const isVideo = /\.(mp4|webm|ogg)$/i.test(file.name);
    const isAudio = /\.(mp3|wav|flac|aac|m4a)$/i.test(file.name);

    if (isVideo) {
        const video = document.createElement('video');
        video.controls = true;
        video.autoplay = true; // Optional: start playing immediately
        playerDiv.appendChild(video);
        file.renderTo(video, (err, elem) => {
            if (err) return log(`Error rendering video: ${err.message}`);
            log(`Streaming ${file.name} in video player.`);
        });
    } else if (isAudio) {
        const audio = document.createElement('audio');
        audio.controls = true;
        audio.autoplay = true; // Optional
        playerDiv.appendChild(audio);
        file.renderTo(audio, (err, elem) => {
            if (err) return log(`Error rendering audio: ${err.message}`);
            log(`Streaming ${file.name} in audio player.`);
        });
    } else {
        log(`Cannot stream file type: ${file.name}`);
    }
}


// --- Start Download/Stream ---
function startTorrent(torrentId) {
    log(`Starting torrent: ${torrentId.substring(0, 30)}...`); // Log magnet or file name

    // Destroy previous client if exists to prevent resource leaks
    if (client) {
        log('Destroying previous torrent client instance.');
        client.destroy(err => {
            if (err) log(`Error destroying client: ${err.message}`);
            client = null; // Nullify client
            // Re-initialize and add the new torrent
            initializeAndAddTorrent(torrentId);
        });
    } else {
        // Initialize client for the first time
        initializeAndAddTorrent(torrentId);
    }
}

function initializeAndAddTorrent(torrentId) {
    log('Initializing WebTorrent client...');
    client = new WebTorrent();

    client.on('error', err => {
        log(`Client error: ${err.message}`);
        // Optionally, try to destroy/reset client here
        progressDiv.innerHTML = 'Client Error!';
        peersDiv.innerText = '';
    });

    log('Adding torrent...');
    progressDiv.innerHTML = 'Adding torrent...';
    peersDiv.innerText = '';
    fileListUl.innerHTML = '';
    playerDiv.innerHTML = '<h2>Streaming Player</h2>';

    client.add(torrentId, torrent => {
        log(`Torrent added: ${torrent.name} (${torrent.infoHash})`);
        log('Fetching metadata and connecting to peers...');
        progressDiv.innerHTML = 'Fetching metadata...';

        torrent.on('metadata', () => {
            log('Metadata received.');
            displayFiles(torrent);
        });

        torrent.on('ready', () => {
            log('Torrent ready to download/stream.');
            updateProgress(torrent); // Initial progress
            if (!torrent.files || torrent.files.length === 0) {
                log('No files found in torrent (might still be fetching metadata or empty torrent).');
            } else if (!document.getElementById('fileList').hasChildNodes()) {
                // Display files again if 'ready' comes after 'metadata' but files weren't shown
                 displayFiles(torrent);
            }
        });

        torrent.on('download', bytes => {
            updateProgress(torrent);
        });

        torrent.on('upload', bytes => {
            updateProgress(torrent); // Update upload speed too
        });

        torrent.on('done', () => {
            log(`Torrent finished downloading: ${torrent.name}`);
            updateProgress(torrent); // Final update
            // Optionally add visual indication of completion
        });

        torrent.on('error', err => {
            log(`Torrent error: ${err.message}`);
             progressDiv.innerHTML = 'Torrent Error!';
        });

        // Initial display in case metadata is already available
        if (torrent.metadata) {
            displayFiles(torrent);
        }
         updateProgress(torrent); // Show initial stats like peer count even before ready
    });
}


// --- Event Listeners ---
startButton.addEventListener('click', () => {
    const torrentId = torrentIdInput.value.trim();
    const file = torrentFileInput.files[0];

    if (file) {
        log(`Selected file: ${file.name}`);
        startTorrent(file); // Start with the file object
        torrentIdInput.value = ''; // Clear the text input
    } else if (torrentId) {
        startTorrent(torrentId); // Start with the magnet link/hash
        torrentFileInput.value = ''; // Clear the file input
    } else {
        log('Please enter a magnet link or select a .torrent file.');
    }
});

// Optional: Clear file input if text is entered, and vice versa
torrentIdInput.addEventListener('input', () => {
    if (torrentIdInput.value.trim() !== '') {
        torrentFileInput.value = ''; // Clear file input
    }
});
torrentFileInput.addEventListener('change', () => {
    if (torrentFileInput.files.length > 0) {
        torrentIdInput.value = ''; // Clear text input
    }
});

log('WebTorrent Client Initialized. Ready for input.');
