// --- Initial Checks & Setup ---

// Ensure WebTorrent is loaded and supported
if (typeof WebTorrent === 'undefined') {
    console.error("WebTorrent library not loaded!");
    alert("Error: WebTorrent library failed to load. The application cannot start.");
    // You might want to disable inputs here
} else if (!WebTorrent.WEBRTC_SUPPORT) {
    log('WebRTC is not supported in this browser. WebTorrent functionality will be limited or non-functional.');
    // Optionally disable inputs/button
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
    console.log(message); // Also log to browser console for debugging
    if (logsDiv) {
        const time = new Date().toLocaleTimeString();
        // Sanitize message slightly to prevent accidental HTML injection if logging filenames etc.
        const sanitizedMessage = message.toString().replace(/</g, "<").replace(/>/g, ">");
        logsDiv.innerHTML = `[${time}] ${sanitizedMessage}<br>` + logsDiv.innerHTML; // Prepend new logs
    } else {
        console.error("Log element (#logs) not found!");
    }
}

// --- Utility Functions ---

// Display Progress
function updateProgress(torrent) {
    if (!progressDiv || !peersDiv) return; // Element check

    const percent = (torrent.progress * 100).toFixed(2);
    const downloaded = formatBytes(torrent.downloaded);
    const total = formatBytes(torrent.length);
    const dlSpeed = formatBytes(torrent.downloadSpeed) + '/s';
    const ulSpeed = formatBytes(torrent.uploadSpeed) + '/s';
    // Calculate remaining time safely
    let remaining = 'N/A';
    if (torrent.downloadSpeed > 0 && torrent.length && torrent.length > torrent.downloaded) {
         const remainingBytes = torrent.length - torrent.downloaded;
         const secondsRemaining = remainingBytes / torrent.downloadSpeed;
         remaining = formatTime(secondsRemaining);
    } else if (torrent.progress === 1) {
        remaining = 'Done';
    }

    progressDiv.innerHTML = `
        Progress: ${percent}% <br>
        Downloaded: ${downloaded} / ${total} <br>
        Speed: ↓ ${dlSpeed} / ↑ ${ulSpeed} <br>
        Time Remaining: ${remaining}
    `;
    peersDiv.innerText = `Peers: ${torrent.numPeers}`;
}

// Format Bytes
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0 || !bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Format Time (seconds to H:M:S)
function formatTime(seconds) {
     if (!seconds || seconds === Infinity || seconds < 0) return 'N/A';
    const date = new Date(0);
    date.setSeconds(seconds);
    return date.toISOString().substr(11, 8);
}

// --- Core Torrent Handling ---

// Display Files
function displayFiles(torrent) {
    if (!fileListUl || !playerDiv) return; // Element check
    fileListUl.innerHTML = ''; // Clear previous list
    playerDiv.innerHTML = '<h2>Streaming Player</h2>'; // Clear player

    if (!torrent.files || torrent.files.length === 0) {
        log("No files found in torrent yet, or torrent is empty.");
        const li = document.createElement('li');
        li.textContent = "Waiting for file information...";
        fileListUl.appendChild(li);
        return;
    }

    log(`Displaying ${torrent.files.length} file(s) for torrent: ${torrent.name}`);

    torrent.files.forEach((file, index) => {
        const li = document.createElement('li');

        // File Name and Size Span
        const fileInfoSpan = document.createElement('span');
        fileInfoSpan.textContent = `${file.name} (${formatBytes(file.length)})`;
        li.appendChild(fileInfoSpan);

        // Buttons Container
        const buttonContainer = document.createElement('div');
        buttonContainer.style.whiteSpace = 'nowrap'; // Keep buttons together

        // Download Button (using getBlobURL for better memory management)
        const downloadButton = document.createElement('a');
        downloadButton.textContent = 'Download';
        downloadButton.href = '#'; // Placeholder
        downloadButton.download = file.name; // Suggest filename
        downloadButton.title = `Download ${file.name}`;
        downloadButton.onclick = (e) => {
             e.preventDefault(); // Prevent following '#' link
             log(`Preparing download for ${file.name}...`);
             e.target.textContent = 'Generating...';
             e.target.style.opacity = '0.6';
             e.target.style.pointerEvents = 'none';

             file.getBlobURL((err, url) => {
                 if (err) {
                     log(`Error getting blob URL for ${file.name}: ${err.message}`);
                     e.target.textContent = 'Error';
                      e.target.style.opacity = '1';
                      e.target.style.pointerEvents = 'auto';
                     return;
                 }
                 if (!url) {
                     log(`Failed to generate blob URL for ${file.name} (maybe cancelled?).`);
                      e.target.textContent = 'Download'; // Reset button
                      e.target.style.opacity = '1';
                      e.target.style.pointerEvents = 'auto';
                     return;
                 }
                 log(`Download link generated for ${file.name}. Starting download.`);
                 // Create a temporary link and click it
                 const tempLink = document.createElement('a');
                 tempLink.href = url;
                 tempLink.download = file.name;
                 document.body.appendChild(tempLink);
                 tempLink.click();
                 document.body.removeChild(tempLink);
                 // Maybe revoke the URL after a delay? Might interfere with slow downloads.
                 // setTimeout(() => URL.revokeObjectURL(url), 60000);
                  e.target.textContent = 'Download'; // Reset button
                  e.target.style.opacity = '1';
                  e.target.style.pointerEvents = 'auto';
             });
        };
        buttonContainer.appendChild(downloadButton);


        // Stream Button (only for supported video/audio types)
        const isStreamable = /\.(mp4|webm|mkv|ogg|ogv|oga|opus|mp3|wav|aac|m4a|flac)$/i.test(file.name); // Added mkv, more audio
        if (isStreamable) {
            const streamButton = document.createElement('button');
            streamButton.textContent = 'Stream';
            streamButton.title = `Stream ${file.name}`;
            streamButton.onclick = () => streamFile(file);
            buttonContainer.appendChild(streamButton);
        }

        li.appendChild(buttonContainer);
        fileListUl.appendChild(li);
    });
}

// Stream File
function streamFile(file) {
    if (!playerDiv) return; // Element check
    log(`Attempting to stream ${file.name}...`);
    playerDiv.innerHTML = '<h2>Streaming Player</h2>'; // Clear previous player

    // Use file.appendTo for efficient streaming
    file.appendTo(playerDiv, { autoplay: true, controls: true }, (err, elem) => {
        if (err) {
            log(`Error streaming ${file.name}: ${err.message}`);
            // Try to provide more context if it's a known issue
            if (err.message.includes('Unsupported file type') || err.message.includes('Cannot play media')) {
                 playerDiv.innerHTML += `<p style="color: yellow;">Could not stream "${file.name}". Browser may not support this file format directly.</p>`;
            } else {
                 playerDiv.innerHTML += `<p style="color: red;">An error occurred while trying to stream "${file.name}".</p>`;
            }
        } else {
            log(`Streaming ${file.name} in player.`);
            elem.style.maxWidth = '100%'; // Ensure element fits container
            elem.style.marginTop = '10px';
        }
    });
}


// Start Download/Stream Process
function startTorrent(torrentId) {
    log(`Starting torrent process for: ${typeof torrentId === 'string' ? torrentId.substring(0, 50)+'...' : torrentId.name}`);

    // Destroy previous client instance cleanly if it exists
    if (client) {
        log('Destroying previous torrent instance...');
        // Store files temporarily if needed, although usually want a fresh start
        // const previousFiles = client.torrents.length > 0 ? client.torrents[0].files : [];

        client.destroy(err => {
            if (err) {
                log(`Error destroying previous client: ${err.message}`);
                // Proceed with caution, might have resource leaks
            } else {
                log('Previous client destroyed successfully.');
            }
            client = null; // Ensure client is nullified before re-initializing
            initializeAndAddTorrent(torrentId); // Proceed to initialize new client
        });
    } else {
        // Initialize client for the first time
        initializeAndAddTorrent(torrentId);
    }
}

// Initialize WebTorrent Client and Add Torrent
function initializeAndAddTorrent(torrentId) {
    log('Initializing new WebTorrent client...');
    // Explicitly set tracker options if needed (example)
    const options = {
        // tracker: {
        //    rtcConfig: { // Example STUN/TURN servers (use public ones or your own)
        //        iceServers: [
        //            { urls: 'stun:stun.l.google.com:19302' },
        //            { urls: 'stun:global.stun.twilio.com:3478?transport=udp' }
        //        ]
        //    }
        //}
    };
    client = new WebTorrent(options);

    client.on('error', err => {
        log(`WebTorrent Client Error: ${err.message}`);
        if (progressDiv) progressDiv.innerHTML = 'Client Error! Check console.';
        if (peersDiv) peersDiv.innerText = '';
        // Consider destroying the client here if the error is fatal
        // client.destroy(); client = null;
    });

    log('Adding torrent to client...');
    if (progressDiv) progressDiv.innerHTML = 'Connecting to peers...';
    if (peersDiv) peersDiv.innerText = '';
    if (fileListUl) fileListUl.innerHTML = '';
    if (playerDiv) playerDiv.innerHTML = '<h2>Streaming Player</h2>';

    // Use try-catch for the initial add, as invalid magnet links can throw
    try {
        const torrent = client.add(torrentId, torrent => {
             // --- THIS CALLBACK IS CALLED WHEN METADATA IS READY ---
            log(`Torrent metadata ready: ${torrent.name} (${torrent.infoHash})`);
            log('Peers will connect and download will begin.');
             if (progressDiv) progressDiv.innerHTML = 'Connecting / Downloading...'; // Update status
            displayFiles(torrent); // Display files as soon as metadata is known
            updateProgress(torrent); // Show initial stats

            torrent.on('warning', err => {
                log(`Torrent warning (${torrent.name}): ${err.message}`);
            });

            torrent.on('error', err => {
                 log(`Torrent error (${torrent.name}): ${err.message}`);
                 if (progressDiv) progressDiv.innerHTML = 'Torrent Error! Check console.';
                 updateProgress(torrent); // Update stats even on error
            });

            torrent.on('download', bytes => {
                // This can fire very frequently, update progress less often if needed
                // Throttle updateProgress if performance is an issue
                 updateProgress(torrent);
            });

            torrent.on('upload', bytes => {
                 updateProgress(torrent); // Update upload speed too
            });

            torrent.on('done', () => {
                log(`Torrent finished downloading: ${torrent.name}`);
                updateProgress(torrent); // Final update
                 // Add a visual cue if possible, e.g., green border or icon
                 if (progressDiv) progressDiv.innerHTML += '<br><strong>Download Complete!</strong>';
            });

             // Update peer count explicitly on wire events
             torrent.on('wire', (wire, addr) => {
                 log(`Connected to peer: ${addr || 'Unknown Address'}`);
                 updateProgress(torrent); // numPeers should be updated
            });
             // Note: There isn't a specific 'peer disconnected' event easily accessible here.
             // Rely on the periodic updates or numPeers property.

             // Initial display/update just in case
            if (!document.getElementById('fileList').hasChildNodes() && torrent.files.length > 0) {
                 displayFiles(torrent);
            }
             updateProgress(torrent);
        });

         // --- THIS CODE RUNS IMMEDIATELY AFTER .add() IS CALLED ---
        log(`Torrent added to client (infohash: ${torrent.infoHash}). Waiting for metadata...`);
         if (progressDiv) progressDiv.innerHTML = 'Fetching metadata...';
        updateProgress(torrent); // Show peer count early if available

        // Handle torrents that might already be ready/have metadata instantly (e.g., from cache)
        if (torrent.ready) {
             log('Torrent was ready immediately.');
             displayFiles(torrent);
             updateProgress(torrent);
        } else if (torrent.metadata) {
             log('Torrent had metadata immediately.');
              displayFiles(torrent);
             updateProgress(torrent);
        }


    } catch (err) {
        log(`Error adding torrent: ${err.message}. Likely invalid magnet link or file.`);
         if (progressDiv) progressDiv.innerHTML = 'Invalid Torrent ID/File';
        if (client) {
            client.destroy(); // Clean up failed client instance
            client = null;
        }
    }
}


// --- Initialization and Event Listeners ---

// Check if essential elements exist
if (!torrentIdInput || !torrentFileInput || !startButton || !logsDiv || !progressDiv || !peersDiv || !fileListUl || !playerDiv) {
    console.error("CRITICAL: One or more essential HTML elements were not found! Check IDs in index.html.");
    log("Error: Page elements missing. Cannot initialize functionality.");
    // Optionally disable the start button if it exists
    if (startButton) startButton.disabled = true;
} else {
    console.log("All essential HTML elements found.");

    // --- Event Listeners ---
    startButton.addEventListener('click', () => {
        console.log('Start button clicked!');
        log('Start button clicked...');

        const torrentId = torrentIdInput.value.trim();
        const file = torrentFileInput.files.length > 0 ? torrentFileInput.files[0] : null;

        console.log('Torrent ID input value:', torrentId);
        console.log('Selected file object:', file);

        if (file) {
            log(`Processing selected file: ${file.name}`);
            startTorrent(file); // Start with the file object
            torrentIdInput.value = ''; // Clear the text input
        } else if (torrentId) {
            // Basic validation for magnet links
            if (torrentId.startsWith('magnet:') || /^[a-fA-F0-9]{40}$/.test(torrentId) || /^[a-fA-F0-9]{32}$/.test(torrentId)) {
                 log(`Processing input ID/Magnet: ${torrentId.substring(0,50)}...`);
                 startTorrent(torrentId); // Start with the magnet link/hash
                 torrentFileInput.value = ''; // Clear the file input
            } else {
                 log('Input Error: Invalid Magnet URI or Info Hash format.');
                 console.log('Invalid magnet/hash format.');
            }
        } else {
            log('Input Error: Please enter a magnet link/info hash or select a .torrent file.');
            console.log('No valid input found.');
        }
    });
    console.log("Click listener added to startButton.");

    // Clear other input when one is used
    torrentIdInput.addEventListener('input', () => {
        if (torrentIdInput.value.trim() !== '') {
            torrentFileInput.value = ''; // Clear file input
        }
    });
    console.log("Input listener added to torrentIdInput.");

    torrentFileInput.addEventListener('change', () => {
        console.log('File input changed!');
        if (torrentFileInput.files.length > 0) {
            console.log('File selected:', torrentFileInput.files[0].name);
            log(`File selected via input: ${torrentFileInput.files[0].name}`);
            torrentIdInput.value = ''; // Clear text input
        } else {
            console.log('File input cleared or no file selected.');
        }
    });
    console.log("Change listener added to torrentFileInput.");

    // Initial log messages
    log('WebTorrent Client UI Initialized. Ready for input.');
    log("--------------------------------------------------");
    log("LEGAL DISCLAIMER: Only use this tool for content you have the legal right to share and download.");
    log("Downloading copyrighted material without permission may be illegal in your jurisdiction.");
    log("--------------------------------------------------");

} // End of check for essential elements
