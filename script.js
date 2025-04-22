// --- Initial Checks & Setup ---

// Ensure WebTorrent is loaded and supported
if (typeof WebTorrent === 'undefined') {
    console.error("WebTorrent library not loaded!");
    alert("Error: WebTorrent library failed to load. The application cannot start.");
} else if (!WebTorrent.WEBRTC_SUPPORT) {
    log('WebRTC is not supported in this browser. WebTorrent functionality will be limited or non-functional.');
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
                 const tempLink = document.createElement('a');
                 tempLink.href = url;
                 tempLink.download = file.name;
                 document.body.appendChild(tempLink);
                 tempLink.click();
                 document.body.removeChild(tempLink);
                  e.target.textContent = 'Download'; // Reset button
                  e.target.style.opacity = '1';
                  e.target.style.pointerEvents = 'auto';
             });
        };
        buttonContainer.appendChild(downloadButton);


        // Stream Button (only for supported video/audio types)
        // Note: VideoStream compatibility might vary. Check its docs for supported formats.
        const isStreamable = /\.(mp4|webm|mkv|ogg|ogv|oga|opus|mp3|wav|aac|m4a|flac)$/i.test(file.name);
        if (isStreamable) {
            const streamButton = document.createElement('button');
            streamButton.textContent = 'Stream';
            streamButton.title = `Stream ${file.name}`;
            streamButton.onclick = () => streamFile(file); // Call the VideoStream-based function
            buttonContainer.appendChild(streamButton);
        }

        li.appendChild(buttonContainer);
        fileListUl.appendChild(li);
    });
}

// Stream File (Modified to use VideoStream)
function streamFile(file) {
    if (!playerDiv) {
        log("Error: Player element not found.");
        return;
    }

    // *** Check if the VideoStream library is loaded ***
    if (typeof VideoStream === 'undefined') {
        log("Error: VideoStream library is not loaded. Make sure it's included correctly in index.html.");
        playerDiv.innerHTML = '<h2>Streaming Player</h2><p style="color:red;">Error: Streaming library (VideoStream) not found. Check setup.</p>';
        return; // Stop execution if library is missing
    }

    log(`Attempting to stream ${file.name} using VideoStream...`);
    playerDiv.innerHTML = '<h2>Streaming Player</h2>'; // Clear previous player

    // Create the video element (can also be <audio>)
    // Determine if video or audio based on extension (basic check)
    let mediaElement;
    if (/\.(mp4|webm|mkv|ogg|ogv)$/i.test(file.name)) {
        mediaElement = document.createElement('video');
        log('Creating <video> element.');
    } else if (/\.(mp3|wav|aac|m4a|flac|opus|oga)$/i.test(file.name)) {
        mediaElement = document.createElement('audio');
         log('Creating <audio> element.');
    } else {
        log(`Warning: Unsure if ${file.name} is video or audio for VideoStream, defaulting to <video>.`);
        mediaElement = document.createElement('video'); // Default or handle differently
    }

    mediaElement.controls = true;
    mediaElement.autoplay = true;
    mediaElement.style.maxWidth = '100%';
    mediaElement.style.marginTop = '10px';
    mediaElement.style.backgroundColor = '#000'; // Background while loading

    // Append the media element first so errors can be displayed in context
    playerDiv.appendChild(mediaElement);

    // The WebTorrent file object should have the required `createReadStream` method
    log(`Initializing VideoStream for ${file.name}`);
    let streamHandler;
    try {
        // Pass the WebTorrent file object and the created media element
         streamHandler = new VideoStream(file, mediaElement);
    } catch (err) {
         log(`Error initializing VideoStream: ${err.message}`);
         console.error("VideoStream Initialization Error:", err);
         mediaElement.outerHTML = `<p style="color:red;">Error initializing streaming library for ${file.name}.</p>`; // Replace element with error
         return;
    }

    // Add error listener directly to the media element
    mediaElement.addEventListener('error', () => {
        const errorCode = mediaElement.error ? mediaElement.error.code : 'N/A';
        const errorMsg = mediaElement.error ? mediaElement.error.message : 'Unknown media element error';
        // streamHandler.detailedError might provide more specific info
        const detailedError = streamHandler && streamHandler.detailedError ? streamHandler.detailedError : 'No detailed error available.';

        log(`Media Element Error (Code ${errorCode}): ${errorMsg}. Detailed: ${detailedError}`);
        console.error('Media Element Error:', mediaElement.error, 'VideoStream Detailed Error:', detailedError);

        // Display error in the UI
        const errorP = document.createElement('p');
        errorP.style.color = 'red';
        errorP.innerHTML = `Error playing ${file.name}.<br>Code: ${errorCode}<br>Message: ${errorMsg}<br>Details: ${detailedError}`;
        // Append error message after the media element if it still exists
        if(playerDiv.contains(mediaElement)) {
             playerDiv.insertBefore(errorP, mediaElement.nextSibling);
        } else {
             playerDiv.appendChild(errorP); // Append if element was removed
        }
    });

    // Optional: Listen for other events
    mediaElement.addEventListener('loadstart', () => log(`Media load started for ${file.name}`));
    mediaElement.addEventListener('canplay', () => log(`Media is ready to play: ${file.name}`));
    mediaElement.addEventListener('waiting', () => log(`Media playback waiting (buffering) for ${file.name}`));
    mediaElement.addEventListener('playing', () => log(`Media playback started/resumed for ${file.name}`));
    mediaElement.addEventListener('ended', () => log(`Media playback finished for ${file.name}`));

    log(`VideoStream setup complete for ${file.name}. Playback should start.`);
}


// Start Download/Stream Process
function startTorrent(torrentId) {
    log(`Starting torrent process for: ${typeof torrentId === 'string' ? torrentId.substring(0, 50)+'...' : torrentId.name}`);

    if (client) {
        log('Destroying previous torrent instance...');
        client.destroy(err => {
            if (err) {
                log(`Error destroying previous client: ${err.message}`);
            } else {
                log('Previous client destroyed successfully.');
            }
            client = null;
            initializeAndAddTorrent(torrentId);
        });
    } else {
        initializeAndAddTorrent(torrentId);
    }
}

// Initialize WebTorrent Client and Add Torrent
function initializeAndAddTorrent(torrentId) {
    log('Initializing new WebTorrent client...');
    const options = {}; // Add tracker/RTC config here if needed
    client = new WebTorrent(options);

    client.on('error', err => {
        log(`WebTorrent Client Error: ${err.message}`);
        if (progressDiv) progressDiv.innerHTML = 'Client Error! Check console.';
        if (peersDiv) peersDiv.innerText = '';
    });

    log('Adding torrent to client...');
    if (progressDiv) progressDiv.innerHTML = 'Connecting to peers...';
    if (peersDiv) peersDiv.innerText = '';
    if (fileListUl) fileListUl.innerHTML = '';
    if (playerDiv) playerDiv.innerHTML = '<h2>Streaming Player</h2>';

    try {
        const torrentInstance = client.add(torrentId, torrent => { // Renamed variable to avoid conflict
            // --- Callback when METADATA IS READY ---
            log(`Torrent metadata ready: ${torrent.name} (${torrent.infoHash})`);
            log('Peers will connect and download will begin.');
            if (progressDiv) progressDiv.innerHTML = 'Connecting / Downloading...';
            displayFiles(torrent);
            updateProgress(torrent);

            torrent.on('warning', err => log(`Torrent warning (${torrent.name}): ${err.message}`));
            torrent.on('error', err => {
                 log(`Torrent error (${torrent.name}): ${err.message}`);
                 if (progressDiv) progressDiv.innerHTML = 'Torrent Error! Check console.';
                 updateProgress(torrent);
            });
            torrent.on('download', bytes => updateProgress(torrent));
            torrent.on('upload', bytes => updateProgress(torrent));
            torrent.on('done', () => {
                log(`Torrent finished downloading: ${torrent.name}`);
                updateProgress(torrent);
                if (progressDiv) progressDiv.innerHTML += '<br><strong>Download Complete!</strong>';
            });
            torrent.on('wire', (wire, addr) => {
                 log(`Connected to peer: ${addr || 'Unknown Address'}`);
                 updateProgress(torrent);
            });

            // Refresh display/progress again just in case
            if (!document.getElementById('fileList').hasChildNodes() && torrent.files.length > 0) {
                 displayFiles(torrent);
            }
            updateProgress(torrent);
        });

        // --- Runs immediately after .add() ---
        log(`Torrent added to client (infohash: ${torrentInstance.infoHash}). Waiting for metadata...`);
        if (progressDiv) progressDiv.innerHTML = 'Fetching metadata...';
        updateProgress(torrentInstance); // Show early peer count etc.

        // Handle torrents ready/metadata immediately
        if (torrentInstance.ready) {
             log('Torrent was ready immediately.');
             displayFiles(torrentInstance);
             updateProgress(torrentInstance);
        } else if (torrentInstance.metadata) {
             log('Torrent had metadata immediately.');
             displayFiles(torrentInstance);
             updateProgress(torrentInstance);
        }

    } catch (err) {
        log(`Error adding torrent: ${err.message}. Likely invalid magnet link or file.`);
         if (progressDiv) progressDiv.innerHTML = 'Invalid Torrent ID/File';
        if (client) {
            client.destroy();
            client = null;
        }
    }
}


// --- Initialization and Event Listeners ---

// Check if essential elements exist
if (!torrentIdInput || !torrentFileInput || !startButton || !logsDiv || !progressDiv || !peersDiv || !fileListUl || !playerDiv) {
    console.error("CRITICAL: One or more essential HTML elements were not found! Check IDs in index.html.");
    log("Error: Page elements missing. Cannot initialize functionality.");
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
            startTorrent(file);
            torrentIdInput.value = '';
        } else if (torrentId) {
            if (torrentId.startsWith('magnet:') || /^[a-fA-F0-9]{40}$/.test(torrentId) || /^[a-fA-F0-9]{32}$/.test(torrentId)) {
                 log(`Processing input ID/Magnet: ${torrentId.substring(0,50)}...`);
                 startTorrent(torrentId);
                 torrentFileInput.value = '';
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
        if (torrentIdInput.value.trim() !== '' && torrentFileInput) {
            torrentFileInput.value = '';
        }
    });
    console.log("Input listener added to torrentIdInput.");

    torrentFileInput.addEventListener('change', () => {
        console.log('File input changed!');
        if (torrentFileInput.files.length > 0) {
            const selectedFile = torrentFileInput.files[0];
            console.log('File selected:', selectedFile.name);
            log(`File selected via input: ${selectedFile.name}`);
            if (torrentIdInput) torrentIdInput.value = '';
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
