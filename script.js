// --- Initial Checks & Global Setup ---
if (typeof WebTorrent === 'undefined') {
    console.error("WebTorrent library not loaded!");
    alert("Error: WebTorrent library failed to load. The application cannot start.");
    // You might want to disable UI elements here as well
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
        // Basic sanitization (consider a more robust library if handling complex user input)
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
    if (bytes === null || typeof bytes === 'undefined' || isNaN(bytes) || bytes < 0) return '0 Bytes'; // More robust check
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const validIndex = Math.min(Math.max(0, i), sizes.length - 1); // Ensure index is valid
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

// --- Tracker Fetching ---

// Fetches trackers from local file and remote API
async function fetchTrackers() {
    log('Fetching external trackers...');
    let trackers = new Set(); // Use a Set to automatically handle duplicates

    // 1. Fetch from local tracker.txt
    try {
        const response = await fetch('tracker.txt');
        if (response.ok) {
            const text = await response.text();
            const lines = text.split('\n');
            lines.forEach(line => {
                const tracker = line.trim();
                // Add if not empty and not a comment
                if (tracker && !tracker.startsWith('#')) {
                    trackers.add(tracker);
                }
            });
            log(`Loaded ${trackers.size} trackers from tracker.txt`);
        } else {
            log('Warning: tracker.txt not found or could not be fetched (status: ${response.status}).');
        }
    } catch (error) {
        log(`Warning: Error fetching tracker.txt: ${error.message}`);
    }

    // 2. Fetch from remote API (e.g., newtrackon) - Use CORS proxy if needed
    const initialSize = trackers.size;
    const trackerApiUrl = 'https://corsproxy.io/?' + encodeURIComponent('https://newtrackon.com/api/stable'); // Basic CORS proxy
    // Alternative raw source: 'https://raw.githubusercontent.com/ngosang/trackerslist/master/trackers_best_ip.txt'
    //                  or: 'https://raw.githubusercontent.com/ngosang/trackerslist/master/trackers_all_ws.txt' (for websockets)

    try {
        const response = await fetch(trackerApiUrl); // Adjust timeout if needed
        if (response.ok) {
            const text = await response.text();
            const lines = text.split('\n').filter(Boolean); // Filter out empty lines
             lines.forEach(line => {
                const tracker = line.trim();
                 if (tracker && !tracker.startsWith('#')) { // Double check format if needed
                     trackers.add(tracker);
                 }
            });
            log(`Added ${trackers.size - initialSize} trackers from API (${trackerApiUrl}). Total unique: ${trackers.size}`);
        } else {
            log(`Warning: Failed to fetch trackers from API (${trackerApiUrl}), status: ${response.status}`);
        }
    } catch (error) {
        log(`Warning: Error fetching trackers from API (${trackerApiUrl}): ${error.message}`);
    }

    if (trackers.size === 0) {
         log("Warning: No external trackers loaded. Relying on torrent embedded trackers and DHT/PEX.");
         return []; // Return empty array, WebTorrent will use defaults
    } else {
         log(`Total unique external trackers fetched: ${trackers.size}`);
         return Array.from(trackers); // Convert Set back to Array
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
        buttonContainer.style.display = 'flex'; // Use flexbox for better alignment
        buttonContainer.style.gap = '5px';     // Add space between buttons
        buttonContainer.style.marginTop = '5px';

        // Download Button (Blob URL)
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
                  setTimeout(() => { // Reset after a delay
                      button.textContent = 'Download';
                      button.disabled = false;
                  }, 3000);
                  return;
             }

             file.getBlobURL((err, url) => {
                 button.disabled = false; // Re-enable button regardless of outcome
                 if (err) {
                     log(`Error getting blob URL for ${safeFileName}: ${err.message}`);
                     button.textContent = 'Error';
                      setTimeout(() => { button.textContent = 'Download'; }, 3000);
                     return;
                 }
                 if (!url) {
                     log(`Failed to generate blob URL for ${safeFileName} (maybe cancelled?).`);
                     button.textContent = 'Download';
                     return;
                 }
                 log(`Download link generated for ${safeFileName}. Starting download.`);
                 const tempLink = document.createElement('a');
                 tempLink.href = url;
                 tempLink.download = file.name; // Use original name for download attribute
                 document.body.appendChild(tempLink);
                 tempLink.click();
                 document.body.removeChild(tempLink);
                 // Consider revoking URL if memory becomes an issue: URL.revokeObjectURL(url);
                 button.textContent = 'Download';
             });
        };
        buttonContainer.appendChild(downloadButton);

        // Stream Button (using file.appendTo)
        const isStreamable = /\.(mp4|webm|mkv|ogv|ogg|mp3|wav|aac|m4a|flac|opus|oga)$/i.test(file.name);
        // Check if the method exists AND the file type is likely streamable
        if (isStreamable && typeof file.appendTo === 'function') {
            const streamButton = document.createElement('button');
            streamButton.textContent = 'Stream';
            streamButton.title = `Stream ${safeFileName}`;
            streamButton.onclick = () => streamFile(file);
            buttonContainer.appendChild(streamButton);
        } else if (isStreamable) {
             log(`Streaming not possible for ${safeFileName}: file.appendTo method missing or not supported.`);
             // Optionally add a disabled stream button here for clarity
             const disabledStreamButton = document.createElement('button');
             disabledStreamButton.textContent = 'Stream';
             disabledStreamButton.disabled = true;
             disabledStreamButton.title = `Cannot stream: appendTo method unavailable`;
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
    playerDiv.innerHTML = `<h2>Streaming: ${safeFileName}</h2>`; // Clear previous content, show title

    // Append the file to the playerDiv. WebTorrent creates the <video> or <audio> element.
    file.appendTo(playerDiv, { autoplay: true, controls: true }, (err, elem) => { // elem is the <video>/<audio> tag
        if (err) {
            log(`Error streaming ${safeFileName}: ${err.message}`);
            console.error("Streaming Error (appendTo):", err);
            let errorMsg = `<p style="color:red;">Could not stream "${safeFileName}".`;
            if (err.message.toLowerCase().includes('unsupported') || err.name === 'NotSupportedError') {
                 errorMsg += ` The browser may not support this file format or codec.`;
                 // Suggest Download as an alternative
                 errorMsg += ` You can try downloading the file instead.</p>`;
            } else if (err.message.toLowerCase().includes('network') || err.message.toLowerCase().includes('decode')) {
                 errorMsg += ` A network or decoding error occurred. Check console for details.</p>`;
            } else {
                 errorMsg += ` ${err.message}</p>`;
            }
             playerDiv.innerHTML += errorMsg; // Append error message
            return;
        }

        // Streaming started (or at least the element was created)
        log(`Streaming element created for ${safeFileName}. Playback should start soon.`);
        if (elem) {
            elem.style.maxWidth = '100%'; // Ensure video fits container
            elem.style.display = 'block';
            elem.style.marginTop = '10px';
            elem.style.backgroundColor = '#000'; // Black background

             // Additional error handling on the media element itself for runtime issues
             elem.addEventListener('error', (e) => {
                 const mediaError = elem.error;
                 let detail = 'Unknown Error';
                 if (mediaError) {
                    switch (mediaError.code) {
                        case MediaError.MEDIA_ERR_ABORTED: detail = 'Playback aborted by user.'; break;
                        case MediaError.MEDIA_ERR_NETWORK: detail = 'Network error caused download failure.'; break;
                        case MediaError.MEDIA_ERR_DECODE: detail = 'Playback aborted due to decoding error (corrupted data or unsupported features).'; break;
                        case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED: detail = 'Media source not supported (unsupported format/codec).'; break;
                        default: detail = `Code ${mediaError.code}; Message: ${mediaError.message}`;
                    }
                 }
                 log(`Media Element Error (${safeFileName}): ${detail}`);
                 console.error('Media Element Playback Error:', mediaError, e);

                 // Avoid adding duplicate messages if appendTo already showed one
                 const existingErrorP = playerDiv.querySelector('p[style*="color:red"]');
                 if(!existingErrorP) {
                      playerDiv.innerHTML += `<p style="color:red;">Playback error occurred for ${safeFileName}: ${detail}</p>`;
                 } else {
                     // Maybe update existing message
                     if (!existingErrorP.textContent.includes(detail.substring(0, 30))) { // Avoid redundant parts
                         existingErrorP.innerHTML += `<br>Additional Detail: ${detail}`;
                     }
                 }
             });

             elem.addEventListener('stalled', () => {
                 log(`Media stalled for ${safeFileName}. Waiting for data...`);
                 // Optionally add visual feedback in the playerDiv
             });
             elem.addEventListener('waiting', () => {
                 log(`Media waiting for data (buffering) for ${safeFileName}...`);
             });
              elem.addEventListener('playing', () => {
                 log(`Media playback started/resumed for ${safeFileName}.`);
             });

        } else {
            log(`Warning: appendTo completed for ${safeFileName}, but the element was not returned.`);
             playerDiv.innerHTML += `<p style="color:orange;">Streaming element created, but reference unavailable.</p>`;
        }
    });
    // IMPORTANT NOTE FOR GITHUB PAGES & OTHERS:
    // Streaming directly via `appendTo` can sometimes fail due to:
    // 1. Browser Codec Support: The browser *must* support the video/audio codec inside the container (mp4, mkv, etc.).
    // 2. Server Configuration: Some hosting (like GitHub Pages) might serve files with incorrect MIME types, confusing the browser.
    // 3. Network Issues: Slow connections or lack of peers can cause stalling.
    // If streaming consistently fails, consider more advanced techniques like MediaSource Extensions (MSE),
    // but this significantly increases complexity. The download button provides a reliable fallback.
}

// Main function to handle starting a new torrent download/stream
async function startTorrent(torrentId) { // Made async to wait for trackers
    const idString = typeof torrentId === 'string'
        ? (torrentId.startsWith('magnet:') ? torrentId.substring(0, 60) + '...' : torrentId)
        : (torrentId.name || 'Unknown File');
    log(`Starting torrent process for: ${idString}`);
    startButton.disabled = true; // Disable button while processing

    // 1. Destroy existing client if any
    if (client) {
        log('Destroying previous torrent instance...');
        await new Promise((resolve, reject) => {
            client.destroy(err => {
                if (err) {
                    log(`Error destroying previous client: ${err.message}`);
                    // Continue anyway, but log the error
                    console.error("Client Destroy Error:", err);
                } else {
                    log('Previous client destroyed successfully.');
                }
                client = null;
                resolve(); // Resolve regardless of error to proceed
            });
             // Safety timeout in case destroy hangs
             setTimeout(() => {
                 log('Destroy timeout reached, proceeding.');
                 client = null; // Ensure client is nulled
                 resolve();
             }, 3000); // 3 second timeout
        });
    }

    // 2. Fetch Trackers (only need to do this once per session ideally, but simple here)
    // If fetchedTrackers is already populated, you could skip fetching again.
    // For simplicity here, we fetch each time start is clicked.
    fetchedTrackers = await fetchTrackers(); // Wait for trackers to be fetched

    // 3. Initialize new client and add torrent
    initializeAndAddTorrent(torrentId, fetchedTrackers);

    startButton.disabled = false; // Re-enable button
}

// Initializes the WebTorrent client and adds the specified torrent
function initializeAndAddTorrent(torrentId, trackers) {
    log('Initializing new WebTorrent client...');
    const clientOptions = {
        tracker: {
            // announce: trackers // Pass the fetched trackers here
            // WebTorrent internally merges announce list with torrent file trackers, DHT, PEX etc.
        }
    };

    // Add fetched trackers if available
    if (trackers && trackers.length > 0) {
        clientOptions.tracker.announce = trackers;
        log(`Using ${trackers.length} external trackers.`);
    } else {
        log("No external trackers provided, using defaults + torrent embedded.");
    }

    try {
         client = new WebTorrent(clientOptions);
    } catch(err) {
         log(`Fatal Error: Could not initialize WebTorrent Client: ${err.message}`);
         console.error("WebTorrent Client Instantiation Error:", err);
         if(progressDiv) progressDiv.innerHTML = '<span style="color:red;">WebTorrent Init Failed!</span>';
         if(startButton) startButton.disabled = false; // Re-enable if init failed
         return;
    }

    // Generic error handler for the client instance
    client.on('error', err => {
        log(`WebTorrent Client Error: ${err.message}`);
        console.error("WebTorrent Client Error:", err);
        if (progressDiv) progressDiv.innerHTML = '<span style="color:red;">Client Error! Check console.</span>';
        if (peersDiv) peersDiv.innerText = 'Peers: 0';
        // Consider attempting to destroy the client here?
    });

    log('Adding torrent to client...');
    if (progressDiv) progressDiv.innerHTML = 'Fetching metadata...';
    if (peersDiv) peersDiv.innerText = 'Peers: 0';
    if (fileListUl) fileListUl.innerHTML = ''; // Clear file list
    if (playerDiv) playerDiv.innerHTML = '<h2>Streaming Player</h2>'; // Reset player

    try {
        // Add the torrent (magnet URI, infohash, .torrent file, or Buffer)
        client.add(torrentId, {
            // You could also add trackers specifically for this torrent here
            // announce: trackers
        }, torrent => {
            // --- Metadata Ready Callback ('torrent' event) ---
            const torrentName = torrent.name || torrent.infoHash;
            log(`Metadata received for: ${torrentName}`);
            log('Connecting to peers & preparing transfer...');
            if (progressDiv) progressDiv.innerHTML = 'Connecting / Downloading...';

            displayFiles(torrent);
            updateProgress(torrent); // Show initial progress

            // --- Torrent-Specific Event Listeners ---
            torrent.on('warning', err => {
                log(`Torrent Warning (${torrentName}): ${err.message}`);
                console.warn(`Torrent Warning (${torrentName}):`, err);
            });
            torrent.on('error', err => {
                log(`Torrent Error (${torrentName}): ${err.message}`);
                console.error(`Torrent Error (${torrentName}):`, err);
                 if (progressDiv && progressDiv.innerHTML.includes('%')) { // Only update if progress was shown
                     progressDiv.innerHTML += '<br><span style="color:red;">Torrent Error!</span>';
                 } else {
                     progressDiv.innerHTML = '<span style="color:red;">Torrent Error! Check logs.</span>';
                 }
                 updateProgress(torrent); // Update stats even on error
            });
            torrent.on('metadata', () => { // Useful if metadata loads *after* initial 'torrent' event
                log(`Metadata event fired for ${torrent.name || torrent.infoHash}. Updating file list.`);
                 if (!fileListUl.hasChildNodes() || fileListUl.textContent.includes("Waiting")) {
                    displayFiles(torrent); // Refresh file list if it wasn't populated
                 }
                 updateProgress(torrent);
            });
             torrent.on('ready', () => { // Torrent is ready to download data (has peers, necessary info)
                 log(`Torrent Ready (${torrent.name || torrent.infoHash}). Download should begin.`);
                 if (!fileListUl.hasChildNodes() || fileListUl.textContent.includes("Waiting")) {
                    displayFiles(torrent); // Refresh file list if it wasn't populated
                 }
                 updateProgress(torrent);
             });
            torrent.on('download', bytes => updateProgress(torrent)); // Update frequently
            torrent.on('upload', bytes => updateProgress(torrent)); // Update upload speed too
            torrent.on('done', () => {
                log(`Torrent finished downloading: ${torrentName}`);
                updateProgress(torrent);
                 if (progressDiv) progressDiv.innerHTML += '<br><strong style="color: lightgreen;">Download Complete!</strong>';
                // Maybe add a notification or visual cue
            });
            torrent.on('wire', (wire, addr) => {
                 // log(`Connected to peer: ${addr || 'Incoming Connection'}`); // Can be very noisy
                 updateProgress(torrent); // Update peer count
            });
            torrent.on('peer', (peerId) => { // Fired when a peer is discovered
                // log(`Discovered peer: ${peerId}`); // Also potentially noisy
                updateProgress(torrent); // Update peer count
            });
            torrent.on('noPeers', (announceType) => { // Fired when no peers found for a tracker type
                log(`Warning: No peers found via ${announceType} for ${torrentName}. Trying other sources...`);
                // This often indicates tracker issues or a dead torrent
            });

             // Sometimes metadata/files are ready immediately after 'add' but before 'torrent' event fully resolves
             if (torrent.files && torrent.files.length > 0 && (!fileListUl.hasChildNodes() || fileListUl.textContent.includes("Waiting"))) {
                 log('Files available immediately after add. Displaying.');
                 displayFiles(torrent);
             }
             updateProgress(torrent); // Initial update
        });

        // --- Code runs immediately after client.add() is called (doesn't wait for metadata) ---
        // Log the infohash early, useful for debugging. client.add returns the torrent instance synchronously.
        const addedTorrent = client.torrents[client.torrents.length - 1];
        if(addedTorrent) {
            log(`Torrent added to client (infohash: ${addedTorrent.infoHash}). Waiting for metadata...`);
            updateProgress(addedTorrent); // Show initial state (peers 0, progress 0)
        } else {
            log("Torrent potentially added, but couldn't get immediate reference.");
        }

    } catch (err) { // Catch synchronous errors during the client.add call itself
        log(`Error adding torrent: ${err.message}. Check magnet URI / file format.`);
        console.error("Client.add Error:", err);
        if (progressDiv) progressDiv.innerHTML = '<span style="color:red;">Invalid Torrent ID/File</span>';
        if (startButton) startButton.disabled = false; // Re-enable button on failure
        // Clean up client if add failed immediately
        if (client) {
            client.destroy(destroyErr => {
                 if (destroyErr) console.error("Error destroying client after add failure:", destroyErr);
            });
            client = null;
        }
    }
}


// --- Initialization and Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    // Check essential elements exist
    const essentialIds = ['torrentIdInput', 'torrentFileInput', 'startButton', 'logs', 'progress', 'peers', 'fileList', 'player'];
    let allElementsFound = true;
    essentialIds.forEach(id => {
        if (!document.getElementById(id)) {
            console.error(`CRITICAL: Essential HTML element with ID '${id}' not found AFTER DOM LOAD!`);
            allElementsFound = false;
        }
    });

    if (!allElementsFound) {
         alert("Critical Error: Page elements missing. Cannot initialize functionality. Check console for details.");
        if (startButton) startButton.disabled = true;
        return; // Stop script execution
    }
    console.log("All essential HTML elements verified after DOM Load.");


    // Attach listener to the main start button
    startButton.addEventListener('click', () => {
        console.log('Start button clicked!');
        log('Start button action triggered...');
        startButton.disabled = true; // Disable immediately

        const torrentId = torrentIdInput.value.trim();
        const file = torrentFileInput.files.length > 0 ? torrentFileInput.files[0] : null;

        console.log('Torrent ID input:', torrentId || '(empty)');
        console.log('Selected file:', file ? file.name : '(none)');

        // Prioritize file input
        if (file) {
            log(`Processing selected file: ${file.name}`);
            startTorrent(file).catch(err => { // startTorrent is async now
                 log(`Error during torrent start process: ${err.message}`);
                 console.error("startTorrent Error:", err);
                 startButton.disabled = false; // Re-enable on error
             });
            torrentIdInput.value = ''; // Clear other input
        } else if (torrentId) {
            // Basic validation (magnet, http(s) .torrent link, infohash)
            if (torrentId.startsWith('magnet:') ||
                /^[a-fA-F0-9]{40}$/i.test(torrentId) || // SHA-1 Infohash
                /^[a-fA-F0-9]{64}$/i.test(torrentId) || // SHA-256 Infohash (less common)
                /^[a-fA-F0-9]{32}$/i.test(torrentId) || // v2 hybrid infohash part? (Be careful with assumptions)
                (torrentId.startsWith('http://') || torrentId.startsWith('https://')) && torrentId.endsWith('.torrent')
               )
             {
                 log(`Processing input: ${torrentId.substring(0, 70)}...`);
                 startTorrent(torrentId).catch(err => {
                     log(`Error during torrent start process: ${err.message}`);
                     console.error("startTorrent Error:", err);
                     startButton.disabled = false;
                 });
                 torrentFileInput.value = ''; // Clear file input
            } else {
                 log('Input Error: Invalid Magnet URI, Info Hash, or .torrent URL format.');
                 console.log('Invalid input format detected.');
                 startButton.disabled = false; // Re-enable button
            }
        } else {
            log('Input Error: Please enter a magnet link/info hash/URL or select a .torrent file.');
            console.log('No valid input found.');
            startButton.disabled = false; // Re-enable button
        }
        // Note: startTorrent will re-enable the button itself upon completion/failure within its own scope.
    });
    console.log("Click listener added to startButton.");

    // Listeners to clear the other input field when one is used
    torrentIdInput.addEventListener('input', () => {
        if (torrentIdInput.value.trim() !== '' && torrentFileInput.value !== '') {
             log("Clearing file input as text ID was entered.");
             torrentFileInput.value = ''; // Clear file if text is typed
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
                 torrentIdInput.value = ''; // Clear text if file is chosen
             }
        } else {
             console.log('File input cleared or no file selected.');
             // Do not clear the text input if the file input is cleared.
        }
    });
    console.log("Change listener added to torrentFileInput.");

    // Initial log messages
    log('WebTorrent Client UI Initialized. Ready for input.');
    log("--------------------------------------------------");
    log("LEGAL DISCLAIMER: Only use this tool for content you have the legal right to share and download.");
    log("Downloading copyrighted material without permission may be illegal in your jurisdiction.");
    log("--------------------------------------------------");
    log("Fetching initial tracker list...");
    // Pre-fetch trackers on load so they might be ready for the first click
    fetchTrackers().then(trackers => {
        fetchedTrackers = trackers;
        log(`Initial tracker fetch complete. ${trackers.length} trackers ready.`);
    }).catch(err => {
        log(`Initial tracker fetch failed: ${err.message}`);
    });

}); // End of DOMContentLoaded

// Log message indicates script file itself has loaded, before DOM might be ready
console.log("script.js loaded. Waiting for DOM content...");
