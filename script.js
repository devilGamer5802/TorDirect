// --- Constants & Configuration ---

const RTC_CONFIG = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun.services.mozilla.com' },
    ]
};

// Default fallback WSS trackers (only WSS works well in browsers)
const DEFAULT_TRACKERS = [
    'wss://tracker.openwebtorrent.com',
    'wss://tracker.btorrent.xyz',
    'wss://tracker.webtorrent.io',
    'wss://tracker.webtorrent.dev',
    'wss://tracker.peerweb.site:443/announce',
];

// --- Initial Checks & Global Setup ---
if (typeof WebTorrent === 'undefined') {
    console.error("WebTorrent library not loaded!");
    alert("Error: WebTorrent library failed to load. The application cannot start.");
} else if (!WebTorrent.WEBRTC_SUPPORT) {
    log('Warning: WebRTC is not supported in this browser. Peer-to-peer functionality will be severely limited or non-functional.');
}

const torrentIdInput = document.getElementById('torrentIdInput');
const torrentFileInput = document.getElementById('torrentFileInput');
const startButton = document.getElementById('startButton');
const logsDiv = document.getElementById('logs');
const progressDiv = document.getElementById('progress');
const peersDiv = document.getElementById('peers');
const fileListUl = document.getElementById('fileList');
const playerDiv = document.getElementById('player');

let client = null;
let currentTorrentInfoHash = null;
let loadedTrackersFromFile = []; // <--- Variable to store trackers from file

// --- Logging Utility ---
function log(message) {
    console.log(message);
    if (logsDiv) {
        const time = new Date().toLocaleTimeString();
        const sanitizedMessage = String(message).replace(/</g, "<").replace(/>/g, ">");
        const maxLogLines = 100;
        const lines = logsDiv.innerHTML.split('<br>').slice(0, maxLogLines - 1);
        logsDiv.innerHTML = `[${time}] ${sanitizedMessage}<br>${lines.join('<br>')}`;
    } else if (document.readyState === 'complete' || document.readyState === 'interactive') {
        console.error("Log element (#logs) not found!");
    }
}

// --- Utility Functions ---
function updateProgress(torrent) {
    if (!progressDiv || !peersDiv || !torrent) return;

    const percent = (torrent.progress * 100).toFixed(2);
    const downloaded = formatBytes(torrent.downloaded);
    const total = formatBytes(torrent.length);
    const dlSpeed = formatBytes(torrent.downloadSpeed) + '/s';
    const ulSpeed = formatBytes(torrent.uploadSpeed) + '/s';
    let remaining = 'Calculating...';

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
             remaining = 'Nearly done...';
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

function formatBytes(bytes, decimals = 2) {
    if (typeof bytes !== 'number' || isNaN(bytes) || bytes < 0) return 'N/A';
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

    const i = Math.max(0, Math.floor(Math.log(bytes) / Math.log(k)));
    const validIndex = Math.min(i, sizes.length - 1);

    return parseFloat((bytes / Math.pow(k, validIndex)).toFixed(dm)) + ' ' + sizes[validIndex];
}

function formatTime(seconds) {
    if (typeof seconds !== 'number' || !isFinite(seconds) || seconds < 0) return 'N/A';

    try {
        const totalSeconds = Math.round(seconds);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const secs = totalSeconds % 60;

        const hoursStr = String(hours).padStart(2, '0');
        const minutesStr = String(minutes).padStart(2, '0');
        const secsStr = String(secs).padStart(2, '0');

        return `${hoursStr}:${minutesStr}:${secsStr}`;
    } catch (e) {
        console.error("Error formatting time:", e);
        return 'N/A';
    }
}

// --- Core Torrent Handling ---

function displayFiles(torrent) {
    if (!fileListUl || !playerDiv) return;
    fileListUl.innerHTML = '';
    playerDiv.innerHTML = '<h2>Streaming Player</h2>';

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
        const fileName = file.name || `File ${index + 1}`;
        const fileLength = typeof file.length === 'number' ? formatBytes(file.length) : 'Unknown Size';
        fileInfoSpan.textContent = `${fileName} (${fileLength})`;
        li.appendChild(fileInfoSpan);

        const buttonContainer = document.createElement('div');
        buttonContainer.style.marginTop = '5px';
        buttonContainer.style.display = 'flex';
        buttonContainer.style.gap = '10px';

        if (typeof file.getBlobURL === 'function') {
            const downloadButton = document.createElement('a');
            downloadButton.textContent = 'Download';
            downloadButton.href = '#';
            downloadButton.download = file.name || `download_${index}`;
            downloadButton.title = `Download ${fileName}`;
            downloadButton.className = 'button file-button';
            downloadButton.onclick = (e) => {
                e.preventDefault();
                log(`Preparing download for ${fileName}...`);
                downloadButton.textContent = 'Generating...';
                downloadButton.style.opacity = '0.6';
                downloadButton.style.pointerEvents = 'none';

                file.getBlobURL((err, url) => {
                    downloadButton.textContent = 'Download';
                    downloadButton.style.opacity = '1';
                    downloadButton.style.pointerEvents = 'auto';

                    if (err) {
                        log(`Error getting blob URL for ${fileName}: ${err.message}`);
                        console.error("Blob URL Error:", err);
                        alert(`Failed to generate download link for ${fileName}: ${err.message}`);
                        return;
                    }
                    if (!url) {
                        log(`Failed to generate blob URL for ${fileName} (maybe cancelled or empty?).`);
                        alert(`Could not generate download link for ${fileName}.`);
                        return;
                    }
                    log(`Download link generated for ${fileName}. Starting download.`);
                    const tempLink = document.createElement('a');
                    tempLink.href = url;
                    tempLink.download = file.name || `download_${index}`;
                    document.body.appendChild(tempLink);
                    tempLink.click();
                    document.body.removeChild(tempLink);
                });
            };
            buttonContainer.appendChild(downloadButton);
        } else {
            log(`Download not available for ${fileName}: getBlobURL method missing.`);
        }

        const isStreamable = /\.(mp4|webm|mkv|ogv|ogg|mp3|wav|aac|m4a|flac|opus|oga)$/i.test(fileName);
        if (isStreamable && typeof file.appendTo === 'function') {
            const streamButton = document.createElement('button');
            streamButton.textContent = 'Stream';
            streamButton.title = `Stream ${fileName}`;
            streamButton.className = 'button file-button';
            streamButton.onclick = () => streamFile(file);
            buttonContainer.appendChild(streamButton);
        } else if (isStreamable) {
            log(`Streaming not possible for ${fileName}: appendTo method missing.`);
        }

        li.appendChild(buttonContainer);
        fileListUl.appendChild(li);
    });
}

function streamFile(file) {
    if (!playerDiv) {
        log("Error: Player element not found. Cannot stream.");
        return;
    }
     if (typeof file.appendTo !== 'function') {
         log(`Error: Cannot stream ${file.name}. appendTo method not available.`);
         playerDiv.innerHTML = `<h2>Streaming Player</h2><p style="color:red;">Cannot stream "${file.name}". Feature not supported.</p>`;
         return;
     }

    log(`Attempting to stream ${file.name} using file.appendTo()...`);
    playerDiv.innerHTML = `<h2>Streaming Player</h2><p>Loading ${file.name}...</p>`;

    file.appendTo(playerDiv, { autoplay: true, controls: true }, (err, elem) => {
        if (err) {
            log(`Error streaming ${file.name}: ${err.message}`);
            console.error("Streaming Error (appendTo):", err);
            let userMessage = `Could not stream "${file.name}".`;
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

        log(`Streaming ${file.name} in the player area.`);
        if (elem) {
             const loadingP = playerDiv.querySelector('p');
             if (loadingP && loadingP.textContent.startsWith('Loading')) {
                 playerDiv.removeChild(loadingP);
             }

            elem.style.maxWidth = '100%';
            elem.style.display = 'block';
            elem.style.marginTop = '10px';
            elem.style.backgroundColor = '#000';

            elem.addEventListener('error', (e) => {
                const mediaError = elem.error;
                let errorText = `Playback error for ${file.name}.`;
                if (mediaError) {
                    errorText += ` Code: ${mediaError.code}, Message: ${mediaError.message}`;
                }
                log(errorText);
                console.error('Media Element Playback Error:', mediaError, e);

                const existingErrorP = playerDiv.querySelector('p[style*="color:red"], p[style*="color:yellow"]');
                if (!existingErrorP) {
                    const errorP = document.createElement('p');
                    errorP.style.color = 'red';
                    errorP.textContent = `Playback failed for ${file.name}. The browser encountered an error.`;
                    if (elem.parentNode === playerDiv) {
                         playerDiv.insertBefore(errorP, elem);
                    } else {
                         playerDiv.appendChild(errorP);
                    }
                }
            });

            elem.addEventListener('playing', () => {
                 log(`Playback started for ${file.name}`);
            });
            elem.addEventListener('waiting', () => {
                 log(`Buffering ${file.name}...`);
            });

        } else {
            log(`Streaming setup for ${file.name} completed, but no element was returned.`);
            playerDiv.innerHTML = `<h2>Streaming Player</h2><p style="color:orange;">Started streaming for ${file.name}, but player element is missing.</p>`;
        }
    });
}

function startTorrent(torrentInput) {
    const inputDesc = typeof torrentInput === 'string' ? `ID: ${torrentInput.substring(0, 50)}...` : `File: ${torrentInput.name}`;
    log(`Attempting to start torrent: ${inputDesc}`);

    const destroyPromise = new Promise((resolve, reject) => {
        if (client) {
            log('Destroying previous WebTorrent client instance...');
            client.destroy(err => {
                if (err) {
                    log(`Warning: Error destroying previous client: ${err.message}`);
                    console.warn("Client Destroy Error:", err);
                } else {
                    log('Previous client destroyed successfully.');
                }
                client = null;
                currentTorrentInfoHash = null;
                resolve();
            });
        } else {
            resolve();
        }
    });

    destroyPromise.then(() => {
        initializeAndAddTorrent(torrentInput);
    });
}

function initializeAndAddTorrent(torrentInput) {
    log('Initializing new WebTorrent client with WebRTC config...');

    if (progressDiv) progressDiv.innerHTML = 'Initializing Client...';
    if (peersDiv) peersDiv.innerText = 'Peers: 0';
    if (fileListUl) fileListUl.innerHTML = '';
    if (playerDiv) playerDiv.innerHTML = '<h2>Streaming Player</h2>';

    try {
        client = new WebTorrent({
            tracker: {
                rtcConfig: RTC_CONFIG
            }
        });

        log('WebTorrent client initialized.');

        client.on('error', err => {
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
        });

        client.on('warning', warn => {
             log(`WebTorrent Client Warning: ${warn.message}`);
             console.warn("WebTorrent Client Warning:", warn);
        });

        log('Adding torrent to client...');
        if (progressDiv) progressDiv.innerHTML = 'Adding torrent...';

        // Combine default trackers with successfully loaded ones, removing duplicates
        // Note: Non-WSS trackers will likely cause warnings but are included per user request.
        const combinedTrackers = [...new Set([...DEFAULT_TRACKERS, ...loadedTrackersFromFile])];

        log(`Using ${combinedTrackers.length} unique trackers (Default + File). Check console for warnings on non-WSS trackers.`);
        console.log("Effective Trackers:", combinedTrackers);

        const addOptions = {
            announce: combinedTrackers
        };

        const torrent = client.add(torrentInput, addOptions, torrentReadyCallback);

        currentTorrentInfoHash = torrent.infoHash;
        log(`Torrent added (infohash: ${torrent.infoHash}). Waiting for metadata...`);
        if (progressDiv) progressDiv.innerHTML = 'Fetching metadata...';

        updateProgress(torrent);

        torrent.on('metadata', () => {
             log(`Metadata received for: ${torrent.name || torrent.infoHash}`);
             if (progressDiv) progressDiv.innerHTML = 'Metadata loaded. Connecting...';
             displayFiles(torrent);
             updateProgress(torrent);
        });

        torrent.on('ready', () => {
             log(`Torrent ready: ${torrent.name || torrent.infoHash}`);
             if (progressDiv && progressDiv.innerHTML.includes('Metadata loaded')) {
                 progressDiv.innerHTML = 'Ready to download/stream.';
             }
             if (!fileListUl.hasChildNodes() && torrent.files && torrent.files.length > 0) {
                 displayFiles(torrent);
             }
             updateProgress(torrent);
        });

        torrent.on('warning', err => {
            log(`Torrent warning (${torrent.infoHash}): ${err.message}`);
            console.warn(`Torrent Warning (${torrent.infoHash}):`, err);
            updateProgress(torrent);
        });

        torrent.on('error', err => {
            log(`Torrent error (${torrent.infoHash}): ${err.message}`);
            console.error(`Torrent Error (${torrent.infoHash}):`, err);
            if (progressDiv) progressDiv.innerHTML = 'Torrent Error! See console.';
            updateProgress(torrent);
        });

        torrent.on('download', bytes => {
            updateProgress(torrent);
        });

        torrent.on('upload', bytes => {
            updateProgress(torrent);
        });

        torrent.on('done', () => {
            log(`Torrent finished downloading: ${torrent.name || torrent.infoHash}`);
            updateProgress(torrent);
            if (progressDiv) {
                const currentHTML = progressDiv.innerHTML;
                if (!currentHTML.includes('Complete!')) {
                     progressDiv.innerHTML = currentHTML + '<br><strong>Download Complete!</strong>';
                }
            }
        });

        torrent.on('wire', (wire, addr) => {
            log(`Connected to peer: ${addr || 'Incoming Connection'}`);
            updateProgress(torrent);
        });

        torrent.on('noPeers', (announceType) => {
             log(`No peers found via ${announceType} for torrent ${torrent.infoHash}. Waiting...`);
             if (peersDiv) peersDiv.innerText = `Peers: 0 (Searching via ${announceType}...)`;
        });

    } catch (err) {
        log(`Fatal Error adding torrent: ${err.message}. Check input or client setup.`);
        console.error("Client Add/Init Error:", err);
        if (progressDiv) progressDiv.innerHTML = 'Error: Invalid Torrent ID/File or Client Init Failed.';
        if (client) {
            client.destroy();
            client = null;
        }
    }
}

function torrentReadyCallback(torrent) {
    log(`Torrent ready callback fired: ${torrent.name || torrent.infoHash}`);
    if (currentTorrentInfoHash !== torrent.infoHash) {
         log(`Warning: Torrent ready callback for unexpected infohash ${torrent.infoHash}. Current is ${currentTorrentInfoHash}`);
         return;
    }

    log('Initial connection/download phase starting...');
    if (progressDiv && !progressDiv.innerHTML.includes('Connecting')) {
         progressDiv.innerHTML = 'Connecting / Downloading...';
    }
    displayFiles(torrent);
    updateProgress(torrent);
}

// --- Initialization and Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
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
        if (startButton) startButton.disabled = true;
        return;
    }

    // --- Fetch trackers from tracker-list.txt ---
    log('Attempting to load trackers from tracker-list.txt...');
    fetch('tracker-list.txt')
        .then(response => {
            if (!response.ok) {
                throw new Error(`File not found or server error (${response.status})`);
            }
            return response.text();
        })
        .then(text => {
            const lines = text.split('\n');
            // --- Includes ALL non-comment, non-empty lines from the file ---
            loadedTrackersFromFile = lines
                .map(line => line.trim())
                .filter(line => line && !line.startsWith('#')); // Keep ALL protocols (wss, https, http, udp)

            if (loadedTrackersFromFile.length > 0) {
                log(`Successfully loaded ${loadedTrackersFromFile.length} trackers from tracker-list.txt (All protocols included).`);
                console.log("Trackers loaded from file:", loadedTrackersFromFile);
            } else {
                log('No trackers found in tracker-list.txt or file was empty/comments only.');
            }
        })
        .catch(error => {
            log(`Warning: Could not load 'tracker-list.txt': ${error.message}. Using default WSS trackers only.`);
            console.warn("Tracker list fetch failed:", error);
            loadedTrackersFromFile = [];
        });
    // --- End of Fetch Block ---

    console.log("All essential HTML elements found after DOM Load.");

    startButton.addEventListener('click', () => {
        console.log('Start button clicked!');
        log('Start button action triggered...');
        startButton.disabled = true;
        startButton.textContent = 'Starting...';

        const torrentId = torrentIdInput.value.trim();
        const file = torrentFileInput.files.length > 0 ? torrentFileInput.files[0] : null;

        console.log('Torrent ID input value:', torrentId);
        console.log('Selected file object:', file);

        let inputToUse = null;
        let inputError = null;

        if (file) {
            log(`Processing selected file: ${file.name}`);
            inputToUse = file;
            torrentIdInput.value = '';
        } else if (torrentId) {
            if (torrentId.startsWith('magnet:?xt=urn:btih:') || /^[a-fA-F0-9]{40}$/i.test(torrentId) || /^[a-fA-F0-9]{32}$/i.test(torrentId)) {
                log(`Processing input ID/Magnet: ${torrentId.substring(0, 60)}...`);
                inputToUse = torrentId;
                torrentFileInput.value = '';
            } else {
                inputError = 'Invalid Magnet URI or Info Hash format. Must start with "magnet:" or be a 40/32-character hex string.';
            }
        } else {
            inputError = 'Please enter a magnet link/info hash or select a .torrent file.';
        }

        if (inputToUse) {
            startTorrent(inputToUse);
        } else if (inputError) {
            log(`Input Error: ${inputError}`);
            console.log('Invalid input provided.');
            alert(inputError);
        }

        setTimeout(() => {
            startButton.disabled = false;
            startButton.textContent = 'Start Download / Stream';
        }, 500);
    });
    console.log("Click listener added to startButton.");

    torrentIdInput.addEventListener('input', () => {
        if (torrentIdInput.value.trim() !== '') {
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
            torrentIdInput.value = '';
        } else {
            console.log('File input cleared or no file selected.');
        }
    });
    console.log("Change listener added to torrentFileInput.");

    log('WebTorrent Client UI Initialized. Ready for input.');
    log("--------------------------------------------------");
    log("LEGAL DISCLAIMER: Only use this tool for content you have the legal right to share and download.");
    log("Downloading copyrighted material without permission may be illegal in your jurisdiction.");
    log("--------------------------------------------------");
    log("Performance Tip: Keep this browser tab active for best download speeds.");
    log("Note: Only WSS trackers significantly aid peer discovery in browsers. Other protocols may cause warnings.");
    log("--------------------------------------------------");

}); // End of DOMContentLoaded

console.log("script.js loaded. Waiting for DOM content...");

/* --- Where to add tracker list (tracker-list.txt) ---
   Create a file named 'tracker-list.txt' in the same directory as your HTML file.
   Add tracker URLs, one per line. Lines starting with # are ignored.
   Example tracker-list.txt content:

   # WSS Trackers (Recommended for Browser)
   wss://tracker.openwebtorrent.com
   wss://tracker.btorrent.xyz

   # Other Trackers (Will likely cause warnings in browser console)
   udp://tracker.opentrackr.org:1337/announce
   http://tracker.opentrackr.org:1337/announce
   https://tracker.example.com:443/announce

*/
