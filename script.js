// --- Constants & Configuration ---
// List of reliable public STUN servers (essential for WebRTC NAT traversal)
const RTC_CONFIG = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        // *** FIX HERE: Removed ?transport=udp ***
        { urls: 'stun:global.stun.twilio.com:3478' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun.services.mozilla.com' },
        // Add more STUN servers if needed.
        // {
        //   urls: 'turn:your-turn-server.com:3478',
        //   username: 'your_username',
        //   credential: 'your_password'
        // }
    ]
};

// List of reliable public WebSocket (WSS) trackers
// These help connect browser peers that WebTorrent can talk to.
// List of reliable public WebSocket (WSS) trackers
// These help connect browser peers that WebTorrent can talk to.
const DEFAULT_TRACKERS = [
    'wss://tracker.openwebtorrent.com', // Didn't show error in logs
    'wss://tracker.btorrent.xyz',     // Didn't show error in logs
    // Keep webtorrent.io as it's standard, might have been temporary
    'wss://tracker.webtorrent.io',
    // Add a few more public alternatives
    'wss://tracker.webtorrent.dev',
    'wss://tracker.files.fm:7073/announce', // Keep this one too, might be back online
    'wss://spacetracker.org:443/announce', // Keep this one too
    'wss://tracker.peerweb.site:443/announce'
    // Note: UDP/HTTP trackers won't work directly in the browser.
];

// --- Initial Checks & Global Setup ---
if (typeof WebTorrent === 'undefined') {
    console.error("WebTorrent library not loaded!");
    alert("Error: WebTorrent library failed to load. The application cannot start.");
    // Optionally disable UI elements if needed
} else if (!WebTorrent.WEBRTC_SUPPORT) {
    log('Warning: WebRTC is not supported in this browser. Peer-to-peer functionality will be severely limited or non-functional. Downloads might rely solely on Web Seeds if available.');
}

// Get references to essential DOM elements (cached for performance)
const torrentIdInput = document.getElementById('torrentIdInput');
const torrentFileInput = document.getElementById('torrentFileInput');
const startButton = document.getElementById('startButton');
const logsDiv = document.getElementById('logs');
const progressDiv = document.getElementById('progress');
const peersDiv = document.getElementById('peers');
const fileListUl = document.getElementById('fileList');
const playerDiv = document.getElementById('player');

let client = null; // Holds the WebTorrent client instance
let currentTorrentInfoHash = null; // Track the currently active torrent

// --- Logging Utility ---
function log(message) {
    console.log(message); // Also log to browser console for debugging
    if (logsDiv) {
        const time = new Date().toLocaleTimeString();
        // Basic sanitization: prevent raw HTML injection, allow basic entities
        const sanitizedMessage = String(message).replace(/</g, "<").replace(/>/g, ">");
        // Prepend new logs, limit total log lines if it becomes too much
        const maxLogLines = 100;
        const lines = logsDiv.innerHTML.split('<br>').slice(0, maxLogLines - 1);
        logsDiv.innerHTML = `[${time}] ${sanitizedMessage}<br>${lines.join('<br>')}`;
    } else if (document.readyState === 'complete' || document.readyState === 'interactive') {
        console.error("Log element (#logs) not found!");
    }
}

// --- Utility Functions ---

// Updates the progress display area
function updateProgress(torrent) {
    if (!progressDiv || !peersDiv || !torrent) return; // Ensure elements and torrent exist

    const percent = (torrent.progress * 100).toFixed(2);
    const downloaded = formatBytes(torrent.downloaded);
    const total = formatBytes(torrent.length); // `length` is total size
    const dlSpeed = formatBytes(torrent.downloadSpeed) + '/s';
    const ulSpeed = formatBytes(torrent.uploadSpeed) + '/s';
    let remaining = 'Calculating...';

    // Ensure properties needed for calculation exist and are valid
    const isValidForRemainingCalc = torrent.progress < 1 &&
                                  torrent.downloadSpeed > 0 &&
                                  typeof torrent.length === 'number' &&
                                  torrent.length > 0 &&
                                  typeof torrent.downloaded === 'number';

    if (torrent.done) {
        remaining = 'Done';
    } else if (isValidForRemainingCalc) {
        const remainingBytes = torrent.length - torrent.downloaded;
        if (remainingBytes > 0) {
             const secondsRemaining = remainingBytes / torrent.downloadSpeed;
             remaining = formatTime(secondsRemaining);
        } else {
             remaining = 'Nearly done...'; // Downloaded might slightly exceed length sometimes
        }
    } else if (torrent.progress > 0 && torrent.downloadSpeed === 0) {
        remaining = 'Stalled';
    } else if (torrent.progress === 0 && !torrent.downloadSpeed) {
        remaining = 'Connecting...';
    }

    progressDiv.innerHTML = `
        Progress: <strong>${percent}%</strong> <br>
        Downloaded: ${downloaded} / ${total} <br>
        Speed: ↓ ${dlSpeed} / ↑ ${ulSpeed} <br>
        Time Remaining: ${remaining}
    `;
    peersDiv.innerText = `Peers: ${torrent.numPeers}`;
}

// Formats byte values into human-readable strings (KB, MB, GB etc.)
function formatBytes(bytes, decimals = 2) {
    // Handle edge cases and invalid input gracefully
    if (typeof bytes !== 'number' || isNaN(bytes) || bytes < 0) return 'N/A';
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

    // Calculate index, prevent potential issues with log(0) or negative numbers
    const i = Math.max(0, Math.floor(Math.log(bytes) / Math.log(k)));
    const validIndex = Math.min(i, sizes.length - 1); // Ensure index is within bounds

    return parseFloat((bytes / Math.pow(k, validIndex)).toFixed(dm)) + ' ' + sizes[validIndex];
}

// Formats seconds into HH:MM:SS string
function formatTime(seconds) {
    // Handle invalid, non-finite, or negative inputs
    if (typeof seconds !== 'number' || !isFinite(seconds) || seconds < 0) return 'N/A';

    try {
        // Use integer seconds to avoid potential floating point issues with Date
        const totalSeconds = Math.round(seconds);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const secs = totalSeconds % 60;

        // Pad with leading zeros
        const hoursStr = String(hours).padStart(2, '0');
        const minutesStr = String(minutes).padStart(2, '0');
        const secsStr = String(secs).padStart(2, '0');

        return `${hoursStr}:${minutesStr}:${secsStr}`;
    } catch (e) {
        console.error("Error formatting time:", e);
        return 'N/A'; // Return gracefully on unexpected errors
    }
}


// --- Core Torrent Handling ---

// Renders the list of files in the torrent
function displayFiles(torrent) {
    if (!fileListUl || !playerDiv) return; // Ensure elements exist
    fileListUl.innerHTML = ''; // Clear previous list
    playerDiv.innerHTML = '<h2>Streaming Player</h2>'; // Reset player area

    if (!torrent || !torrent.files || torrent.files.length === 0) {
        log("Waiting for file information or torrent is empty.");
        const li = document.createElement('li');
        li.textContent = "Scanning for files...";
        fileListUl.appendChild(li);
        return;
    }

    log(`Displaying ${torrent.files.length} file(s) for torrent: ${torrent.name || torrent.infoHash}`);

    torrent.files.forEach((file, index) => {
        const li = document.createElement('li');
        const fileInfoSpan = document.createElement('span');
        const fileName = file.name || `File ${index + 1}`; // Fallback name
        const fileLength = typeof file.length === 'number' ? formatBytes(file.length) : 'Unknown Size';
        fileInfoSpan.textContent = `${fileName} (${fileLength})`;
        li.appendChild(fileInfoSpan);

        // Container for action buttons
        const buttonContainer = document.createElement('div');
        buttonContainer.style.marginTop = '5px';
        buttonContainer.style.display = 'flex';
        buttonContainer.style.gap = '10px'; // Add space between buttons

        // Create Download button (uses Blob URL)
        // Check if getBlobURL method exists *before* creating the button
        if (typeof file.getBlobURL === 'function') {
            const downloadButton = document.createElement('a');
            downloadButton.textContent = 'Download';
            downloadButton.href = '#'; // Placeholder
            downloadButton.download = file.name || `download_${index}`; // Suggest filename
            downloadButton.title = `Download ${fileName}`;
            downloadButton.className = 'button file-button'; // Add class for styling
            downloadButton.onclick = (e) => {
                e.preventDefault(); // Stop default link behavior
                log(`Preparing download for ${fileName}...`);
                downloadButton.textContent = 'Generating...'; // Provide user feedback
                downloadButton.style.opacity = '0.6';
                downloadButton.style.pointerEvents = 'none'; // Disable clicks while busy

                file.getBlobURL((err, url) => {
                    // Always re-enable the button regardless of outcome
                    downloadButton.textContent = 'Download';
                    downloadButton.style.opacity = '1';
                    downloadButton.style.pointerEvents = 'auto';

                    if (err) {
                        log(`Error getting blob URL for ${fileName}: ${err.message}`);
                        console.error("Blob URL Error:", err);
                        // Optionally show error to user more prominently
                        alert(`Failed to generate download link for ${fileName}: ${err.message}`);
                        return;
                    }
                    if (!url) {
                        log(`Failed to generate blob URL for ${fileName} (maybe cancelled or empty?).`);
                        alert(`Could not generate download link for ${fileName}.`);
                        return;
                    }

                    // Create a temporary link and click it programmatically
                    log(`Download link generated for ${fileName}. Starting download.`);
                    const tempLink = document.createElement('a');
                    tempLink.href = url;
                    tempLink.download = file.name || `download_${index}`;
                    document.body.appendChild(tempLink); // Needs to be in DOM to be clickable in some browsers
                    tempLink.click();
                    document.body.removeChild(tempLink); // Clean up the temporary link
                    // Note: Browser manages Blob URL lifetime; explicit revokeObjectURL(url) needed only if memory becomes a major issue with many large blobs.
                });
            };
            buttonContainer.appendChild(downloadButton);
        } else {
            log(`Download not available for ${fileName}: getBlobURL method missing.`);
        }

        // Create Stream button (uses file.appendTo)
        // Check if file type is potentially streamable and if appendTo method exists
        const isStreamable = /\.(mp4|webm|mkv|ogv|ogg|mp3|wav|aac|m4a|flac|opus|oga)$/i.test(fileName);
        if (isStreamable && typeof file.appendTo === 'function') {
            const streamButton = document.createElement('button');
            streamButton.textContent = 'Stream';
            streamButton.title = `Stream ${fileName}`;
            streamButton.className = 'button file-button'; // Add class for styling
            streamButton.onclick = () => streamFile(file); // Call dedicated streaming function
            buttonContainer.appendChild(streamButton);
        } else if (isStreamable) {
            log(`Streaming not possible for ${fileName}: appendTo method missing.`);
        }

        li.appendChild(buttonContainer);
        fileListUl.appendChild(li);
    });
}

// Streams the given file into the player element using file.appendTo
function streamFile(file) {
    if (!playerDiv) {
        log("Error: Player element not found. Cannot stream.");
        return;
    }
     // Defensive check
     if (typeof file.appendTo !== 'function') {
         log(`Error: Cannot stream ${file.name}. appendTo method not available.`);
         playerDiv.innerHTML = `<h2>Streaming Player</h2><p style="color:red;">Cannot stream "${file.name}". Feature not supported.</p>`;
         return;
     }

    log(`Attempting to stream ${file.name} using file.appendTo()...`);
    // Clear previous player content, show loading state
    playerDiv.innerHTML = `<h2>Streaming Player</h2><p>Loading ${file.name}...</p>`;

    // Use WebTorrent's built-in method to stream to the element
    file.appendTo(playerDiv, { autoplay: true, controls: true }, (err, elem) => { // `elem` is the <video> or <audio> element
        if (err) {
            log(`Error streaming ${file.name}: ${err.message}`);
            console.error("Streaming Error (appendTo):", err);
            let userMessage = `Could not stream "${file.name}".`;
            // Provide more specific feedback if possible
            if (err.message.toLowerCase().includes('unsupported') || err.name === 'NotSupportedError') {
                 userMessage = `Cannot stream "${file.name}". The browser does not support this file format or codec.`;
            } else if (err.message.toLowerCase().includes('decode')) {
                 userMessage = `Error decoding "${file.name}". The file might be corrupted or use an unsupported codec.`;
            } else {
                 userMessage += ` ${err.message}`;
            }
            playerDiv.innerHTML = `<h2>Streaming Player</h2><p style="color:red;">${userMessage}</p>`;
            return;
        }

        // Streaming started successfully (or at least the element was created)
        log(`Streaming ${file.name} in the player area.`);
        if (elem) {
             // Remove the "Loading..." message if present
             const loadingP = playerDiv.querySelector('p');
             if (loadingP && loadingP.textContent.startsWith('Loading')) {
                 playerDiv.removeChild(loadingP);
             }

            // Apply styles and add error handling to the media element
            elem.style.maxWidth = '100%';
            elem.style.display = 'block';
            elem.style.marginTop = '10px';
            elem.style.backgroundColor = '#000'; // Helps visualize the player area

            // Add extra error handler for runtime playback errors (e.g., network interruptions, decoding issues mid-stream)
            elem.addEventListener('error', (e) => {
                const mediaError = elem.error;
                let errorText = `Playback error for ${file.name}.`;
                if (mediaError) {
                    errorText += ` Code: ${mediaError.code}, Message: ${mediaError.message}`;
                }
                log(errorText);
                console.error('Media Element Playback Error:', mediaError, e);

                // Avoid adding duplicate error messages
                const existingErrorP = playerDiv.querySelector('p[style*="color:red"], p[style*="color:yellow"]');
                if (!existingErrorP) {
                    const errorP = document.createElement('p');
                    errorP.style.color = 'red';
                    errorP.textContent = `Playback failed for ${file.name}. The browser encountered an error.`;
                    // Prepend the error message above the player element if possible
                    if (elem.parentNode === playerDiv) {
                         playerDiv.insertBefore(errorP, elem);
                    } else {
                         playerDiv.appendChild(errorP); // Fallback
                    }
                }
            });

            // Optional: Log when playback actually starts
            elem.addEventListener('playing', () => {
                 log(`Playback started for ${file.name}`);
            });
            // Optional: Log buffering events
            elem.addEventListener('waiting', () => {
                 log(`Buffering ${file.name}...`);
            });


        } else {
            // Should not happen if err is null, but good to handle defensively
            log(`Streaming setup for ${file.name} completed, but no element was returned.`);
            playerDiv.innerHTML = `<h2>Streaming Player</h2><p style="color:orange;">Started streaming for ${file.name}, but player element is missing.</p>`;
        }
    });
}


// Main function to handle starting a new torrent download/stream
function startTorrent(torrentInput) {
    const inputDesc = typeof torrentInput === 'string' ? `ID: ${torrentInput.substring(0, 50)}...` : `File: ${torrentInput.name}`;
    log(`Attempting to start torrent: ${inputDesc}`);

    // --- Destroy existing client FIRST ---
    // This prevents multiple clients running concurrently and ensures clean state.
    const destroyPromise = new Promise((resolve, reject) => {
        if (client) {
            log('Destroying previous WebTorrent client instance...');
            client.destroy(err => {
                if (err) {
                    log(`Warning: Error destroying previous client: ${err.message}`);
                    console.warn("Client Destroy Error:", err);
                    // Continue anyway, but log the warning
                } else {
                    log('Previous client destroyed successfully.');
                }
                client = null; // Ensure client is nullified
                currentTorrentInfoHash = null; // Reset tracked info hash
                resolve();
            });
        } else {
            resolve(); // No client to destroy
        }
    });

    // --- THEN initialize and add the new torrent ---
    destroyPromise.then(() => {
        initializeAndAddTorrent(torrentInput);
    });
}

// Initializes the WebTorrent client and adds the specified torrent
function initializeAndAddTorrent(torrentInput) {
    log('Initializing new WebTorrent client with WebRTC config...');

    // Reset UI elements to initial/loading state
    if (progressDiv) progressDiv.innerHTML = 'Initializing Client...';
    if (peersDiv) peersDiv.innerText = 'Peers: 0';
    if (fileListUl) fileListUl.innerHTML = '';
    if (playerDiv) playerDiv.innerHTML = '<h2>Streaming Player</h2>';

    try {
        // **CRITICAL:** Instantiate the client WITH RTC Configuration
        client = new WebTorrent({
            tracker: {
                rtcConfig: RTC_CONFIG // Apply the STUN/TURN server config
            }
        });

        log('WebTorrent client initialized.');

        // Generic error handler for the client instance itself (e.g., tracker connection errors)
        client.on('error', err => {
            // Try to provide more context if possible
            let message = `WebTorrent Client Error: ${err.message}`;
            if (err.message && err.message.includes('tracker')) {
                 message += ' (Problem connecting to a tracker server)';
            } else if (err.message && err.message.includes('WebSocket')) {
                 message += ' (WebSocket connection issue)';
            }
            log(message);
            console.error("WebTorrent Client Error:", err);
            if (progressDiv) progressDiv.innerHTML = 'Client Error! See console.';
            if (peersDiv) peersDiv.innerText = 'Peers: Error';
            // Consider more drastic action? Maybe attempt to destroy/recreate client on certain errors?
        });

        // Log client warnings (less severe issues)
        client.on('warning', warn => {
             log(`WebTorrent Client Warning: ${warn.message}`);
             console.warn("WebTorrent Client Warning:", warn);
        });


        log('Adding torrent to client...');
        if (progressDiv) progressDiv.innerHTML = 'Adding torrent...';

        // **CRITICAL:** Add the torrent with custom trackers
        const addOptions = {
            announce: DEFAULT_TRACKERS // Pass the list of WSS trackers
            // You could add other options here if needed, like `path` or `store`
        };

        // Use client.add - this immediately returns a torrent object (or throws)
        // Metadata loading happens asynchronously via events.
        const torrent = client.add(torrentInput, addOptions, torrentReadyCallback);

        // --- Code runs immediately after client.add() is called ---
        currentTorrentInfoHash = torrent.infoHash; // Store the info hash
        log(`Torrent added (infohash: ${torrent.infoHash}). Waiting for metadata...`);
        if (progressDiv) progressDiv.innerHTML = 'Fetching metadata...';

        // Initial UI update (might show 0 peers initially)
        updateProgress(torrent);

        // --- Attach Torrent-Specific Event Listeners ---
        // These listeners are attached *to the specific torrent instance*

        torrent.on('metadata', () => { // Fired when metadata (file list, name etc.) is downloaded
             log(`Metadata received for: ${torrent.name || torrent.infoHash}`);
             if (progressDiv) progressDiv.innerHTML = 'Metadata loaded. Connecting...';
             displayFiles(torrent); // Display files now that we have them
             updateProgress(torrent); // Update progress again
        });

        torrent.on('ready', () => { // Fired when the torrent is ready to start downloading/uploading data
             log(`Torrent ready: ${torrent.name || torrent.infoHash}`);
             if (progressDiv && progressDiv.innerHTML.includes('Metadata loaded')) {
                 progressDiv.innerHTML = 'Ready to download/stream.';
             }
             // Ensure files are displayed if metadata arrived very quickly
             if (!fileListUl.hasChildNodes() && torrent.files && torrent.files.length > 0) {
                 displayFiles(torrent);
             }
             updateProgress(torrent);
        });

        torrent.on('warning', err => {
            log(`Torrent warning (${torrent.infoHash}): ${err.message}`);
            console.warn(`Torrent Warning (${torrent.infoHash}):`, err);
            updateProgress(torrent); // Still update progress on warnings
        });

        torrent.on('error', err => { // Errors specific to this torrent (e.g., invalid piece)
            log(`Torrent error (${torrent.infoHash}): ${err.message}`);
            console.error(`Torrent Error (${torrent.infoHash}):`, err);
            if (progressDiv) progressDiv.innerHTML = 'Torrent Error! See console.';
            updateProgress(torrent);
            // Consider removing the torrent or stopping if the error is fatal?
            // Example: if (err.message.includes('path unavailable')) client.remove(torrent.infoHash);
        });

        torrent.on('download', bytes => { // Fired frequently during download
            // Throttle UI updates slightly if needed, but usually fine
            updateProgress(torrent);
        });

        torrent.on('upload', bytes => { // Fired frequently during upload
            updateProgress(torrent); // Update for upload speed display
        });

        torrent.on('done', () => { // Torrent finished downloading all pieces
            log(`Torrent finished downloading: ${torrent.name || torrent.infoHash}`);
            updateProgress(torrent);
            if (progressDiv) {
                // Append "Complete!" without removing existing info
                const currentHTML = progressDiv.innerHTML;
                if (!currentHTML.includes('Complete!')) {
                     progressDiv.innerHTML = currentHTML + '<br><strong>Download Complete!</strong>';
                }
            }
            // Optionally trigger something else, like a notification
        });

        torrent.on('wire', (wire, addr) => { // Fired when connected to a new peer
            // Addr might be undefined for incoming connections
            log(`Connected to peer: ${addr || 'Incoming Connection'}`);
            updateProgress(torrent); // Update peer count display
        });

        torrent.on('noPeers', (announceType) => { // Fired when no peers found for a tracker type
             log(`No peers found via ${announceType} for torrent ${torrent.infoHash}. Waiting...`);
             if (peersDiv) peersDiv.innerText = `Peers: 0 (Searching via ${announceType}...)`;
             // This is common initially, especially for less popular torrents
        });

    } catch (err) { // Catch synchronous errors during client instantiation or `client.add`
        log(`Fatal Error adding torrent: ${err.message}. Check input or client setup.`);
        console.error("Client Add/Init Error:", err);
        if (progressDiv) progressDiv.innerHTML = 'Error: Invalid Torrent ID/File or Client Init Failed.';
        // Clean up potentially partially initialized client on add failure
        if (client) {
            client.destroy(); // Attempt cleanup
            client = null;
        }
    }
}

// Callback function passed to client.add, executed when metadata is ready *or* immediately if cached
function torrentReadyCallback(torrent) {
    // This callback might fire *before* the 'metadata' or 'ready' events in some cases
    // especially if the torrent was already cached or metadata resolves instantly.
    log(`Torrent ready callback fired: ${torrent.name || torrent.infoHash}`);
    if (currentTorrentInfoHash !== torrent.infoHash) {
         log(`Warning: Torrent ready callback for unexpected infohash ${torrent.infoHash}. Current is ${currentTorrentInfoHash}`);
         // This might indicate a race condition if startTorrent is called rapidly.
         // The client destruction logic should prevent this, but good to be aware.
         return; // Ignore if it's not the torrent we just added
    }

    log('Initial connection/download phase starting...');
    if (progressDiv && !progressDiv.innerHTML.includes('Connecting')) {
         progressDiv.innerHTML = 'Connecting / Downloading...';
    }
    displayFiles(torrent); // Ensure files are displayed
    updateProgress(torrent); // Show initial progress info
}


// --- Initialization and Event Listeners (Executed after DOM is ready) ---
document.addEventListener('DOMContentLoaded', () => {
    // Final check that all needed HTML elements are present
    const requiredElementIds = ['torrentIdInput', 'torrentFileInput', 'startButton', 'logs', 'progress', 'peers', 'fileList', 'player'];
    let allElementsFound = true;
    requiredElementIds.forEach(id => {
        if (!document.getElementById(id)) {
            console.error(`CRITICAL: Essential HTML element with ID '${id}' was not found AFTER DOM LOAD! Check index.html.`);
            allElementsFound = false;
        }
    });

    if (!allElementsFound) {
        alert("Critical Error: Page elements missing. Cannot initialize functionality.");
        if (startButton) startButton.disabled = true; // Prevent interaction
        return; // Stop script execution
    }

    console.log("All essential HTML elements found after DOM Load.");

    // Attach listener to the main start button
    startButton.addEventListener('click', () => {
        console.log('Start button clicked!');
        log('Start button action triggered...');
        startButton.disabled = true; // Disable button temporarily to prevent double clicks
        startButton.textContent = 'Starting...';

        const torrentId = torrentIdInput.value.trim();
        const file = torrentFileInput.files.length > 0 ? torrentFileInput.files[0] : null;

        console.log('Torrent ID input value:', torrentId);
        console.log('Selected file object:', file);

        // Determine input source
        let inputToUse = null;
        let inputError = null;

        if (file) { // Prioritize file input
            log(`Processing selected file: ${file.name}`);
            inputToUse = file;
            torrentIdInput.value = ''; // Clear other input
        } else if (torrentId) {
            // Basic validation for magnet URI or info hash
            if (torrentId.startsWith('magnet:?xt=urn:btih:') || /^[a-fA-F0-9]{40}$/i.test(torrentId) || /^[a-fA-F0-9]{32}$/i.test(torrentId)) { // Support v1/v2 infohashes
                log(`Processing input ID/Magnet: ${torrentId.substring(0, 60)}...`);
                inputToUse = torrentId;
                torrentFileInput.value = ''; // Clear other input
            } else {
                inputError = 'Invalid Magnet URI or Info Hash format. Must start with "magnet:" or be a 40/32-character hex string.';
            }
        } else {
            inputError = 'Please enter a magnet link/info hash or select a .torrent file.';
        }

        // Proceed or show error
        if (inputToUse) {
            startTorrent(inputToUse);
        } else if (inputError) {
            log(`Input Error: ${inputError}`);
            console.log('Invalid input provided.');
            alert(inputError); // Show error to user
        }

        // Re-enable the button after a short delay or based on torrent status?
        // For simplicity, re-enable fairly quickly. More complex logic could wait for torrent error/ready.
        setTimeout(() => {
            startButton.disabled = false;
            startButton.textContent = 'Start Download / Stream';
        }, 500); // Re-enable after 0.5 seconds
    });
    console.log("Click listener added to startButton.");

    // Add listeners to clear one input type if the other is used
    torrentIdInput.addEventListener('input', () => {
        if (torrentIdInput.value.trim() !== '') {
            torrentFileInput.value = ''; // Clear file if text is typed
        }
    });
    console.log("Input listener added to torrentIdInput.");

    torrentFileInput.addEventListener('change', () => {
        console.log('File input changed!');
        if (torrentFileInput.files.length > 0) {
            const selectedFile = torrentFileInput.files[0];
            console.log('File selected:', selectedFile.name);
            log(`File selected via input: ${selectedFile.name}`);
            torrentIdInput.value = ''; // Clear text if file is chosen
        } else {
            console.log('File input cleared or no file selected.');
        }
    });
    console.log("Change listener added to torrentFileInput.");

    // Log that initialization is complete
    log('WebTorrent Client UI Initialized. Ready for input.');
    log("--------------------------------------------------");
    log("LEGAL DISCLAIMER: Only use this tool for content you have the legal right to share and download.");
    log("Downloading copyrighted material without permission may be illegal in your jurisdiction.");
    log("--------------------------------------------------");
    log("Performance Tip: Keep this browser tab active for best download speeds.");
    log("--------------------------------------------------");


}); // End of DOMContentLoaded

// Log message indicates script file itself has loaded, before DOM might be ready
console.log("script.js loaded. Waiting for DOM content...");
