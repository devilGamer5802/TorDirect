document.addEventListener('DOMContentLoaded', () => {
    // Check if WebTorrent is supported
    if (!WebTorrent.WEBRTC_SUPPORT) {
        displayStatusMessage('WebRTC is not supported in this browser. Torrenting may not work efficiently or at all.', 'error');
        // Optionally disable input fields
        document.getElementById('torrent-id').disabled = true;
        document.getElementById('torrent-form').querySelector('button').disabled = true;
        document.getElementById('torrent-file-upload').disabled = true;
        return; // Stop execution if WebRTC isn't supported
    }

    const client = new WebTorrent();
    let currentTorrent = null; // Keep track of the active torrent

    // DOM Elements
    const torrentForm = document.getElementById('torrent-form');
    const torrentIdInput = document.getElementById('torrent-id');
    const fileUploadInput = document.getElementById('torrent-file-upload');
    const statusMessage = document.getElementById('status-message');
    const inputSection = document.getElementById('input-section');
    const torrentDetailsSection = document.getElementById('torrent-details');
    const torrentNameEl = document.getElementById('torrent-name');
    const progressPercentEl = document.getElementById('progress-percent');
    const progressBarEl = document.getElementById('progress-bar');
    const speedDownEl = document.getElementById('speed-down');
    const speedUpEl = document.getElementById('speed-up');
    const etaEl = document.getElementById('eta');
    const peersEl = document.getElementById('peers');
    const fileListEl = document.getElementById('file-list');
    const mediaPlayerSection = document.getElementById('media-player-section');
    const playerContainer = document.getElementById('player-container');
    const closePlayerBtn = document.getElementById('close-player-btn');
    const mediaTitleEl = document.getElementById('media-title');
    const dropZone = document.getElementById('drop-zone'); // The area to drop files/links

    let progressInterval = null;

    // --- Helper Functions ---

    function formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    function formatTime(seconds) {
        if (seconds === Infinity || isNaN(seconds) || seconds === 0) return '∞';
        let date = new Date(0);
        date.setSeconds(seconds);
        let timeString = date.toISOString().substr(11, 8);
        // Show hours only if necessary
        return timeString.startsWith('00:') ? timeString.substr(3) : timeString;
     }

    function displayStatusMessage(message, type = 'info') {
        statusMessage.textContent = message;
        statusMessage.className = 'mt-4 text-center text-sm'; // Reset classes
        if (type === 'error') {
            statusMessage.classList.add('text-red-400');
        } else if (type === 'success') {
             statusMessage.classList.add('text-green-400');
        } else {
            statusMessage.classList.add('text-secondary-text');
        }
        // Clear message after some time? Optional.
        // setTimeout(() => statusMessage.textContent = '', 5000);
    }

    function resetUI() {
        // Hide details, show input
        inputSection.classList.remove('hidden');
        torrentDetailsSection.classList.add('hidden');
        mediaPlayerSection.classList.add('hidden');
        playerContainer.innerHTML = ''; // Clear player

        // Reset torrent info display
        torrentNameEl.textContent = 'Torrent Name';
        progressPercentEl.textContent = '0%';
        progressBarEl.value = 0;
        speedDownEl.textContent = '0 B/s';
        speedUpEl.textContent = '0 B/s';
        etaEl.textContent = '∞';
        peersEl.textContent = '0';
        fileListEl.innerHTML = ''; // Clear file list
        statusMessage.textContent = ''; // Clear status

        // Clear interval if running
        if (progressInterval) {
            clearInterval(progressInterval);
            progressInterval = null;
        }

        // Destroy previous torrent if exists
        if (currentTorrent) {
            client.remove(currentTorrent.infoHash, (err) => {
                if (err) console.error('Error removing previous torrent:', err);
                currentTorrent = null;
            });
        }
         // Reset input fields
        torrentIdInput.value = '';
        fileUploadInput.value = ''; // This might not work reliably due to security
    }

    function startTorrent(torrentId) {
        resetUI(); // Clear previous state before starting a new one
        displayStatusMessage('Adding torrent...', 'info');

        client.add(torrentId, (torrent) => {
            displayStatusMessage('Torrent added! Fetching metadata...', 'success');
            inputSection.classList.add('hidden'); // Hide input form
            torrentDetailsSection.classList.remove('hidden'); // Show details section

            currentTorrent = torrent; // Store reference to the current torrent

            torrentNameEl.textContent = torrent.name || 'Unknown Torrent';
            torrentNameEl.title = torrent.name || 'Unknown Torrent'; // Show full name on hover

            // Display files
            fileListEl.innerHTML = ''; // Clear any previous list items
            torrent.files.forEach((file, index) => {
                const li = document.createElement('li');
                li.className = 'flex justify-between items-center p-2 border-b border-tertiary-dark last:border-b-0';

                const fileNameSpan = document.createElement('span');
                fileNameSpan.textContent = `${file.name} (${formatBytes(file.length)})`;
                fileNameSpan.className = 'truncate mr-2 flex-grow';
                fileNameSpan.title = file.name; // Show full name on hover

                const actionsDiv = document.createElement('div');
                actionsDiv.className = 'flex-shrink-0 space-x-2';

                // Check if file is streamable (basic video/audio check)
                const isStreamable = file.name.match(/\.(mp4|webm|ogg|mp3|wav|m4a|mkv)$/i); // Added mkv

                 if (isStreamable) {
                    const streamButton = document.createElement('button');
                    streamButton.textContent = 'Stream';
                    streamButton.className = 'text-xs bg-green-600 hover:bg-green-700 text-white font-medium py-1 px-2 rounded transition duration-150';
                    streamButton.onclick = () => streamFile(file);
                    actionsDiv.appendChild(streamButton);
                }

                // Always offer download link
                const downloadButton = document.createElement('button');
                downloadButton.textContent = 'Download';
                downloadButton.className = 'text-xs bg-primary-accent hover:bg-opacity-80 text-white font-medium py-1 px-2 rounded transition duration-150';
                downloadButton.onclick = () => downloadFile(file); // Use a helper function for clarity
                actionsDiv.appendChild(downloadButton);


                li.appendChild(fileNameSpan);
                li.appendChild(actionsDiv);
                fileListEl.appendChild(li);
            });

             // Update progress periodically
            if (progressInterval) clearInterval(progressInterval); // Clear any existing interval
            progressInterval = setInterval(() => {
                 if (!currentTorrent) { // Stop if torrent was removed
                    clearInterval(progressInterval);
                    return;
                 }
                const progress = (currentTorrent.progress * 100).toFixed(1);
                progressBarEl.value = progress;
                progressPercentEl.textContent = `${progress}%`;
                speedDownEl.textContent = formatBytes(currentTorrent.downloadSpeed) + '/s';
                speedUpEl.textContent = formatBytes(currentTorrent.uploadSpeed) + '/s';
                etaEl.textContent = formatTime(currentTorrent.timeRemaining / 1000); // timeRemaining is in ms
                peersEl.textContent = currentTorrent.numPeers;
            }, 1000); // Update every second

            torrent.on('done', () => {
                displayStatusMessage('Torrent download finished!', 'success');
                progressBarEl.value = 100;
                progressPercentEl.textContent = '100%';
                etaEl.textContent = 'Done';
                 if (progressInterval) clearInterval(progressInterval); // Stop updates on completion
                 progressInterval = null;
            });

            torrent.on('error', (err) => {
                console.error('Torrent error:', err);
                displayStatusMessage(`Torrent error: ${err.message}`, 'error');
                 if (progressInterval) clearInterval(progressInterval);
                 progressInterval = null;
                 // Maybe reset UI partially?
            });

        });

        client.on('error', (err) => {
             console.error('WebTorrent client error:', err);
             displayStatusMessage(`Client error: ${err.message}`, 'error');
             resetUI(); // Reset if the client itself errors
             if (progressInterval) clearInterval(progressInterval);
             progressInterval = null;
        });
    }

    function downloadFile(file) {
        // Method 1: Use file.getBlobURL (simple, works well for direct download)
         file.getBlobURL((err, url) => {
            if (err) {
                displayStatusMessage(`Error getting download URL: ${err.message}`, 'error');
                return;
            }
            const a = document.createElement('a');
            a.href = url;
            a.download = file.name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            // Clean up the blob URL after a short delay
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        });

        // Method 2: Use file.getBuffer (loads entire file into memory first)
        /*
        file.getBuffer((err, buffer) => {
            if (err) {
                displayStatusMessage(`Error getting file buffer: ${err.message}`, 'error');
                return;
            }
            const blob = new Blob([buffer]);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = file.name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });
        */
    }


    function streamFile(file) {
        console.log(`Attempting to stream: ${file.name}`);
        playerContainer.innerHTML = ''; // Clear previous player
        mediaTitleEl.textContent = file.name;
        mediaTitleEl.title = file.name; // Set tooltip for long names

        // Determine if it's video or audio - needed for creating the right element
        const isVideo = file.name.match(/\.(mp4|webm|mkv)$/i); // Add more video types if needed
        const isAudio = file.name.match(/\.(mp3|wav|ogg|m4a)$/i); // Add more audio types if needed

        let mediaElement;
        if (isVideo) {
            mediaElement = document.createElement('video');
            mediaElement.className = 'max-w-full max-h-[75vh]'; // Limit size within modal
            mediaElement.setAttribute('playsinline', ''); // Good for mobile
        } else if (isAudio) {
            mediaElement = document.createElement('audio');
            mediaElement.className = 'w-full';
        } else {
            displayStatusMessage('Cannot stream this file type.', 'error');
            return;
        }

        mediaElement.controls = true; // Show default browser controls
        mediaElement.autoplay = true; // Start playing automatically

        // Append the media element FIRST, then render the file into it
        playerContainer.appendChild(mediaElement);
        file.renderTo(mediaElement, { autoplay: true, controls: true }, (err, elem) => {
             if (err) {
                console.error('Error rendering file:', err);
                displayStatusMessage(`Error streaming file: ${err.message}`, 'error');
                playerContainer.innerHTML = `<p class="text-red-400">Error streaming file: ${err.message}</p>`;
                return;
             }
             console.log('File rendering started in element:', elem);
        });


        mediaPlayerSection.classList.remove('hidden'); // Show the player modal
    }


    // --- Event Listeners ---

    // Form submission for magnet links
    torrentForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const torrentId = torrentIdInput.value.trim();
        if (torrentId) {
            startTorrent(torrentId);
        } else {
            displayStatusMessage('Please enter a magnet link or drop a .torrent file.', 'error');
        }
    });

    // File upload input change
    fileUploadInput.addEventListener('change', (e) => {
        const files = e.target.files;
        if (files.length > 0) {
            const file = files[0];
            if (file.name.endsWith('.torrent')) {
                startTorrent(file);
            } else {
                displayStatusMessage('Please select a valid .torrent file.', 'error');
                 fileUploadInput.value = ''; // Reset input
            }
        }
    });

    // Close media player
    closePlayerBtn.addEventListener('click', () => {
        mediaPlayerSection.classList.add('hidden');
        // Stop playback by removing the source or the element
        playerContainer.innerHTML = '';
    });
     // Close player if clicking outside the content area
     mediaPlayerSection.addEventListener('click', (e) => {
        if (e.target === mediaPlayerSection) { // Check if the click is on the backdrop
            mediaPlayerSection.classList.add('hidden');
            playerContainer.innerHTML = '';
        }
     });


    // Drag and Drop Handling
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault(); // Necessary to allow drop
        e.stopPropagation();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('drag-over');

        const files = e.dataTransfer.files;
        const link = e.dataTransfer.getData('text'); // Check for text (magnet link)

        if (files.length > 0) {
            // Prioritize files if both are present
            const file = files[0];
            if (file.name.endsWith('.torrent')) {
                 // Give visual feedback that file is being processed
                 torrentIdInput.value = `Processing: ${file.name}`;
                 torrentIdInput.disabled = true; // Temporarily disable input
                 fileUploadInput.disabled = true; // Temporarily disable file input label click

                 startTorrent(file);

                 // Re-enable input after a short delay or upon torrent addition/error
                 setTimeout(() => {
                    if (!currentTorrent) { // Only re-enable if torrent wasn't successfully added
                       torrentIdInput.value = '';
                       torrentIdInput.disabled = false;
                       fileUploadInput.disabled = false;
                    }
                 }, 1500); // Adjust delay as needed
            } else {
                displayStatusMessage('Invalid file type dropped. Please drop a .torrent file.', 'error');
            }
        } else if (link && (link.startsWith('magnet:?xt=urn:btih:') || link.match(/^[a-f0-9]{40}$/i) ) ) { // Basic magnet/hash check
            torrentIdInput.value = link; // Populate the input field
            startTorrent(link); // Start immediately
        } else if (link) {
             displayStatusMessage('Invalid text dropped. Please drop a magnet link.', 'error');
        } else {
            displayStatusMessage('Could not process dropped item.', 'error');
        }
    });

    // Initial setup or message
    displayStatusMessage('Ready. Add a magnet link or torrent file.');

}); // End DOMContentLoaded