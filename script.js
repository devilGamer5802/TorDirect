// --- Keep previous functions: log, updateProgress, formatBytes, formatTime, ---
// --- displayFiles (we'll slightly modify displayFiles later), startTorrent, ---
// --- initializeAndAddTorrent ---

// Get DOM elements (Ensure these are correct)
const torrentIdInput = document.getElementById('torrentIdInput');
const torrentFileInput = document.getElementById('torrentFileInput');
const startButton = document.getElementById('startButton');
const logsDiv = document.getElementById('logs');
const progressDiv = document.getElementById('progress');
const peersDiv = document.getElementById('peers');
const fileListUl = document.getElementById('fileList');
const playerDiv = document.getElementById('player'); // Make sure this ID matches your HTML

let client = null;

// --- Logging Utility ---
function log(message) {
    console.log(message); // Also log to browser console for more details
    const time = new Date().toLocaleTimeString();
    // Simple sanitization to prevent accidental HTML injection if message contains < >
    const sanitizedMessage = message.replace(/</g, "<").replace(/>/g, ">");
    logsDiv.innerHTML = `[${time}] ${sanitizedMessage}<br>` + logsDiv.innerHTML;
}

// --- Display Progress ---
function updateProgress(torrent) {
    const percent = (torrent.progress * 100).toFixed(2);
    const downloaded = formatBytes(torrent.downloaded);
    const total = formatBytes(torrent.length);
    const dlSpeed = formatBytes(torrent.downloadSpeed) + '/s';
    const ulSpeed = formatBytes(torrent.uploadSpeed) + '/s';
    // Use 'Infinity' check for timeRemaining
    const remaining = torrent.timeRemaining && torrent.timeRemaining !== Infinity ? formatTime(torrent.timeRemaining / 1000) : 'N/A';

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
    if (bytes === 0 || !bytes) return '0 Bytes'; // Handle null/undefined bytes
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    // Handle potential non-finite numbers before log
    if (!Number.isFinite(bytes) || bytes < 0) return 'Invalid Size';
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// --- Format Time (seconds to H:M:S) ---
function formatTime(seconds) {
     if (!Number.isFinite(seconds) || seconds < 0) return 'N/A';
    const date = new Date(0);
    date.setSeconds(seconds);
    // Handle cases where seconds might be extremely large resulting in invalid dates
    try {
       return date.toISOString().substr(11, 8);
    } catch (e) {
       return 'Calculating...';
    }
}


// --- Display Files (Minor change: ensure playerDiv is cleared here too) ---
function displayFiles(torrent) {
    fileListUl.innerHTML = ''; // Clear previous list
    playerDiv.innerHTML = '<h2>Streaming Player</h2>'; // Clear player when files are listed

    log(`Listing ${torrent.files.length} files for torrent: ${torrent.name}`);

    if (torrent.files.length === 0) {
        log("No files found in torrent metadata yet or torrent is empty.");
        return;
    }

    torrent.files.forEach((file, index) => {
        const li = document.createElement('li');
        li.textContent = `[${index + 1}] ${file.name} (${formatBytes(file.length)})`;

        // Download Button
        const downloadButton = document.createElement('a');
        downloadButton.textContent = 'Download';
        downloadButton.href = '#';
        downloadButton.download = file.name;
        downloadButton.title = `Download ${file.name}`;
        downloadButton.dataset.fileIndex = index; // Store index for potential later use
        downloadButton.addEventListener('click', (e) => {
            e.preventDefault(); // Prevent '#' navigation
            const clickedButton = e.target;
            const currentTorrent = client?.get(torrent.infoHash); // Get current torrent instance
            if (!currentTorrent) {
                log("Error: Torrent instance not found for download.");
                return;
            }
            const fileToDownload = currentTorrent.files[index]; // Get file by index

            if (!fileToDownload) {
                log(`Error: File at index ${index} not found.`);
                 clickedButton.textContent = 'Error';
                return;
            }

            log(`Generating download link for ${fileToDownload.name}...`);
            clickedButton.textContent = 'Generating...';
            clickedButton.style.pointerEvents = 'none';
            fileToDownload.getBlobURL((err, url) => {
                clickedButton.style.pointerEvents = 'auto'; // Re-enable button
                if (err) {
                    log(`Error getting blob URL: ${err.message}`);
                    console.error("Blob URL Error:", err);
                    clickedButton.textContent = 'Error';
                    return;
                }
                log(`Download link ready for ${fileToDownload.name}`);
                clickedButton.href = url;
                clickedButton.textContent = 'Ready! Click again';
                // Optional: Auto-click
                // clickedButton.click();
            });
        });
        li.appendChild(downloadButton);

        // Stream Button - More specific checks
        const isStreamableVideo = /\.(mp4|webm|mkv|mov|avi)$/i.test(file.name); // Added mkv, mov, avi (browser support varies!)
        const isStreamableAudio = /\.(mp3|wav|flac|aac|m4a|ogg|opus)$/i.test(file.name); // Added ogg, opus
        if (isStreamableVideo || isStreamableAudio) {
            const streamButton = document.createElement('button');
            streamButton.textContent = 'Stream';
            streamButton.title = `Stream ${file.name}`;
            streamButton.dataset.fileIndex = index; // Store index
            streamButton.onclick = (e) => {
                 const clickedButton = e.target;
                 const currentTorrent = client?.get(torrent.infoHash); // Get current torrent instance
                 if (!currentTorrent) {
                    log("Error: Torrent instance not found for streaming.");
                    return;
                 }
                 const fileToStream = currentTorrent.files[index]; // Get file by index
                  if (!fileToStream) {
                    log(`Error: File at index ${index} not found for streaming.`);
                    return;
                 }
                streamFile(fileToStream, isStreamableVideo); // Pass file object and type
            };
            li.appendChild(streamButton);
        }

        fileListUl.appendChild(li);
    });
}

// --- Stream File (Enhanced Logging and Error Handling) ---
function streamFile(file, isVideo) {
    log(`Attempting to stream: ${file.name} (IsVideo: ${isVideo})`);
    playerDiv.innerHTML = '<h2>Streaming Player</h2>'; // Clear previous player

    // Create media element
    const mediaElement = document.createElement(isVideo ? 'video' : 'audio');
    mediaElement.controls = true;
    mediaElement.autoplay = true; // Autoplay might be blocked by browser policy, user might need to click play
    log(`Created ${isVideo ? 'video' : 'audio'} element.`);

    // --- Add event listeners DIRECTLY to the media element for debugging ---
    mediaElement.addEventListener('error', (e) => {
        const error = e.target.error;
        let errorMessage = 'Unknown error';
        if (error) {
            switch (error.code) {
                case MediaError.MEDIA_ERR_ABORTED:
                    errorMessage = 'Playback aborted by user or script.';
                    break;
                case MediaError.MEDIA_ERR_NETWORK:
                    errorMessage = 'Network error caused playback failure.';
                    break;
                case MediaError.MEDIA_ERR_DECODE:
                    errorMessage = 'Decoding error: The media file might be corrupted or the browser does not support the codec.';
                    break;
                case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
                    errorMessage = 'Source format not supported (codec issue likely).';
                    break;
                default:
                    errorMessage = `An unknown error occurred (Code: ${error.code})`;
            }
        }
         log(`*** Media Element Error for ${file.name}: ${errorMessage}`);
         console.error('Media Element Error Event:', e);
          playerDiv.innerHTML += `<p style="color: red;">Error playing ${file.name}: ${errorMessage}</p>`; // Show error in UI
    });

     mediaElement.addEventListener('loadedmetadata', () => log(`Metadata loaded for ${file.name}. Duration: ${mediaElement.duration}`));
     mediaElement.addEventListener('canplay', () => log(`${file.name} reports it can play.`));
     mediaElement.addEventListener('waiting', () => log(`${file.name} is waiting for more data...`));
     mediaElement.addEventListener('stalled', () => log(`${file.name} stalled (network?).`));
     mediaElement.addEventListener('playing', () => log(`Playback started for ${file.name}.`));
     mediaElement.addEventListener('progress', () => {
         // Optional: Log buffering progress
         try {
            const buffered = mediaElement.buffered;
            if (buffered.length > 0) {
                const bufferedEnd = buffered.end(buffered.length - 1);
                // console.log(`Buffer progress: ${bufferedEnd.toFixed(2)}s`); // Can be noisy
            }
         } catch(e) { /* ignore potential errors reading buffer */ }
     });

    // Append the element *before* calling renderTo, crucial!
    playerDiv.appendChild(mediaElement);
    log(`Appended ${isVideo ? 'video' : 'audio'} element to the player div.`);

    // Call renderTo
    log(`Calling file.renderTo for ${file.name}...`);
    file.renderTo(mediaElement, (err, elem) => {
        // This callback fires when renderTo *starts* or errors immediately
        if (err) {
            log(`*** Error initiating renderTo for ${file.name}: ${err.message}`);
            console.error("renderTo Initiation Error:", err);
             playerDiv.innerHTML += `<p style="color: red;">Failed to start streaming ${file.name}: ${err.message}</p>`;
            // Attempt to remove the failed media element
            try {
                playerDiv.removeChild(mediaElement);
            } catch (removeErr) {/* ignore */}
            return;
        }
        // 'elem' here is the same as 'mediaElement' we passed in
        log(`file.renderTo successfully initiated for ${file.name}. Waiting for browser playback events.`);
        // Playback and buffering are now handled by the browser and the element's event listeners above.
    });
}


// --- Start Download/Stream ---
function startTorrent(torrentId) {
     // Clear previous state thoroughly
    log(`Starting torrent: ${typeof torrentId === 'string' ? torrentId.substring(0, 40)+'...' : torrentId.name}`);
    progressDiv.innerHTML = 'Initializing...';
    peersDiv.innerText = 'Peers: 0';
    fileListUl.innerHTML = '';
    playerDiv.innerHTML = '<h2>Streaming Player</h2>';
    logsDiv.innerHTML = ''; // Clear logs for new torrent

    // Destroy previous client *properly*
    if (client) {
        log('Attempting to destroy previous torrent client instance...');
        // Wrap in a promise to ensure destruction before re-init
        new Promise((resolve, reject) => {
            client.destroy(err => {
                if (err) {
                    log(`Error destroying previous client (continuing anyway): ${err.message}`);
                    console.error("Client Destroy Error:", err);
                } else {
                    log('Previous client destroyed successfully.');
                }
                client = null; // Nullify reference
                resolve();
            });
             // Add a timeout in case destroy hangs
             setTimeout(() => {
                 log('Client destroy timeout reached (continuing anyway).');
                 client = null; // Force nullify
                 resolve();
             }, 3000); // 3 second timeout
        }).then(() => {
            initializeAndAddTorrent(torrentId);
        });
    } else {
        // Initialize client for the first time
        initializeAndAddTorrent(torrentId);
    }
}

function initializeAndAddTorrent(torrentId) {
    log('Initializing new WebTorrent client...');
    try {
        client = new WebTorrent(); // Use default trackers
         // You could add specific trackers here if needed:
         // client = new WebTorrent({
         //   tracker: {
         //     rtcConfig: { // Optional: STUN/TURN servers
         //        iceServers: [
         //          { urls: 'stun:stun.l.google.com:19302' },
         //          { urls: 'stun:global.stun.twilio.com:3478?transport=udp' }
         //        ]
         //      },
         //     announce: [ // Optional: Add known WSS trackers
         //        'wss://tracker.openwebtorrent.com',
         //        'wss://tracker.webtorrent.dev', // Example, check for active ones
         //        // Add more trackers here
         //     ]
         //   }
         // });

    } catch (err) {
        log(`*** FATAL: Failed to initialize WebTorrent client: ${err.message}`);
        console.error("WebTorrent Initialization Error:", err);
        progressDiv.innerHTML = 'Client Initialization Failed!';
        return; // Stop here
    }


    client.on('error', err => {
        log(`*** Client Instance Error: ${err.message}`);
        console.error("WebTorrent Client Error:", err);
        // Don't destroy client here automatically, could be a recoverable error
        // or related to a specific torrent add attempt.
        progressDiv.innerHTML = 'Client Error!';
        peersDiv.innerText = '';
    });

    log('Adding torrent...');
    progressDiv.innerHTML = 'Adding torrent...';
    peersDiv.innerText = 'Peers: 0'; // Reset peer count visually

    try {
        client.add(torrentId, {
           // Optional: Set path if you were saving to filesystem (not applicable in browser like this)
           // path: '/downloads/'
           // Optional: Announce list override per torrent
           // announce: ['wss://...']
        }, torrent => { // The callback when the torrent is added (infohash known)
            log(`Torrent added: ${torrent.name || 'Fetching Name...'} (${torrent.infoHash})`);
            log('Connecting to peers and fetching metadata (if needed)...');
            progressDiv.innerHTML = 'Connecting...';
            updateProgress(torrent); // Show initial peer count etc.

            // Clear player/files again just in case of race conditions
            fileListUl.innerHTML = '';
            playerDiv.innerHTML = '<h2>Streaming Player</h2>';

            // --- Torrent Event Listeners ---

            torrent.on('metadata', () => {
                log(`Metadata received for: ${torrent.name}`);
                displayFiles(torrent); // Display files once metadata is known
                updateProgress(torrent); // Update with total size etc.
            });

            torrent.on('ready', () => {
                log(`Torrent ready: ${torrent.name}. Can start downloading/streaming files.`);
                 updateProgress(torrent);
                // Ensure files are displayed if 'ready' fires before 'metadata' somehow finished UI update
                 if (torrent.files.length > 0 && fileListUl.childElementCount === 0) {
                     log("Ready event: Re-displaying files.");
                     displayFiles(torrent);
                 } else if (torrent.files.length === 0) {
                      log("Ready event: Torrent has no files listed.");
                 }
            });

            torrent.on('warning', err => {
                log(`Torrent Warning (${torrent.name}): ${err.message}`);
                console.warn("Torrent Warning:", err);
            });

             torrent.on('error', err => {
                log(`*** Torrent Error (${torrent.name}): ${err.message}`);
                console.error("Torrent Error:", err);
                // Display error specifically for this torrent
                progressDiv.innerHTML = `Error with torrent: ${torrent.name}`;
                // Optionally try removing the torrent from the client if it's fatal?
                // client.remove(torrent.infoHash, removeErr => {...});
            });

            torrent.on('download', bytes => {
                // This can fire very frequently, maybe throttle UI updates
                // For now, update on every chunk for debugging
                updateProgress(torrent);
            });

            torrent.on('upload', bytes => {
                updateProgress(torrent);
            });

             torrent.on('wire', (wire, addr) => {
                // console.log(`Connected to peer: ${addr || 'Unknown Address'}`); // Can be very noisy
            });
             torrent.on('peer', (addr) => {
                // console.log(`Discovered peer: ${addr}`); // Can be very noisy
             });
              torrent.on('noPeers', (announceType) => {
                log(`No peers found via ${announceType}. Torrent may be stalled.`);
              });


            torrent.on('done', () => {
                log(`Torrent finished downloading: ${torrent.name}`);
                updateProgress(torrent);
                 // Add a visual cue
                 progressDiv.innerHTML += "<br><b>Download Complete!</b>";
            });

            // Initial display if metadata was somehow included immediately (unlikely for magnet)
            if (torrent.files && torrent.files.length > 0 && fileListUl.childElementCount === 0) {
                log("Initial torrent object has files, displaying.");
                displayFiles(torrent);
            }
            updateProgress(torrent); // Show initial state

        }); // End client.add callback

    } catch(addError) {
         log(`*** Error during client.add call: ${addError.message}`);
         console.error("Client Add Error:", addError);
         progressDiv.innerHTML = 'Failed to add torrent!';
    }
}


// --- Event Listeners ---
startButton.addEventListener('click', () => {
    const torrentId = torrentIdInput.value.trim();
    const file = torrentFileInput.files[0];

    if (file) {
        // log(`Selected file: ${file.name}`); // Logged in startTorrent now
        startTorrent(file);
        torrentIdInput.value = '';
        // Important: Clear the file input so the 'change' event fires if the same file is selected again
        torrentFileInput.value = '';
    } else if (torrentId) {
        // Basic validation for magnet links (very simple)
        if (!torrentId.startsWith('magnet:?xt=urn:btih:') && !/^[a-fA-F0-9]{40}$/.test(torrentId)) {
             log('Invalid Magnet URI or InfoHash format.');
             // Maybe show an error message near the input
             return;
        }
        // log(`Using magnet/hash: ${torrentId.substring(0, 30)}...`); // Logged in startTorrent now
        startTorrent(torrentId);
        torrentFileInput.value = ''; // Clear file input just in case
    } else {
        log('Please enter a magnet link/infohash or select a .torrent file.');
    }
});

// Optional: Clear file input if text is entered, and vice versa
torrentIdInput.addEventListener('input', () => {
    if (torrentIdInput.value.trim() !== '' && torrentFileInput.files.length > 0) {
        torrentFileInput.value = ''; // Clear file input
    }
});
torrentFileInput.addEventListener('change', () => {
    if (torrentFileInput.files.length > 0 && torrentIdInput.value.trim() !== '') {
        torrentIdInput.value = ''; // Clear text input
    }
});

// Initial log message
log('WebTorrent Client Initialized. Ready for input.');
// Check for WebRTC support explicitly
if (!WebTorrent.WEBRTC_SUPPORT) {
    log('*** WARNING: WebRTC is not supported in this browser. WebTorrent functionality will be severely limited or non-functional.');
    startButton.disabled = true; // Disable start button if no WebRTC
    torrentIdInput.disabled = true;
    torrentFileInput.disabled = true;
    // Display a prominent error message
    const errorDisplay = document.createElement('p');
    errorDisplay.style.color = 'red';
    errorDisplay.style.fontWeight = 'bold';
    errorDisplay.textContent = 'WebRTC is required for this application to work. Please use a compatible browser (like Chrome or Firefox).';
    document.querySelector('.input-area').insertAdjacentElement('afterend', errorDisplay);
}
