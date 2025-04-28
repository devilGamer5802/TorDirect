// --- Initial Checks & Global Setup ---
if (typeof WebTorrent === 'undefined') {
    console.error("WebTorrent library not loaded!");
    alert("Error: WebTorrent library failed to load. The application cannot start.");
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

// --- Logging Utility ---
function log(message) {
    console.log(message); // Also log to browser console for debugging
    if (logsDiv) {
        const time = new Date().toLocaleTimeString();
        // Sanitize message before inserting into HTML to prevent XSS
        const sanitizedMessage = message.toString().replace(/</g, "<").replace(/>/g, ">");
        logsDiv.innerHTML = `[${time}] ${sanitizedMessage}<br>` + logsDiv.innerHTML; // Prepend new logs
    } else {
        // Avoid logging error before DOM might be ready
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
    } else if (torrent.downloadSpeed > 0 && torrent.length && torrent.length > torrent.downloaded) {
         // Calculate remaining time based on current speed
         const remainingBytes = torrent.length - torrent.downloaded;
         const secondsRemaining = remainingBytes / torrent.downloadSpeed;
         remaining = formatTime(secondsRemaining);
    }

    progressDiv.innerHTML = `
        Progress: ${percent}% <br>
        Downloaded: ${downloaded} / ${total} <br>
        Speed: ↓ ${dlSpeed} / ↑ ${ulSpeed} <br>
        Time Remaining: ${remaining}
    `;
    peersDiv.innerText = `Peers: ${torrent.numPeers}`;
}

// Formats byte values into human-readable strings (KB, MB, GB etc.)
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0 || !bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    // Basic validation for input type
    if (isNaN(bytes) || typeof bytes !== 'number' || bytes < 0) {
         return 'Invalid Size';
    }
    if (bytes === 0) return '0 Bytes'; // Avoid Math.log(0)
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    // Ensure index stays within the bounds of the sizes array
    const validIndex = Math.min(Math.max(0, i), sizes.length - 1);
    return parseFloat((bytes / Math.pow(k, validIndex)).toFixed(dm)) + ' ' + sizes[validIndex];
}

// Formats seconds into HH:MM:SS string
function formatTime(seconds) {
     // Handle invalid or non-finite inputs
     if (!seconds || seconds === Infinity || isNaN(seconds) || seconds < 0) return 'N/A';
    try {
        const date = new Date(0);
        date.setSeconds(seconds);
        return date.toISOString().substr(11, 8); // Extract HH:MM:SS part
    } catch (e) {
         console.error("Error formatting time:", e);
         return 'N/A';
    }
}


// --- Core Torrent Handling ---

// Renders the list of files in the torrent
function displayFiles(torrent) {
    if (!fileListUl || !playerDiv) return; // Ensure elements exist
    fileListUl.innerHTML = ''; // Clear previous list
    playerDiv.innerHTML = '<h2>Streaming Player</h2>'; // Reset player area

    // Handle cases where files might not be ready yet
    if (!torrent.files || torrent.files.length === 0) {
        log("No files found in torrent yet, or torrent is empty.");
        const li = document.createElement('li');
        li.textContent = "Waiting for file information...";
        fileListUl.appendChild(li);
        return;
    }

    log(`Displaying ${torrent.files.length} file(s) for torrent: ${torrent.name || torrent.infoHash}`);

    torrent.files.forEach((file, index) => {
        const li = document.createElement('li');
        const fileInfoSpan = document.createElement('span');
        const fileName = file.name || 'Unknown File';
        const fileLength = typeof file.length === 'number' ? formatBytes(file.length) : 'Unknown Size';
        fileInfoSpan.textContent = `${fileName} (${fileLength})`;
        li.appendChild(fileInfoSpan);

        // Container for action buttons (Download, Stream)
        const buttonContainer = document.createElement('div');
        buttonContainer.style.whiteSpace = 'nowrap'; // Keep buttons on one line

        // Create Download button (uses Blob URL)
        const downloadButton = document.createElement('a');
        downloadButton.textContent = 'Download';
        downloadButton.href = '#'; // Prevents navigation before blob generation
        downloadButton.download = file.name; // Suggest filename to browser
        downloadButton.title = `Download ${file.name}`;
        downloadButton.onclick = (e) => {
             e.preventDefault(); // Stop default link behavior
             log(`Preparing download for ${file.name}...`);
             e.target.textContent = 'Generating...'; // Provide user feedback
             e.target.style.opacity = '0.6';
             e.target.style.pointerEvents = 'none';

             // Check if method exists (robustness)
             if (typeof file.getBlobURL !== 'function') {
                  log(`Error: file.getBlobURL is not available for ${file.name}. Cannot generate download link.`);
                  e.target.textContent = 'Error';
                  e.target.style.opacity = '1';
                  e.target.style.pointerEvents = 'auto';
                  return;
             }

             // Generate Blob URL and trigger download
             file.getBlobURL((err, url) => {
                 if (err) {
                     log(`Error getting blob URL for ${file.name}: ${err.message}`);
                     e.target.textContent = 'Error';
                      e.target.style.opacity = '1';
                      e.target.style.pointerEvents = 'auto';
                     return;
                 }
                 if (!url) { // Handle cases where URL generation might fail silently
                     log(`Failed to generate blob URL for ${file.name} (maybe cancelled or empty?).`);
                      e.target.textContent = 'Download'; // Reset button
                      e.target.style.opacity = '1';
                      e.target.style.pointerEvents = 'auto';
                     return;
                 }
                 // Create a temporary link and click it programmatically
                 log(`Download link generated for ${file.name}. Starting download.`);
                 const tempLink = document.createElement('a');
                 tempLink.href = url;
                 tempLink.download = file.name;
                 document.body.appendChild(tempLink);
                 tempLink.click();
                 document.body.removeChild(tempLink);
                 // Note: Consider revoking `url` later if memory is a concern.
                 e.target.textContent = 'Download'; // Reset button after click
                 e.target.style.opacity = '1';
                 e.target.style.pointerEvents = 'auto';
             });
        };
        buttonContainer.appendChild(downloadButton);

        // Create Stream button (uses file.appendTo)
        const isStreamable = /\.(mp4|webm|mkv|ogv|ogg|mp3|wav|aac|m4a|flac|opus|oga)$/i.test(file.name); // Common streamable types
        // Crucially check if the method exists on the file object
        if (isStreamable && typeof file.appendTo === 'function') {
            const streamButton = document.createElement('button');
            streamButton.textContent = 'Stream';
            streamButton.title = `Stream ${file.name}`;
            streamButton.onclick = () => streamFile(file); // Call dedicated streaming function
            buttonContainer.appendChild(streamButton);
        } else if (isStreamable) {
             log(`Streaming not possible for ${file.name}: appendTo method missing.`); // Log if stream method is missing
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

    // Defensive check if appendTo method exists
    if (typeof file.appendTo !== 'function') {
         log(`Error: Cannot stream ${file.name}. appendTo method not available.`);
         playerDiv.innerHTML = `<h2>Streaming Player</h2><p style="color:red;">Cannot stream "${file.name}". Method unavailable.</p>`;
         return;
    }

    log(`Attempting to stream ${file.name} using file.appendTo()...`);
    playerDiv.innerHTML = '<h2>Streaming Player</h2>'; // Clear previous content

    // Use WebTorrent's built-in method to stream to the element
    file.appendTo(playerDiv, (err, elem) => { // `elem` is the <video> or <audio> element created
        if (err) {
            // Handle errors during streaming setup or playback initialization
            log(`Error streaming ${file.name}: ${err.message}`);
            console.error("Streaming Error (appendTo):", err);
            // Provide user feedback about the error
            if (err.message.toLowerCase().includes('unsupported file type') ||
                err.message.toLowerCase().includes('cannot play media') ||
                err.name === 'NotSupportedError' ) {
                 playerDiv.innerHTML += `<p style="color:yellow;">Cannot stream "${file.name}". The browser does not support this file format.</p>`;
            } else {
                 playerDiv.innerHTML += `<p style="color:red;">Could not stream "${file.name}". ${err.message}</p>`;
            }
            return; // Stop if streaming fails
        }

        // Streaming started successfully
        log(`Streaming ${file.name} in the player area.`);
        if (elem) { // Apply styles to the dynamically created element
            elem.style.maxWidth = '100%';
            elem.style.display = 'block';
            elem.style.marginTop = '10px';
            elem.style.backgroundColor = '#000'; // Show black bg before video loads

             // Add extra error handler to the media element itself for runtime playback errors
             elem.addEventListener('error', (e) => {
                log(`Media element error for ${file.name}: Code ${elem.error?.code}, Message: ${elem.error?.message}`);
                console.error('Media Element Playback Error:', elem.error, e);
                 const errorP = playerDiv.querySelector('p[style*="color:red"], p[style*="color:yellow"]');
                 if(!errorP) { // Avoid duplicate messages if appendTo already reported one
                      playerDiv.innerHTML += `<p style="color:red;">Playback error occurred for ${file.name}.</p>`;
                 }
             });
        }
    });
}


// Main function to handle starting a new torrent download/stream
function startTorrent(torrentId) {
    const idString = typeof torrentId === 'string' ? torrentId.substring(0, 50) + '...' : (torrentId.name || 'Unknown File');
    log(`Starting torrent process for: ${idString}`);

    // Ensure any previous torrent instance is destroyed before starting a new one
    if (client) {
        log('Destroying previous torrent instance...');
        client.destroy(err => {
            if (err) {
                log(`Error destroying previous client: ${err.message}`);
            } else {
                log('Previous client destroyed successfully.');
            }
            client = null; // Set client to null *after* destroy completes
            initializeAndAddTorrent(torrentId); // Proceed to initialize new one
        });
    } else {
        // No client exists, safe to initialize
        initializeAndAddTorrent(torrentId);
    }
}

// Initializes the WebTorrent client and adds the specified torrent
function initializeAndAddTorrent(torrentId) {
    log('Initializing new WebTorrent client...');
    const options = { /* Add tracker/RTC options here if needed */ };
    try {
         // Instantiate the client
         client = new WebTorrent(options);
    } catch(err) {
         // Handle fatal errors during client creation
         log(`Fatal Error: Could not initialize WebTorrent Client: ${err.message}`);
         console.error("WebTorrent Client Instantiation Error:", err);
         if(progressDiv) progressDiv.innerHTML = 'WebTorrent Init Failed!';
         return; // Stop processing
    }

    // Generic error handler for the client instance itself
    client.on('error', err => {
        log(`WebTorrent Client Error: ${err.message}`);
        if (progressDiv) progressDiv.innerHTML = 'Client Error! Check console.';
        if (peersDiv) peersDiv.innerText = '';
    });

    // Reset UI elements
    log('Adding torrent to client...');
    if (progressDiv) progressDiv.innerHTML = 'Connecting to peers...';
    if (peersDiv) peersDiv.innerText = 'Peers: 0';
    if (fileListUl) fileListUl.innerHTML = '';
    if (playerDiv) playerDiv.innerHTML = '<h2>Streaming Player</h2>';

    try {
        // Add the torrent (magnet URI, infohash, or file object)
        // The second argument is a callback executed when torrent metadata is ready
        const torrentInstance = client.add(torrentId, torrent => {
            // --- Metadata Ready Callback ---
            log(`Torrent metadata ready: ${torrent.name || torrent.infoHash}`);
            log('Connecting to peers & starting transfer...');
            if (progressDiv) progressDiv.innerHTML = 'Connecting / Downloading...';
            displayFiles(torrent); // Show files list
            updateProgress(torrent); // Show initial progress info

            // --- Attach Torrent-Specific Event Listeners ---
            torrent.on('warning', err => log(`Torrent warning (${torrent.name || torrent.infoHash}): ${err.message}`));
            torrent.on('error', err => { // Errors specific to this torrent
                 log(`Torrent error (${torrent.name || torrent.infoHash}): ${err.message}`);
                 if (progressDiv) progressDiv.innerHTML = 'Torrent Error! Check console.';
                 updateProgress(torrent);
            });
            torrent.on('download', bytes => updateProgress(torrent)); // Fired frequently
            torrent.on('upload', bytes => updateProgress(torrent)); // Update for upload speed display
            torrent.on('done', () => { // Torrent finished downloading all pieces
                log(`Torrent finished downloading: ${torrent.name || torrent.infoHash}`);
                updateProgress(torrent);
                if (progressDiv) progressDiv.innerHTML += '<br><strong>Download Complete!</strong>';
            });
            torrent.on('wire', (wire, addr) => { // Fired when connected to a new peer
                 log(`Connected to peer: ${addr || 'Incoming Connection'}`);
                 updateProgress(torrent); // Update peer count display
            });

             // Refresh file list and progress again after attaching listeners
             if (!document.getElementById('fileList').hasChildNodes() && torrent.files?.length > 0) {
                 displayFiles(torrent);
            }
             updateProgress(torrent);
        });

        // --- Code runs immediately after client.add() ---
        log(`Torrent added (infohash: ${torrentInstance.infoHash}). Waiting for metadata...`);
        if (progressDiv) progressDiv.innerHTML = 'Fetching metadata...';
        updateProgress(torrentInstance); // Update progress display early (shows peer count)

        // Torrent might be ready instantly (e.g. from cache or fast metadata retrieval)
        torrentInstance.on('ready', () => { // Fired when torrent can start downloading/seeding data
            log(`Torrent ready event fired: ${torrentInstance.name || torrentInstance.infoHash}`);
            displayFiles(torrentInstance);
            updateProgress(torrentInstance);
        });
        // Check if metadata was somehow available even before 'ready' event
        if (torrentInstance.metadata && !document.getElementById('fileList').hasChildNodes()) {
             log('Torrent had metadata immediately.');
             displayFiles(torrentInstance);
             updateProgress(torrentInstance);
        }

    } catch (err) { // Catch synchronous errors during the client.add call itself
        log(`Error adding torrent: ${err.message}. Likely invalid magnet URI or file.`);
        console.error("Client.add Error:", err);
        if (progressDiv) progressDiv.innerHTML = 'Invalid Torrent ID/File';
        // Clean up potentially partially initialized client on add failure
        if (client) {
            client.destroy();
            client = null;
        }
    }
}


// --- Initialization and Event Listeners (Executed after DOM is ready) ---
document.addEventListener('DOMContentLoaded', () => {
    // Final check that all needed HTML elements are present
    if (!document.getElementById('torrentIdInput') || !document.getElementById('torrentFileInput') || !document.getElementById('startButton') || !document.getElementById('logs') || !document.getElementById('progress') || !document.getElementById('peers') || !document.getElementById('fileList') || !document.getElementById('player')) {
        console.error("CRITICAL: One or more essential HTML elements were not found AFTER DOM LOAD! Check IDs in index.html.");
         alert("Critical Error: Page elements missing. Cannot initialize functionality.");
        if (startButton) startButton.disabled = true; // Prevent interaction
        return; // Stop script execution
    }

    console.log("All essential HTML elements found after DOM Load.");

    // Attach listener to the main start button
    if(startButton) {
         startButton.addEventListener('click', () => {
            console.log('Start button clicked!');
            log('Start button action triggered...');

            const torrentId = torrentIdInput ? torrentIdInput.value.trim() : null;
             const file = torrentFileInput && torrentFileInput.files.length > 0 ? torrentFileInput.files[0] : null;

            console.log('Torrent ID input value:', torrentId);
            console.log('Selected file object:', file);

             if(!torrentIdInput || !torrentFileInput) {
                  log("Error: Input elements not found!"); // Should not happen if initial check passed
                  return;
             }

             // Determine whether to start from file input or text input
            if (file) { // Prioritize file input if both are filled
                log(`Processing selected file: ${file.name}`);
                startTorrent(file);
                torrentIdInput.value = ''; // Clear other input
            } else if (torrentId) {
                // Basic validation for magnet URI or info hash format
                if (torrentId.startsWith('magnet:') || /^[a-fA-F0-9]{40}$/i.test(torrentId) || /^[a-fA-F0-9]{32}$/i.test(torrentId)) {
                     log(`Processing input ID/Magnet: ${torrentId.substring(0,50)}...`);
                     startTorrent(torrentId);
                     torrentFileInput.value = ''; // Clear other input
                } else {
                     log('Input Error: Invalid Magnet URI or Info Hash format.');
                     console.log('Invalid magnet/hash format.');
                }
            } else {
                // No valid input provided
                log('Input Error: Please enter a magnet link/info hash or select a .torrent file.');
                console.log('No valid input found.');
            }
        });
        console.log("Click listener added to startButton.");
    } else {
         console.error("startButton not found, cannot add click listener."); // Should not happen
    }

    // Add listeners to clear one input type if the other is used
    if(torrentIdInput) {
        torrentIdInput.addEventListener('input', () => {
            if (torrentIdInput.value.trim() !== '' && torrentFileInput) {
                 torrentFileInput.value = ''; // Clear file if text is typed
            }
        });
        console.log("Input listener added to torrentIdInput.");
    }

     if(torrentFileInput) {
        torrentFileInput.addEventListener('change', () => {
            console.log('File input changed!');
            if (torrentFileInput.files.length > 0) {
                 const selectedFile = torrentFileInput.files[0];
                 console.log('File selected:', selectedFile.name);
                 log(`File selected via input: ${selectedFile.name}`);
                 if (torrentIdInput) torrentIdInput.value = ''; // Clear text if file is chosen
            } else {
                 console.log('File input cleared or no file selected.');
            }
        });
        console.log("Change listener added to torrentFileInput.");
     }

    // Log that initialization is complete
    log('WebTorrent Client UI Initialized. Ready for input.');
    log("--------------------------------------------------");
    log("LEGAL DISCLAIMER: Only use this tool for content you have the legal right to share and download.");
    log("Downloading copyrighted material without permission may be illegal in your jurisdiction.");
    log("--------------------------------------------------");

}); // End of DOMContentLoaded

// Log message indicates script file itself has loaded, before DOM might be ready
log("Script loaded. Waiting for DOM content.");
