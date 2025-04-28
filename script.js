// --- Initial Checks & Global Setup ---
if (typeof WebTorrent === 'undefined') {
    console.error("WebTorrent library not loaded!");
    alert("Error: WebTorrent library failed to load. The application cannot start.");
    // Disable UI elements here if needed
} else if (!WebTorrent.WEBRTC_SUPPORT) {
    log('Warning: WebRTC is not supported in this browser. Peer-to-peer functionality will be severely limited or non-functional.');
}

// Get references to essential DOM elements
const torrentIdInput = document.getElementById('torrentIdInput');
const torrentFileInput = document.getElementById('torrentFileInput');
const startButton = document.getElementById('startButton');
const logsDiv = document.getElementById('logs');
const progressDiv = document.getElementById('progress');
const peersDiv = document.getElementById('peers');
const fileListUl = document.getElementById('fileList');
const playerDiv = document.getElementById('player');

let client = null; // Holds the WebTorrent client instance
let fetchedTrackers = []; // Holds trackers fetched from external sources

// --- Logging Utility ---
function log(message) {
    console.log(message); // Also log to browser console for debugging
    if (logsDiv) {
        const time = new Date().toLocaleTimeString();
        // Basic sanitization
        const sanitizedMessage = message.toString().replace(/</g, "<").replace(/>/g, ">");
        logsDiv.innerHTML = `[${time}] ${sanitizedMessage}<br>` + logsDiv.innerHTML; // Prepend new logs
    } else {
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
             console.error("Log element (#logs) not found!");
        }
    }
}

// --- Utility Functions ---

// Updates the progress display area
function updateProgress(torrent) {
    if (!progressDiv || !peersDiv) return; // Ensure elements exist

    const percent = (torrent.progress * 100).toFixed(2);
    const downloaded = formatBytes(torrent.downloaded);
    const total = formatBytes(torrent.length);
    const dlSpeed = formatBytes(torrent.downloadSpeed) + '/s';
    const ulSpeed = formatBytes(torrent.uploadSpeed) + '/s';
    let remaining = 'N/A';
    if (torrent.done) {
        remaining = 'Done';
    } else if (torrent.timeRemaining && torrent.timeRemaining !== Infinity) {
        remaining = formatTime(torrent.timeRemaining / 1000); // timeRemaining is in ms
    } else if (torrent.downloadSpeed > 0 && torrent.length && torrent.length > torrent.downloaded) {
         // Fallback calculation if timeRemaining isn't available
         const remainingBytes = torrent.length - torrent.downloaded;
         const secondsRemaining = remainingBytes / torrent.downloadSpeed;
         remaining = formatTime(secondsRemaining);
    }

    // Ensure name is displayed safely
    const torrentName = torrent.name ? torrent.name.replace(/</g, "<").replace(/>/g, ">") : "Fetching name...";

    progressDiv.innerHTML = `
        Torrent: ${torrentName}<br>
        Progress: ${percent}% <br>
        Downloaded: ${downloaded} / ${total} <br>
        Speed: ↓ ${dlSpeed} / ↑ ${ulSpeed} <br>
        Time Remaining: ${remaining}
    `;
    peersDiv.innerText = `Peers: ${torrent.numPeers}`;
}

// Formats byte values into human-readable strings (KB, MB, GB etc.)
function formatBytes(bytes, decimals = 2) {
    if (bytes === null || typeof bytes === 'undefined' || isNaN(bytes) || bytes < 0) return '0 Bytes';
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const validIndex = Math.min(Math.max(0, i), sizes.length - 1);
    return parseFloat((bytes / Math.pow(k, validIndex)).toFixed(dm)) + ' ' + sizes[validIndex];
}


// Formats seconds into HH:MM:SS string
function formatTime(seconds) {
     if (!seconds || seconds === Infinity || isNaN(seconds) || seconds < 0) return 'N/A';
    try {
        const totalSeconds = Math.round(seconds);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const secs = totalSeconds % 60;

        const hh = String(hours).padStart(2, '0');
        const mm = String(minutes).padStart(2, '0');
        const ss = String(secs).padStart(2, '0');

        if (hours > 0) {
            return `${hh}:${mm}:${ss}`;
        } else {
            return `${mm}:${ss}`;
        }
    } catch (e) {
         console.error("Error formatting time:", e);
         return 'N/A';
    }
}

// --- Tracker Fetching (with CORS Proxy Fix and Fallback) ---

// Helper function to parse tracker text
function parseTrackers(text) {
    const lines = text.split('\n');
    const trackers = new Set();
    lines.forEach(line => {
        const tracker = line.trim();
        if (tracker && !tracker.startsWith('#')) {
            trackers.add(tracker);
        }
    });
    return trackers;
}

// Fetches trackers from various sources
async function fetchTrackers() {
    log('Fetching external trackers...');
    let combinedTrackers = new Set(); // Use a Set to automatically handle duplicates across sources

    // Source 1: Local tracker.txt (if exists)
    try {
        const response = await fetch('tracker.txt'); // Assumes tracker.txt is in the same directory
        if (response.ok) {
            const text = await response.text();
            const localTrackers = parseTrackers(text);
            localTrackers.forEach(t => combinedTrackers.add(t));
            log(`Loaded ${localTrackers.size} trackers from local tracker.txt`);
        } else {
            log('Info: Optional local tracker.txt not found or could not be fetched.');
        }
    } catch (error) {
        log(`Warning: Error trying to fetch local tracker.txt: ${error.message}`);
    }

    // Source 2: Remote API via CORS Proxy (newtrackon.com)
    const trackerApiUrl = 'https://newtrackon.com/api/stable';
    // Use a CORS proxy to bypass browser restrictions
    // api.allorigins.win/raw returns the raw response body
    const proxyUrlApi = `https://api.allorigins.win/raw?url=${encodeURIComponent(trackerApiUrl)}`;
    log(`Attempting to fetch trackers from API via CORS proxy: ${proxyUrlApi}`);
    try {
        const response = await fetch(proxyUrlApi, { signal: AbortSignal.timeout(10000) }); // 10 second timeout
        if (response.ok) {
            const text = await response.text();
            const apiTrackers = parseTrackers(text);
            log(`Successfully fetched ${apiTrackers.size} trackers from API (via proxy).`);
            apiTrackers.forEach(t => combinedTrackers.add(t));
        } else {
            log(`Warning: Failed to fetch trackers from API via proxy (${proxyUrlApi}), status: ${response.status}`);
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            log(`Warning: Timed out fetching trackers from API via proxy.`);
        } else {
            log(`Warning: Error fetching trackers from API via proxy: ${error.message}`);
        }
        log('Attempting fallback tracker source...');
    }

    // Source 3: Fallback - Direct fetch from GitHub Raw (usually has CORS enabled)
    // Fetch only if the API fetch failed or yielded no results
    if (combinedTrackers.size === 0 || !proxyUrlApi) { // Check if previous attempt failed or didn't add any
        const githubTrackersUrl = 'https://raw.githubusercontent.com/ngosang/trackerslist/master/trackers_best.txt';
        log(`Attempting to fetch trackers directly from GitHub: ${githubTrackersUrl}`);
        try {
            const response = await fetch(githubTrackersUrl, { signal: AbortSignal.timeout(8000) }); // 8 second timeout
            if (response.ok) {
                const text = await response.text();
                const githubTrackers = parseTrackers(text);
                log(`Successfully fetched ${githubTrackers.size} trackers from GitHub.`);
                githubTrackers.forEach(t => combinedTrackers.add(t));
            } else {
                log(`Warning: Failed to fetch trackers directly from GitHub (${githubTrackersUrl}), status: ${response.status}`);
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                log(`Warning: Timed out fetching trackers from GitHub.`);
            } else {
                log(`Warning: Error fetching trackers directly from GitHub: ${error.message}`);
            }
        }
    }

    // Final Result
    if (combinedTrackers.size === 0) {
         log("Warning: Could not load external trackers from any source. Relying on torrent embedded trackers and DHT/PEX.");
         return []; // Return empty array
    } else {
         log(`Total unique external trackers fetched from all sources: ${combinedTrackers.size}`);
         return Array.from(combinedTrackers); // Convert Set back to Array
    }
}


// --- Core Torrent Handling ---

// Renders the list of files in the torrent
function displayFiles(torrent) {
    if (!fileListUl || !playerDiv) {
        log("Error: UI elements for file list or player missing.");
        return;
    }
    fileListUl.innerHTML = ''; // Clear previous list
    playerDiv.innerHTML = '<h2>Streaming Player</h2>'; // Reset player area

    if (!torrent.files || torrent.files.length === 0) {
        log("Waiting for file information in the torrent metadata...");
        const li = document.createElement('li');
        li.textContent = "Waiting for file information...";
        fileListUl.appendChild(li);
        return;
    }

    log(`Displaying ${torrent.files.length} file(s) for torrent: ${torrent.name || torrent.infoHash}`);

    torrent.files.forEach((file) => {
        const li = document.createElement('li');
        const fileInfoSpan = document.createElement('span');
        // Sanitize file name before display
        const safeFileName = file.name ? file.name.replace(/</g, "<").replace(/>/g, ">") : 'Unknown File';
        const fileLength = typeof file.length === 'number' ? formatBytes(file.length) : 'Unknown Size';
        fileInfoSpan.textContent = `${safeFileName} (${fileLength})`;
        li.appendChild(fileInfoSpan);

        const buttonContainer = document.createElement('div');
        buttonContainer.style.display = 'flex';
        buttonContainer.style.gap = '5px';
        buttonContainer.style.marginTop = '5px';

        // Download Button
        const downloadButton = document.createElement('button');
        downloadButton.textContent = 'Download';
        downloadButton.title = `Download ${safeFileName}`;
        downloadButton.onclick = (e) => {
             e.preventDefault();
             log(`Preparing download for ${safeFileName}...`);
             const button = e.target;
             button.textContent = 'Generating...';
             button.disabled = true;

             if (typeof file.getBlobURL !== 'function') {
                  log(`Error: file.getBlobURL is not available for ${safeFileName}.`);
                  button.textContent = 'Error';
                  setTimeout(() => { button.textContent = 'Download'; button.disabled = false; }, 3000);
                  return;
             }

             file.getBlobURL((err, url) => {
                 button.disabled = false;
                 if (err) {
                     log(`Error getting blob URL for ${safeFileName}: ${err.message}`);
                     button.textContent = 'Error';
                      setTimeout(() => { button.textContent = 'Download'; }, 3000);
                     return;
                 }
                 if (!url) {
                     log(`Failed to generate blob URL for ${safeFileName}.`);
                     button.textContent = 'Download';
                     return;
                 }
                 log(`Download link generated for ${safeFileName}. Starting download.`);
                 const tempLink = document.createElement('a');
                 tempLink.href = url;
                 tempLink.download = file.name; // Use original name
                 document.body.appendChild(tempLink);
                 tempLink.click();
                 document.body.removeChild(tempLink);
                 // Optional: URL.revokeObjectURL(url); // If memory is critical
                 button.textContent = 'Download';
             });
        };
        buttonContainer.appendChild(downloadButton);

        // Stream Button
        const isStreamable = /\.(mp4|webm|mkv|ogv|ogg|mp3|wav|aac|m4a|flac|opus|oga)$/i.test(file.name);
        if (isStreamable && typeof file.appendTo === 'function') {
            const streamButton = document.createElement('button');
            streamButton.textContent = 'Stream';
            streamButton.title = `Stream ${safeFileName}`;
            streamButton.onclick = () => streamFile(file);
            buttonContainer.appendChild(streamButton);
        } else if (isStreamable) {
             log(`Streaming not possible for ${safeFileName}: file.appendTo method missing.`);
             const disabledStreamButton = document.createElement('button');
             disabledStreamButton.textContent = 'Stream';
             disabledStreamButton.disabled = true;
             disabledStreamButton.title = `Cannot stream: Method unavailable`;
             buttonContainer.appendChild(disabledStreamButton);
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
    // Sanitize file name for logging/display
    const safeFileName = file.name ? file.name.replace(/</g, "<").replace(/>/g, ">") : 'Unknown File';

    log(`Attempting to stream ${safeFileName} using file.appendTo()...`);
    playerDiv.innerHTML = `<h2>Streaming: ${safeFileName}</h2><p><i>Preparing stream...</i></p>`; // Initial placeholder

    // Use WebTorrent's built-in method. Request autoplay, but handle potential blocking.
    file.appendTo(playerDiv, { autoplay: true, controls: true }, (err, elem) => { // elem is the <video>/<audio> tag

        // Step 1: Handle Immediate appendTo Errors
        if (err) {
            log(`Error setting up stream for ${safeFileName} via appendTo: ${err.message}`);
            console.error("Streaming Setup Error (appendTo):", err);
            let errorMsg = `<p style="color:red;">Could not start stream for "${safeFileName}". `;
            if (err.message.toLowerCase().includes('unsupported') || err.name === 'NotSupportedError') {
                 errorMsg += `The browser may not support this file format or codec.`;
            } else if (err.message.toLowerCase().includes('network') || err.message.toLowerCase().includes('decode')) {
                 errorMsg += `A network or decoding error occurred during setup.`;
            } else {
                 errorMsg += `Internal error: ${err.message}`;
            }
            errorMsg += ` You can try downloading the file instead.</p>`;
            const placeholder = playerDiv.querySelector('p > i');
            if(placeholder) placeholder.parentElement.innerHTML = errorMsg;
            else playerDiv.innerHTML += errorMsg;
            return;
        }

        // Step 2: Setup Element and Event Listeners (if appendTo succeeded)
        if (!elem) {
            log(`Warning: appendTo completed for ${safeFileName}, but the media element reference is missing.`);
            playerDiv.innerHTML += `<p style="color:orange;">Stream setup succeeded, but element reference is missing.</p>`;
            return;
        }

        log(`Media element created for ${safeFileName}. Setting up listeners.`);
        const placeholder = playerDiv.querySelector('p > i');
        if (placeholder) placeholder.parentElement.remove(); // Clear "Preparing stream..."

        elem.style.maxWidth = '100%';
        elem.style.display = 'block';
        elem.style.marginTop = '10px';
        elem.style.backgroundColor = '#000';

        // Step 3: Monitor Playback State and Handle Runtime Errors
        let statusP = playerDiv.querySelector('.playback-status');
        if (!statusP) {
            statusP = document.createElement('p');
            statusP.className = 'playback-status';
            statusP.style.marginTop = '5px';
            playerDiv.appendChild(statusP);
        }

        // Check initial state after a brief moment
        setTimeout(() => {
            if (elem.paused && !elem.ended && elem.readyState >= 3) { // HAVE_FUTURE_DATA or HAVE_ENOUGH_DATA
                 log(`Autoplay likely prevented for ${safeFileName}. Element is paused.`);
                 if (!statusP.innerHTML.includes('Error')) { // Don't overwrite existing error
                     statusP.innerHTML = '▶️ Autoplay blocked or needs interaction. <button onclick="this.closest(\'#player\').querySelector(\'video,audio\').play().catch(e => console.error(\'Manual play failed:\', e))">Play Manually</button>';
                     statusP.style.color = 'orange';
                 }
            } else if (!elem.paused) {
                 log(`Autoplay seems to have started or is attempting for ${safeFileName}.`);
                  if (!statusP.innerHTML.includes('Error')) {
                    statusP.textContent = '▶️ Playback initiated...';
                    statusP.style.color = 'lightgreen';
                  }
            } else {
                 log(`Initial state for ${safeFileName} is paused, but might be loading.`);
                 if (!statusP.innerHTML.includes('Error')) {
                    statusP.textContent = '⏳ Loading metadata/first frame...';
                    statusP.style.color = 'lightblue';
                 }
            }
        }, 100); // 100ms delay

        // Event Listeners for Playback State
        elem.addEventListener('playing', () => {
            log(`Media playback started/resumed for ${safeFileName}.`);
             if (!statusP.innerHTML.includes('Error')) {
                statusP.textContent = '▶️ Playing';
                statusP.style.color = 'lightgreen';
             }
        });
        elem.addEventListener('pause', () => {
            if (!elem.ended && !statusP.innerHTML.includes('Error')) {
                log(`Media playback paused for ${safeFileName}.`);
                statusP.textContent = '⏸️ Paused';
                statusP.style.color = 'orange';
            }
        });
        elem.addEventListener('waiting', () => {
            log(`Media waiting for data (buffering) for ${safeFileName}...`);
            if (!statusP.innerHTML.includes('Error')) {
                statusP.textContent = '⏳ Buffering...';
                statusP.style.color = 'lightblue';
            }
        });
        elem.addEventListener('stalled', () => {
            log(`Media stalled for ${safeFileName}. Waiting for data or network issue.`);
            if (!statusP.innerHTML.includes('Error')) {
                statusP.textContent = '⚠️ Stalled (Network issue?)';
                statusP.style.color = 'yellow';
            }
        });
        elem.addEventListener('ended', () => {
            log(`Media playback finished for ${safeFileName}.`);
            if (!statusP.innerHTML.includes('Error')) {
                statusP.textContent = '⏹️ Finished';
                statusP.style.color = 'grey';
            }
        });
        elem.addEventListener('error', (e) => {
             const mediaError = elem.error;
             let detail = 'Unknown Error';
             if (mediaError) {
                switch (mediaError.code) {
                    case MediaError.MEDIA_ERR_ABORTED: detail = 'Playback aborted by user or script.'; break;
                    case MediaError.MEDIA_ERR_NETWORK: detail = 'Network error caused download failure during playback.'; break;
                    case MediaError.MEDIA_ERR_DECODE: detail = 'Playback aborted due to decoding error (corrupted data or unsupported codec features).'; break;
                    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED: detail = 'Media source/format not supported by this browser.'; break;
                    default: detail = `Code ${mediaError.code}; Message: ${mediaError.message || 'N/A'}`;
                }
             }
             log(`Media Element Error (${safeFileName}): ${detail}`);
             console.error('Media Element Playback Error:', mediaError, e);

             statusP.innerHTML = `<span style="color:red;">❌ Playback Error: ${detail}</span>`;

             // Add a more prominent error message below if one doesn't exist from appendTo
             const existingErrorDiv = playerDiv.querySelector('div.runtime-error');
             if (!existingErrorDiv) {
                  const errorDiv = document.createElement('div');
                  errorDiv.className = 'runtime-error';
                  errorDiv.style.color = 'red';
                  errorDiv.style.marginTop = '10px';
                  errorDiv.textContent = `Playback failed for ${safeFileName}. Reason: ${detail}`;
                  playerDiv.appendChild(errorDiv);
             }
        });

    }); // End of appendTo callback
}


// Main function to handle starting a new torrent download/stream
async function startTorrent(torrentId) { // Made async to wait for trackers
    const idString = typeof torrentId === 'string'
        ? (torrentId.startsWith('magnet:') ? torrentId.substring(0, 60) + '...' : torrentId)
        : (torrentId.name || 'Unknown File');
    log(`Starting torrent process for: ${idString}`);
    if(startButton) startButton.disabled = true; // Disable button while processing

    // 1. Destroy existing client if any
    if (client) {
        log('Destroying previous torrent instance...');
        await new Promise((resolve) => {
            client.destroy(err => {
                if (err) {
                    log(`Warning: Error destroying previous client: ${err.message}`);
                    console.error("Client Destroy Warning:", err);
                } else {
                    log('Previous client destroyed successfully.');
                }
                client = null;
                resolve();
            });
             setTimeout(() => { // Safety timeout
                 if (client) { log('Destroy timeout reached, nullifying client.'); client = null; }
                 resolve();
             }, 3000);
        });
    }

    // 2. Fetch Trackers
    fetchedTrackers = await fetchTrackers();

    // 3. Initialize new client and add torrent
    initializeAndAddTorrent(torrentId, fetchedTrackers);

    // Button re-enabling is handled within initializeAndAddTorrent or its callbacks
}

// Initializes the WebTorrent client and adds the specified torrent
function initializeAndAddTorrent(torrentId, trackers) {
    log('Initializing new WebTorrent client...');
    const clientOptions = {}; // Keep options minimal unless specific needs arise

    try {
         client = new WebTorrent(clientOptions);
    } catch(err) {
         log(`Fatal Error: Could not initialize WebTorrent Client: ${err.message}`);
         console.error("WebTorrent Client Instantiation Error:", err);
         if(progressDiv) progressDiv.innerHTML = '<span style="color:red;">WebTorrent Init Failed!</span>';
         if(startButton) startButton.disabled = false;
         return;
    }

    // Client-level error handler
    client.on('error', err => {
        log(`WebTorrent Client Error: ${err.message}`);
        console.error("WebTorrent Client Error:", err);
        if (progressDiv) progressDiv.innerHTML = '<span style="color:red;">Client Error! Check console.</span>';
        if (peersDiv) peersDiv.innerText = 'Peers: 0';
        if (startButton) startButton.disabled = false;
    });

    log('Adding torrent to client...');
    if (progressDiv) progressDiv.innerHTML = 'Fetching metadata...';
    if (peersDiv) peersDiv.innerText = 'Peers: 0';
    if (fileListUl) fileListUl.innerHTML = '';
    if (playerDiv) playerDiv.innerHTML = '<h2>Streaming Player</h2>';

    const addOptions = {};
    if (trackers && trackers.length > 0) {
        addOptions.announce = trackers; // Pass fetched trackers specifically to this torrent
        log(`Adding torrent with ${trackers.length} custom trackers.`);
    } else {
        log("Adding torrent using default tracker mechanisms.");
    }

    try {
        // Add the torrent
        client.add(torrentId, addOptions, torrent => {
            // --- Metadata Ready Callback ('torrent' event) ---
            const torrentName = torrent.name || torrent.infoHash;
            log(`Metadata received for: ${torrentName}`);
            log('Connecting to peers & preparing transfer...');
            if (progressDiv) progressDiv.innerHTML = 'Connecting / Downloading...';
            if (startButton) startButton.disabled = false; // Re-enable button once metadata is ready

            displayFiles(torrent);
            updateProgress(torrent);

            // --- Torrent-Specific Event Listeners ---
            torrent.on('warning', err => { log(`Torrent Warning (${torrentName}): ${err.message}`); console.warn(`Torrent Warning (${torrentName}):`, err); });
            torrent.on('error', err => {
                log(`Torrent Error (${torrentName}): ${err.message}`); console.error(`Torrent Error (${torrentName}):`, err);
                 if (progressDiv && progressDiv.innerHTML.includes('%')) { progressDiv.innerHTML += '<br><span style="color:red;">Torrent Error!</span>'; }
                 else { progressDiv.innerHTML = '<span style="color:red;">Torrent Error! Check logs.</span>'; }
                 updateProgress(torrent);
                 if (startButton) startButton.disabled = false;
            });
            torrent.on('metadata', () => { log(`Metadata event fired for ${torrentName}.`); if (!fileListUl.hasChildNodes() || fileListUl.textContent.includes("Waiting")) { displayFiles(torrent); } updateProgress(torrent); });
            torrent.on('ready', () => { log(`Torrent Ready (${torrentName}).`); if (!fileListUl.hasChildNodes() || fileListUl.textContent.includes("Waiting")) { displayFiles(torrent); } updateProgress(torrent); });
            torrent.on('download', bytes => updateProgress(torrent));
            torrent.on('upload', bytes => updateProgress(torrent));
            torrent.on('done', () => { log(`Torrent finished downloading: ${torrentName}`); updateProgress(torrent); if (progressDiv) progressDiv.innerHTML += '<br><strong style="color: lightgreen;">Download Complete!</strong>'; if (startButton) startButton.disabled = false; });
            torrent.on('wire', (wire, addr) => updateProgress(torrent)); // Update peer count
            torrent.on('peer', (peerId) => updateProgress(torrent)); // Update peer count
            torrent.on('noPeers', (announceType) => { log(`Warning: No peers found via ${announceType} for ${torrentName}.`); });

             // Initial display if files ready immediately
             if (torrent.files && torrent.files.length > 0 && (!fileListUl.hasChildNodes() || fileListUl.textContent.includes("Waiting"))) { log('Files available immediately. Displaying.'); displayFiles(torrent); }
             updateProgress(torrent);
        });

        // --- Code runs immediately after client.add() ---
        const addedTorrent = client.torrents[client.torrents.length - 1];
        if(addedTorrent) { log(`Torrent add request sent (infohash: ${addedTorrent.infoHash}). Waiting for metadata...`); updateProgress(addedTorrent); }
        else { log("Torrent add request sent, awaiting client confirmation."); }

    } catch (err) { // Catch synchronous errors during client.add
        log(`Error adding torrent: ${err.message}. Check magnet URI / file format.`); console.error("Client.add Error:", err);
        if (progressDiv) progressDiv.innerHTML = '<span style="color:red;">Invalid Torrent ID/File</span>';
        if (startButton) startButton.disabled = false;
        if (client) { client.destroy(destroyErr => { if (destroyErr) console.error("Error destroying client after add failure:", destroyErr); }); client = null; }
    }
}


// --- Initialization and Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    // Check essential elements exist
    const essentialIds = ['torrentIdInput', 'torrentFileInput', 'startButton', 'logs', 'progress', 'peers', 'fileList', 'player'];
    let allElementsFound = true;
    essentialIds.forEach(id => {
        const elem = document.getElementById(id);
        if (!elem) { console.error(`CRITICAL: Element ID '${id}' not found!`); allElementsFound = false; }
    });

    if (!allElementsFound) {
         alert("Critical Error: Page elements missing. App cannot function. Check console (F12).");
        if (startButton) startButton.disabled = true;
        return;
    }
    console.log("All essential HTML elements verified.");

    // Attach listener to the main start button
    startButton.addEventListener('click', () => {
        console.log('Start button clicked!');
        log('Start button action triggered...');

        const torrentId = torrentIdInput.value.trim();
        const file = torrentFileInput.files.length > 0 ? torrentFileInput.files[0] : null;

        console.log('Input ID:', torrentId || '(empty)');
        console.log('Input File:', file ? file.name : '(none)');

        if (file) {
            log(`Processing selected file: ${file.name}`);
            startTorrent(file).catch(err => { log(`Error during start process: ${err.message}`); console.error("startTorrent Error:", err); if(startButton) startButton.disabled = false; });
            torrentIdInput.value = '';
        } else if (torrentId) {
            if (torrentId.startsWith('magnet:') || /^[a-fA-F0-9]{40}$/i.test(torrentId) || /^[a-fA-F0-9]{64}$/i.test(torrentId) || (torrentId.startsWith('http') && torrentId.endsWith('.torrent'))) {
                 log(`Processing input: ${torrentId.substring(0, 70)}...`);
                 startTorrent(torrentId).catch(err => { log(`Error during start process: ${err.message}`); console.error("startTorrent Error:", err); if(startButton) startButton.disabled = false; });
                 torrentFileInput.value = '';
            } else {
                 log('Input Error: Invalid Magnet URI, Info Hash, or .torrent URL format.');
                 // Don't disable button here, allow user to correct input
            }
        } else {
            log('Input Error: Please enter a magnet link/info hash/URL or select a .torrent file.');
             // Don't disable button here
        }
        // Button disabling now happens inside startTorrent
    });
    console.log("Click listener added to startButton.");

    // Listeners to clear the other input field
    torrentIdInput.addEventListener('input', () => {
        if (torrentIdInput.value.trim() !== '' && torrentFileInput.value !== '') {
             log("Clearing file input as text ID was entered.");
             torrentFileInput.value = '';
        }
    });
    console.log("Input listener added to torrentIdInput.");

    torrentFileInput.addEventListener('change', () => {
        if (torrentFileInput.files.length > 0) {
             const selectedFile = torrentFileInput.files[0];
             console.log('File selected via input:', selectedFile.name);
             log(`File selected: ${selectedFile.name}`);
             if (torrentIdInput.value.trim() !== '') {
                 log("Clearing text input as file was selected.");
                 torrentIdInput.value = '';
             }
        } else {
             console.log('File input cleared or no file selected.');
        }
    });
    console.log("Change listener added to torrentFileInput.");

    // Initial log messages & Tracker Fetch
    log('WebTorrent Client UI Initialized. Ready for input.');
    log("--------------------------------------------------");
    log("LEGAL DISCLAIMER: Only use this tool for content you have the legal right to share and download.");
    log("Downloading copyrighted material without permission may be illegal in your jurisdiction.");
    log("--------------------------------------------------");
    log("Fetching initial tracker list...");
    fetchTrackers().then(trackers => {
        fetchedTrackers = trackers; // Store fetched trackers globally
        log(`Initial tracker fetch complete on page load. ${trackers.length} trackers ready.`);
    }).catch(err => {
        log(`Initial tracker fetch on page load failed: ${err.message}`);
        // Application can still proceed using defaults/embedded trackers
    });

}); // End of DOMContentLoaded

// Log message indicates script file itself has loaded
console.log("script.js loaded. Waiting for DOM content...");
