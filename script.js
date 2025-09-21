// --- Initial Checks & Global Setup ---
// Wait a moment for WebTorrent to be available if script loads asynchronously
function checkWebTorrent() {
    // Check if WebTorrent is available globally
    if (typeof WebTorrent === 'undefined' && typeof window.WebTorrent === 'undefined') {
        console.error("WebTorrent library not loaded!");
        console.log("Available globals:", Object.keys(window).filter(key => 
            key.toLowerCase().includes('torrent') || 
            key.toLowerCase().includes('web') ||
            key.toLowerCase().includes('bt')
        ));
        
        // Display error message
        updateWebTorrentStatus("❌ WebTorrent library failed to load", true);
        
        // Disable the start button to prevent errors
        if (startButton) {
            startButton.disabled = true;
            startButton.textContent = 'WebTorrent Not Available';
            startButton.style.backgroundColor = '#666';
        }
        return false;
    } else {
        // Ensure WebTorrent is available globally
        if (typeof WebTorrent === 'undefined' && typeof window.WebTorrent !== 'undefined') {
            window.WebTorrent = window.WebTorrent;
        }
        
        console.log("✅ WebTorrent loaded successfully!");
        console.log("WebTorrent version:", WebTorrent.VERSION || 'Unknown');
        
        // Check for WebRTC support
        if (!WebTorrent.WEBRTC_SUPPORT) {
            log('⚠️ Warning: WebRTC is not supported in this browser. Some functionality may be limited.');
            updateWebTorrentStatus("⚠️ WebTorrent loaded (WebRTC limited)", false);
        } else {
            console.log("✅ WebRTC support detected");
            updateWebTorrentStatus("✅ WebTorrent ready with full P2P support!", false);
        }
        
        // Initialize the WebTorrent client
        try {
            if (!client) {
                client = new WebTorrent();
                console.log("✅ WebTorrent client initialized");
                
                // Add client event listeners
                client.on('error', (err) => {
                    console.error('WebTorrent client error:', err);
                    log(`Client error: ${err.message}`);
                });
            }
        } catch (error) {
            console.error("Error initializing WebTorrent client:", error);
            updateWebTorrentStatus(`❌ Error: ${error.message}`, true);
            return false;
        }
        
        return true;
    }
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
const webTorrentStatusDiv = document.getElementById('webTorrentStatus');

let client = null; // Holds the WebTorrent client instance

// Update status display
function updateWebTorrentStatus(message, isError = false) {
    if (webTorrentStatusDiv) {
        webTorrentStatusDiv.textContent = message;
        webTorrentStatusDiv.style.color = isError ? '#ff6b6b' : '#4ecdc4';
    }
}

// Check WebTorrent availability when script loads
let webTorrentLoaded = false;

// Wait for script to load and check WebTorrent
function initializeWebTorrent() {
    webTorrentLoaded = checkWebTorrent();
    if (!webTorrentLoaded) {
        // Retry a few times with increasing delays
        let retryCount = 0;
        const maxRetries = 5;
        
        function retryCheck() {
            retryCount++;
            setTimeout(() => {
                console.log(`Retry ${retryCount}: Checking for WebTorrent...`);
                webTorrentLoaded = checkWebTorrent();
                
                if (!webTorrentLoaded && retryCount < maxRetries) {
                    retryCheck();
                } else if (!webTorrentLoaded) {
                    console.error("Failed to load WebTorrent after all retries");
                    updateWebTorrentStatus("❌ WebTorrent failed to load after multiple attempts", true);
                }
            }, retryCount * 1000); // Increasing delay: 1s, 2s, 3s, etc.
        }
        
        retryCheck();
    }
}

// Initialize when DOM is ready - COMBINED initialization
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}

// Combined initialization function
function initializeApp() {
    console.log('DOM ready - initializing app...');
    
    // Initialize WebTorrent first
    initializeWebTorrent();
    
    // Setup UI elements and event listeners
    setupUIEventListeners();
}

// Log function to display messages in both console and UI
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
        downloadButton.onclick = async (e) => {
             e.preventDefault(); // Stop default link behavior
             log(`Preparing download for ${file.name}...`);
             e.target.textContent = 'Generating...'; // Provide user feedback
             e.target.style.opacity = '0.6';
             e.target.style.pointerEvents = 'none';

             try {
                 // Use the new blob() method instead of getBlobURL
                 const blob = await file.blob();
                 
                 if (!blob) { // Handle cases where blob generation might fail
                     log(`Failed to generate blob for ${file.name}.`);
                     e.target.textContent = 'Download'; // Reset button
                     e.target.style.opacity = '1';
                     e.target.style.pointerEvents = 'auto';
                     return;
                 }
                 
                 // Create blob URL and trigger download
                 const url = URL.createObjectURL(blob);
                 log(`Download link generated for ${file.name}. Starting download.`);
                 
                 const tempLink = document.createElement('a');
                 tempLink.href = url;
                 tempLink.download = file.name;
                 document.body.appendChild(tempLink);
                 tempLink.click();
                 document.body.removeChild(tempLink);
                 
                 // Clean up the blob URL to free memory
                 URL.revokeObjectURL(url);
                 
                 e.target.textContent = 'Download'; // Reset button after click
                 e.target.style.opacity = '1';
                 e.target.style.pointerEvents = 'auto';
             } catch (err) {
                 log(`Error getting blob for ${file.name}: ${err.message}`);
                 e.target.textContent = 'Error';
                 e.target.style.opacity = '1';
                 e.target.style.pointerEvents = 'auto';
             }
        };
        buttonContainer.appendChild(downloadButton);

        // Create Stream button (uses file.streamTo)
        const isStreamable = /\.(mp4|webm|mkv|ogv|ogg|mp3|wav|aac|m4a|flac|opus|oga)$/i.test(file.name); // Common streamable types
        // Check if the streamTo method exists on the file object
        if (isStreamable && typeof file.streamTo === 'function') {
            const streamButton = document.createElement('button');
            streamButton.textContent = 'Stream';
            streamButton.title = `Stream ${file.name}`;
            streamButton.onclick = () => streamFile(file); // Call dedicated streaming function
            buttonContainer.appendChild(streamButton);
        } else if (isStreamable) {
             log(`Streaming not possible for ${file.name}: streamTo method missing.`); // Log if stream method is missing
        }

        li.appendChild(buttonContainer);
        fileListUl.appendChild(li);
    });
}

// Streams the given file into the player element using modern WebTorrent API
function streamFile(file) {
    if (!playerDiv) {
        log("Error: Player element not found. Cannot stream.");
        return;
    }

    log(`Attempting to stream ${file.name}...`);
    playerDiv.innerHTML = '<h2>Streaming Player</h2>'; // Clear previous content

    // Add status indicator
    const statusDiv = document.createElement('div');
    statusDiv.id = 'streaming-status';
    statusDiv.style.cssText = 'margin: 10px 0; padding: 8px; background: #f0f0f0; border-radius: 4px; font-size: 14px;';
    statusDiv.innerHTML = `<strong>Status:</strong> <span style="color: orange;">Setting up stream for ${file.name}...</span>`;
    playerDiv.appendChild(statusDiv);

    // Create a video or audio element based on file type
    const isVideo = /\.(mp4|webm|mkv|ogv|mov|avi)$/i.test(file.name);
    const mediaElement = document.createElement(isVideo ? 'video' : 'audio');
    
    // Set up media element properties
    mediaElement.controls = true;
    mediaElement.style.maxWidth = '100%';
    mediaElement.style.display = 'block';
    mediaElement.style.marginTop = '10px';
    mediaElement.style.backgroundColor = '#000';
    mediaElement.preload = 'metadata'; // Load metadata immediately
    
    // Add to player div first
    playerDiv.appendChild(mediaElement);

    // Update status to show we're trying streaming
    statusDiv.innerHTML = `<strong>Status:</strong> <span style="color: blue;">Initializing stream...</span>`;

    try {
        // Use the most compatible method: render to media element
        if (typeof file.renderTo === 'function') {
            log(`Using file.renderTo() for ${file.name}`);
            statusDiv.innerHTML = `<strong>Status:</strong> <span style="color: blue;">Setting up renderTo stream...</span>`;
            
            file.renderTo(mediaElement, (err) => {
                if (err) {
                    log(`Error with renderTo for ${file.name}: ${err.message}`);
                    tryAlternativeStreaming(file, mediaElement, statusDiv);
                } else {
                    log(`Successfully set up renderTo for ${file.name}`);
                    statusDiv.innerHTML = `<strong>Status:</strong> <span style="color: green;">Stream ready via renderTo - ${file.name}</span>`;
                    
                    // For completed downloads, try to trigger play
                    if (file.torrent && file.torrent.done) {
                        log(`Torrent is complete, stream should be ready immediately`);
                        setTimeout(() => {
                            if (mediaElement.readyState >= 2) { // HAVE_CURRENT_DATA
                                statusDiv.innerHTML = `<strong>Status:</strong> <span style="color: green;">Ready to play - File fully downloaded</span>`;
                            }
                        }, 1000);
                    }
                }
            });
        } else if (typeof file.streamTo === 'function') {
            log(`Using file.streamTo() for ${file.name}`);
            statusDiv.innerHTML = `<strong>Status:</strong> <span style="color: blue;">Setting up streamTo stream...</span>`;
            
            file.streamTo(mediaElement, (err) => {
                if (err) {
                    log(`Error with streamTo for ${file.name}: ${err.message}`);
                    tryAlternativeStreaming(file, mediaElement, statusDiv);
                } else {
                    log(`Successfully set up streamTo for ${file.name}`);
                    statusDiv.innerHTML = `<strong>Status:</strong> <span style="color: green;">Stream ready via streamTo - ${file.name}</span>`;
                    
                    // For completed downloads, try to trigger play
                    if (file.torrent && file.torrent.done) {
                        log(`Torrent is complete, stream should be ready immediately`);
                        setTimeout(() => {
                            if (mediaElement.readyState >= 2) { // HAVE_CURRENT_DATA
                                statusDiv.innerHTML = `<strong>Status:</strong> <span style="color: green;">Ready to play - File fully downloaded</span>`;
                            }
                        }, 1000);
                    }
                }
            });
        } else {
            log(`Standard streaming methods not available, trying alternatives for ${file.name}`);
            tryAlternativeStreaming(file, mediaElement, statusDiv);
        }

        // Set up media element event listeners
        setupMediaEventListeners(mediaElement, file.name, statusDiv);
        
    } catch (error) {
        log(`Error setting up stream for ${file.name}: ${error.message}`);
        tryAlternativeStreaming(file, mediaElement, statusDiv);
    }
}

// Try alternative streaming methods if primary methods fail
function tryAlternativeStreaming(file, mediaElement, statusDiv) {
    log(`Trying alternative streaming methods for ${file.name}...`);
    statusDiv.innerHTML = `<strong>Status:</strong> <span style="color: orange;">Trying alternative methods...</span>`;

    // Check if torrent is fully downloaded - use blob method for better reliability
    if (file.torrent && file.torrent.done) {
        log(`Torrent is complete - using getBlob for immediate playback of ${file.name}`);
        statusDiv.innerHTML = `<strong>Status:</strong> <span style="color: blue;">Creating blob from completed download...</span>`;
        
        file.getBlob((err, blob) => {
            if (err) {
                log(`getBlob failed for ${file.name}: ${err.message}`);
                tryBlobURL(file, mediaElement, statusDiv);
            } else {
                log(`Successfully created blob for ${file.name} (${formatBytes(blob.size)})`);
                const url = window.URL.createObjectURL(blob);
                mediaElement.src = url;
                statusDiv.innerHTML = `<strong>Status:</strong> <span style="color: green;">Ready to play - Loaded from completed download</span>`;
                
                // Clean up URL when media ends
                mediaElement.addEventListener('ended', () => {
                    window.URL.revokeObjectURL(url);
                });
                
                // Auto-load the video
                mediaElement.load();
            }
        });
    } else {
        // For incomplete downloads, try getBlobURL first
        tryBlobURL(file, mediaElement, statusDiv);
    }
}

// Try getBlobURL method
function tryBlobURL(file, mediaElement, statusDiv) {
    // Method 1: Try getBlobURL
    if (typeof file.getBlobURL === 'function') {
        log(`Attempting getBlobURL for ${file.name}`);
        statusDiv.innerHTML = `<strong>Status:</strong> <span style="color: blue;">Getting blob URL...</span>`;
        
        file.getBlobURL((err, url) => {
            if (err) {
                log(`getBlobURL failed for ${file.name}: ${err.message}`);
                tryStreamCreation(file, mediaElement, statusDiv);
            } else {
                log(`Got blob URL for ${file.name}: ${url.substring(0, 50)}...`);
                mediaElement.src = url;
                statusDiv.innerHTML = `<strong>Status:</strong> <span style="color: green;">Streaming via blob URL</span>`;
                
                // Auto-load the video
                mediaElement.load();
            }
        });
    } else {
        tryStreamCreation(file, mediaElement, statusDiv);
    }
}

// Try creating a blob from stream
function tryStreamCreation(file, mediaElement, statusDiv) {
    log(`Attempting stream-to-blob conversion for ${file.name}`);
    statusDiv.innerHTML = `<strong>Status:</strong> <span style="color: orange;">Creating blob stream...</span>`;

    if (file.createReadStream && typeof window.URL !== 'undefined') {
        const chunks = [];
        const stream = file.createReadStream();
        
        stream.on('data', chunk => {
            chunks.push(chunk);
            // Update progress periodically
            if (chunks.length % 10 === 0) {
                const totalSize = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
                statusDiv.innerHTML = `<strong>Status:</strong> <span style="color: blue;">Loading... ${formatBytes(totalSize)}</span>`;
            }
        });
        
        stream.on('end', () => {
            try {
                const blob = new Blob(chunks);
                const url = window.URL.createObjectURL(blob);
                mediaElement.src = url;
                log(`Successfully created blob for ${file.name} (${formatBytes(blob.size)})`);
                statusDiv.innerHTML = `<strong>Status:</strong> <span style="color: green;">Ready to play - ${formatBytes(blob.size)}</span>`;
                
                // Clean up URL when media ends
                mediaElement.addEventListener('ended', () => {
                    window.URL.revokeObjectURL(url);
                });
            } catch (err) {
                log(`Error creating blob for ${file.name}: ${err.message}`);
                showStreamingFailure(file, statusDiv);
            }
        });
        
        stream.on('error', err => {
            log(`Stream error for ${file.name}: ${err.message}`);
            showStreamingFailure(file, statusDiv);
        });
    } else {
        showStreamingFailure(file, statusDiv);
    }
}

// Show streaming failure with download option
function showStreamingFailure(file, statusDiv) {
    log(`All streaming methods failed for ${file.name}. File can still be downloaded.`);
    statusDiv.innerHTML = `<strong>Status:</strong> <span style="color: red;">Streaming failed - Options available</span>`;
    
    // Create button container
    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = 'margin: 10px 0; display: flex; gap: 10px; flex-wrap: wrap;';
    
    // Add retry button for completed torrents
    if (file.torrent && file.torrent.done) {
        const retryBtn = document.createElement('button');
        retryBtn.textContent = `Retry Stream ${file.name}`;
        retryBtn.style.cssText = 'padding: 8px 16px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer;';
        retryBtn.onclick = () => {
            log(`Retrying stream for ${file.name} using blob method`);
            statusDiv.innerHTML = `<strong>Status:</strong> <span style="color: blue;">Retrying with blob method...</span>`;
            
            file.getBlob((err, blob) => {
                if (err) {
                    log(`Retry failed for ${file.name}: ${err.message}`);
                    statusDiv.innerHTML = `<strong>Status:</strong> <span style="color: red;">Retry failed - Download available</span>`;
                    return;
                }
                
                // Find the media element and update it
                const mediaElement = playerDiv.querySelector('video, audio');
                if (mediaElement) {
                    const url = window.URL.createObjectURL(blob);
                    mediaElement.src = url;
                    mediaElement.load();
                    statusDiv.innerHTML = `<strong>Status:</strong> <span style="color: green;">Retry successful - Try playing now</span>`;
                    
                    // Clean up URL when media ends
                    mediaElement.addEventListener('ended', () => {
                        window.URL.revokeObjectURL(url);
                    });
                }
            });
        };
        buttonContainer.appendChild(retryBtn);
    }
    
    // Add download button
    const downloadBtn = document.createElement('button');
    downloadBtn.textContent = `Download ${file.name}`;
    downloadBtn.style.cssText = 'padding: 8px 16px; background: #007cba; color: white; border: none; border-radius: 4px; cursor: pointer;';
    downloadBtn.onclick = () => {
        file.getBlob((err, blob) => {
            if (err) {
                log(`Download failed for ${file.name}: ${err.message}`);
                return;
            }
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = file.name;
            a.click();
            window.URL.revokeObjectURL(url);
        });
    };
    buttonContainer.appendChild(downloadBtn);
    
    statusDiv.appendChild(buttonContainer);
}

// Set up media element event listeners
function setupMediaEventListeners(mediaElement, fileName, statusDiv) {
    // Add error handler to the media element for runtime playback errors
    mediaElement.addEventListener('error', (e) => {
        log(`Media playback error for ${fileName}: Code ${mediaElement.error?.code}`);
        console.error('Media Element Playback Error:', mediaElement.error, e);
        statusDiv.innerHTML = `<strong>Status:</strong> <span style="color: red;">Playback error: ${mediaElement.error?.message || 'Unknown error'}</span>`;
    });

    // Add loading handler
    mediaElement.addEventListener('loadstart', () => {
        log(`Loading started for ${fileName}`);
        statusDiv.innerHTML = `<strong>Status:</strong> <span style="color: blue;">Loading ${fileName}...</span>`;
    });

    // Add progress handlers for better user feedback
    mediaElement.addEventListener('loadedmetadata', () => {
        log(`${fileName} metadata loaded - Duration: ${Math.round(mediaElement.duration)}s`);
        statusDiv.innerHTML = `<strong>Status:</strong> <span style="color: green;">Ready to play - Duration: ${Math.round(mediaElement.duration)}s</span>`;
    });

    mediaElement.addEventListener('canplay', () => {
        log(`${fileName} is ready to play`);
        statusDiv.innerHTML = `<strong>Status:</strong> <span style="color: green;">Ready to play - Click play button</span>`;
    });

    mediaElement.addEventListener('waiting', () => {
        log(`${fileName} is buffering...`);
        statusDiv.innerHTML = `<strong>Status:</strong> <span style="color: orange;">Buffering...</span>`;
    });

    mediaElement.addEventListener('playing', () => {
        log(`${fileName} started playing`);
        statusDiv.innerHTML = `<strong>Status:</strong> <span style="color: green;">Playing ${fileName}</span>`;
    });

    mediaElement.addEventListener('pause', () => {
        log(`${fileName} playback paused`);
        statusDiv.innerHTML = `<strong>Status:</strong> <span style="color: gray;">Paused</span>`;
    });

    mediaElement.addEventListener('stalled', () => {
        log(`${fileName} playback stalled - trying recovery...`);
        statusDiv.innerHTML = `<strong>Status:</strong> <span style="color: orange;">Stalled - attempting recovery...</span>`;
        
        // Try to recover from stalled state
        setTimeout(() => {
            if (mediaElement.readyState < 2) { // Less than HAVE_CURRENT_DATA
                log(`${fileName} still stalled after timeout, trying alternative approach`);
                // If we're stalled and the torrent is complete, try the blob approach
                const fileObj = getCurrentFileObject(fileName);
                if (fileObj && fileObj.torrent && fileObj.torrent.done) {
                    log(`Torrent is complete, switching to blob approach for ${fileName}`);
                    statusDiv.innerHTML = `<strong>Status:</strong> <span style="color: blue;">Switching to blob approach...</span>`;
                    
                    fileObj.getBlob((err, blob) => {
                        if (!err && blob) {
                            const url = window.URL.createObjectURL(blob);
                            mediaElement.src = url;
                            mediaElement.load();
                            statusDiv.innerHTML = `<strong>Status:</strong> <span style="color: green;">Reloaded with blob - try playing now</span>`;
                        } else {
                            statusDiv.innerHTML = `<strong>Status:</strong> <span style="color: red;">Playback stalled - try downloading instead</span>`;
                        }
                    });
                } else {
                    statusDiv.innerHTML = `<strong>Status:</strong> <span style="color: red;">Stalled - waiting for more data or try later</span>`;
                }
            }
        }, 3000); // Wait 3 seconds before attempting recovery
    });

    mediaElement.addEventListener('progress', () => {
        if (mediaElement.buffered.length > 0) {
            const bufferedEnd = mediaElement.buffered.end(mediaElement.buffered.length - 1);
            const duration = mediaElement.duration;
            if (duration > 0) {
                const bufferedPercent = Math.round((bufferedEnd / duration) * 100);
                if (bufferedPercent % 10 === 0) { // Log every 10% to avoid spam
                    log(`${fileName} buffered: ${bufferedPercent}%`);
                }
            }
        }
    });
}

// Helper function to get file object by name from current torrent
function getCurrentFileObject(fileName) {
    if (client && client.torrents && client.torrents.length > 0) {
        const torrent = client.torrents[0]; // Get the current torrent
        if (torrent.files) {
            return torrent.files.find(file => file.name === fileName);
        }
    }
    return null;
}

// Main function to handle starting a new torrent download/stream
function startTorrent(torrentId) {
    // Check if WebTorrent is available before proceeding
    if (!webTorrentLoaded || typeof WebTorrent === 'undefined') {
        log('❌ Error: WebTorrent library is not loaded. Please wait for it to load or refresh the page.');
        console.error('WebTorrent not available when startTorrent was called');
        updateWebTorrentStatus("❌ WebTorrent not available", true);
        return;
    }
    
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

    // Set up service worker for streaming (required for new API)
    setupServiceWorker().then((server) => {
        log('Service worker setup completed');
        if (server) {
            log('WebTorrent streaming server is ready');
        } else {
            log('Streaming server not available - downloads and basic playback will still work');
        }
        continueWithTorrentSetup(torrentId);
    }).catch(err => {
        log(`Service worker setup failed: ${err.message}. Downloads will still work.`);
        // Continue anyway for download functionality
        continueWithTorrentSetup(torrentId);
    });
}

// Set up service worker for streaming functionality
async function setupServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.register('./sw.min.js', { scope: './' });
            
            // Wait for service worker to be ready
            await navigator.serviceWorker.ready;
            
            // Create WebTorrent server with service worker
            if (typeof client.createServer === 'function') {
                const server = client.createServer({ controller: registration });
                log('WebTorrent server created with service worker support');
                return server;
            } else {
                log('Warning: createServer method not available, streaming may be limited');
                return null;
            }
        } catch (err) {
            console.error('Service worker registration failed:', err);
            log(`Service worker setup failed: ${err.message}`);
            return null;
        }
    } else {
        log('Service workers not supported in this browser, streaming may be limited');
        return null;
    }
}

// Continue with torrent setup after service worker is ready
function continueWithTorrentSetup(torrentId) {

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
            torrent.on('warning', err => {
                // Don't spam logs with connection failures - they're normal in BitTorrent
                if (err.message.includes('Connection failed') || err.message.includes('Connection error')) {
                    console.log(`Connection attempt failed (normal): ${err.message}`);
                } else {
                    log(`Torrent warning (${torrent.name || torrent.infoHash}): ${err.message}`);
                }
            });
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
        }); // Close the metadata ready callback

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

// Setup all UI event listeners
function setupUIEventListeners() {
    // Final check that all needed HTML elements are present
    if (!torrentIdInput || !torrentFileInput || !startButton || !logsDiv || !progressDiv || !peersDiv || !fileListUl || !playerDiv) {
        console.error("CRITICAL: One or more essential HTML elements were not found! Check IDs in index.html.");
        console.log('Missing elements:', {
            torrentIdInput: !!torrentIdInput,
            torrentFileInput: !!torrentFileInput, 
            startButton: !!startButton,
            logsDiv: !!logsDiv,
            progressDiv: !!progressDiv,
            peersDiv: !!peersDiv,
            fileListUl: !!fileListUl,
            playerDiv: !!playerDiv
        });
        log("Critical Error: Page elements missing. Cannot initialize functionality.");
        if (startButton) startButton.disabled = true;
        return;
    }

    console.log("All essential HTML elements found - setting up event listeners...");

    // Attach listener to the main start button
    if (startButton) {
        startButton.addEventListener('click', () => {
            console.log('Start button clicked!');
            log('Start button action triggered...');

            const torrentId = torrentIdInput ? torrentIdInput.value.trim() : null;
            const file = torrentFileInput && torrentFileInput.files.length > 0 ? torrentFileInput.files[0] : null;

            console.log('Torrent ID input value:', torrentId);
            console.log('Selected file object:', file);

            if (!torrentIdInput || !torrentFileInput) {
                log("Error: Input elements not found!");
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
        console.error("startButton not found, cannot add click listener.");
    }

    // Add listeners to clear one input type if the other is used
    if (torrentIdInput) {
        torrentIdInput.addEventListener('input', () => {
            if (torrentIdInput.value.trim() !== '' && torrentFileInput) {
                torrentFileInput.value = ''; // Clear file if text is typed
            }
        });
        console.log("Input listener added to torrentIdInput.");
    }

    if (torrentFileInput) {
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
}

// Set up DOM event listener to initialize UI when ready
document.addEventListener('DOMContentLoaded', setupUIEventListeners);

// Log message indicates script file itself has loaded
log("Script loaded. Waiting for DOM content.");
