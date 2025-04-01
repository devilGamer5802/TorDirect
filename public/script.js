/**
 * public/script.js
 * Frontend JavaScript for the Render Torrent Web App
 */

// --- DOM Elements ---
const torrentsList = document.getElementById('torrents');
const addTorrentForm = document.getElementById('add-torrent-form');
const magnetUriInput = document.getElementById('magnet-uri');
const loadingPlaceholder = document.querySelector('.loading-placeholder');

// --- Utility Functions ---

// Format bytes into readable units (KB, MB, GB, etc.)
function formatBytes(bytes, decimals = 2) {
    if (!+bytes) return '0 Bytes'; // Handle null, undefined, 0
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

// Format bytes per second into readable speed
function formatSpeed(bytesPerSecond) {
    return formatBytes(bytesPerSecond) + '/s';
}

// Convert milliseconds to a human-readable time string (d h m s)
function msToTime(duration) {
    if (duration === null || duration === undefined || isNaN(duration) || duration <= 0) {
        return '-'; // Return empty or '-' if duration is invalid or zero
    }

    let seconds = Math.floor((duration / 1000) % 60),
        minutes = Math.floor((duration / (1000 * 60)) % 60),
        hours = Math.floor((duration / (1000 * 60 * 60)) % 24);
        days = Math.floor(duration / (1000 * 60 * 60 * 24));

    let timeString = "";
    if (days > 0) timeString += days + "d ";
    if (hours > 0 || (days > 0 && (minutes > 0 || seconds > 0)) ) timeString += hours + "h "; // Include hours if days>0 even if hours=0 but mins/secs exist
    if (minutes > 0 || (hours > 0 && seconds > 0) || (days > 0 && seconds > 0) ) timeString += minutes + "m "; // Include mins if needed
    if (seconds >= 0) timeString += seconds + "s"; // Always include seconds

    return timeString.trim() || '0s'; // Handle cases resulting in empty string
}

// --- Torrent Rendering ---

// Creates or updates a torrent's representation in the DOM
function renderTorrent(torrent) {
    if (!torrent || !torrent.infoHash) return; // Basic validation

    let torrentItem = document.getElementById(`torrent-${torrent.infoHash}`);

    // Create the list item if it doesn't exist
    if (!torrentItem) {
        torrentItem = document.createElement('li');
        torrentItem.classList.add('torrent-item');
        torrentItem.id = `torrent-${torrent.infoHash}`;
        // Insert before the placeholder, or append if placeholder doesn't exist/is hidden
        if (loadingPlaceholder && torrentsList.contains(loadingPlaceholder)) {
             torrentsList.insertBefore(torrentItem, loadingPlaceholder);
        } else {
            torrentsList.appendChild(torrentItem);
        }
    }

    // Determine status text
    let statusText = 'Connecting...';
    if (torrent.hasError) {
        statusText = `Error: ${torrent.errorMessage || 'Unknown'}`;
    } else if (torrent.done) {
        statusText = 'Done';
    } else if (torrent.paused) {
        statusText = 'Paused';
    } else if (torrent.name === 'Fetching metadata...') {
         statusText = 'Fetching metadata...';
    } else if (torrent.downloadSpeed > 0 || torrent.progress > 0) {
        statusText = 'Downloading';
    } else if (torrent.numPeers === 0) {
        statusText = 'Stalled (No Peers)';
    } else if (torrent.numPeers > 0 && torrent.downloadSpeed === 0) {
        statusText = 'Connecting to peers...';
    }

    // Determine progress bar color and style
     let progressBarStyle = `width: ${torrent.progress}%`;
     let progressBarClass = 'progress-bar';
     if (torrent.hasError) {
         progressBarClass += ' error'; // Add specific class for error styling
         progressBarStyle = `width: 100%`; // Often show full bar red on error
     } else if (torrent.done) {
          progressBarClass += ' done';
     }

    // Update the inner HTML of the torrent item
    torrentItem.innerHTML = `
        <h3>${torrent.name || 'Loading metadata...'}</h3>
        <div class="info">
            <span>Peers: ${torrent.numPeers || 0}</span> |
            <span>Down: ${formatSpeed(torrent.downloadSpeed || 0)}</span> |
            <span>Up: ${formatSpeed(torrent.uploadSpeed || 0)}</span> |
            <span>${formatBytes(torrent.downloaded || 0)} / ${torrent.length ? formatBytes(torrent.length) : '?'}</span> |
            <span class="status ${torrent.hasError ? 'error' : (torrent.done ? 'done' : '')}">${statusText}</span>
            ${!torrent.done && !torrent.paused && !torrent.hasError && torrent.timeRemaining ? `| ETA: ${msToTime(torrent.timeRemaining)}` : ''}
        </div>
        <div class="progress-bar-container">
            <div class="${progressBarClass}" style="${progressBarStyle}">${torrent.progress}%</div>
        </div>
        <div class="actions">
            <!-- <button class="pause-resume" data-infohash="${torrent.infoHash}">${torrent.paused ? 'Resume' : 'Pause'}</button> -->
            <button class="remove" data-infohash="${torrent.infoHash}">Remove</button>
            ${torrent.hasError ? `<span class="error-message-inline">(${torrent.errorMessage || 'Error'})</span>` : ''}
        </div>
        <div class="info-hash" style="font-size: 0.7em; color: #aaa; margin-top: 5px; word-break: break-all;">${torrent.infoHash}</div>
    `;

     // Add specific classes for styling based on state
     torrentItem.classList.toggle('is-done', torrent.done);
     torrentItem.classList.toggle('is-error', torrent.hasError);
     torrentItem.classList.toggle('is-paused', torrent.paused);
     torrentItem.classList.toggle('is-stalled', !torrent.done && !torrent.paused && !torrent.hasError && torrent.numPeers === 0 && torrent.downloadSpeed === 0);

     // Remove loading placeholder if it exists and we are adding a real torrent
     if (loadingPlaceholder) loadingPlaceholder.style.display = 'none';
}

// Remove a torrent element from the DOM
function removeTorrentElement(infoHash) {
    const torrentItem = document.getElementById(`torrent-${infoHash}`);
    if (torrentItem) {
        torrentItem.remove();
    }
    checkEmptyList(); // Update placeholder if necessary
}

// Show or hide the "No active torrents" placeholder
function checkEmptyList() {
    const items = torrentsList.querySelectorAll('.torrent-item');
    if (items.length === 0 && loadingPlaceholder) {
        loadingPlaceholder.textContent = "No active torrents.";
        loadingPlaceholder.style.display = 'block';
    } else if (loadingPlaceholder) {
        loadingPlaceholder.style.display = 'none';
    }
}


// --- Socket.IO Connection & Event Handlers ---
console.log('Attempting to connect to WebSocket server...');
// Use the relative path which works when served from the same origin
// Or use the full Render URL if needed in specific proxy setups: const socket = io('https://your-app-name.onrender.com');
const socket = io();

socket.on('connect', () => {
    console.log('WebSocket Connected!', socket.id);
    if (loadingPlaceholder) {
        // Don't clear the placeholder yet, wait for initialState
         loadingPlaceholder.textContent = 'Loading torrent list...';
         loadingPlaceholder.style.display = 'block';
    }
});

socket.on('disconnect', (reason) => {
    console.warn('WebSocket Disconnected:', reason);
    if (loadingPlaceholder) {
         loadingPlaceholder.textContent = 'Disconnected. Attempting to reconnect...';
         loadingPlaceholder.style.display = 'block';
         // Grey out or disable existing torrents? (Optional UX improvement)
    }
});

socket.on('connect_error', (err) => {
    console.error('WebSocket Connection Error:', err);
     if (loadingPlaceholder) {
         loadingPlaceholder.textContent = `Connection Error: ${err.message}. Check server.`;
         loadingPlaceholder.style.display = 'block';
         torrentsList.innerHTML = ''; // Clear potentially stale torrents
         torrentsList.appendChild(loadingPlaceholder);
    }
});

socket.on('initialState', (torrents) => {
    console.log('Received initial state:', torrents);
    torrentsList.innerHTML = ''; // Clear previous items (like old placeholder)
     if (loadingPlaceholder) {
         torrentsList.appendChild(loadingPlaceholder); // Re-add placeholder temporarily
     }

    if (torrents && torrents.length > 0) {
        torrents.forEach(renderTorrent);
    }
    checkEmptyList(); // Display "No active torrents" if array was empty
});

socket.on('torrentUpdate', (torrent) => {
    // console.log('Torrent update received:', torrent.infoHash); // Can be noisy
    if (loadingPlaceholder) loadingPlaceholder.style.display = 'none'; // Hide if it was visible
    renderTorrent(torrent);
    // No need to call checkEmptyList here as we are adding/updating
});

socket.on('torrentRemove', (data) => {
    console.log('Torrent removed event received:', data.infoHash);
    removeTorrentElement(data.infoHash);
});

socket.on('torrentDone', (data) => {
    console.log(`Torrent finished: ${data.name} (${data.infoHash})`);
    // renderTorrent handles adding 'is-done' class, could add a notification here
    // Example: showNotification(`${data.name} finished downloading!`);
    const item = document.getElementById(`torrent-${data.infoHash}`);
     if(item) {
        // Add a subtle highlight for a moment
        item.classList.add('highlight-done');
        setTimeout(() => item.classList.remove('highlight-done'), 3000);
     }
});

socket.on('torrentError', (data) => {
    console.error(`Error event for torrent ${data.name} (${data.infoHash}): ${data.error}`);
    // renderTorrent handles adding 'is-error' class and showing message inline
});


// --- User Interaction Event Listeners ---

// Handle form submission for adding magnet links
addTorrentForm.addEventListener('submit', async (e) => {
    e.preventDefault(); // Prevent default form submission
    const magnetURI = magnetUriInput.value.trim();
    if (!magnetURI) return; // Ignore empty input

    // Briefly disable button to prevent double submission
    const submitButton = addTorrentForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = 'Adding...';

    try {
        console.log('Sending add request for:', magnetURI);
        // Use fetch API to call the backend endpoint
        const response = await fetch('/api/torrents/add', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ magnetURI }), // Send magnet URI in JSON body
        });

        // Attempt to parse response body as JSON, even for errors
        const result = await response.json().catch(() => ({})); // Default to empty object on parse error

        console.log('Add Response Status:', response.status);
        console.log('Add Response Body:', result);

        // --- Updated Response Handling ---
        if (response.ok) { // Status 200-299 (Primarily 202 Accepted from our backend)
            console.log('Torrent add request accepted:', result);
            magnetUriInput.value = ''; // Clear input field ONLY on successful acceptance
            // Let the WebSocket 'torrentUpdate' event handle adding the torrent to the UI
            // Optional: show temporary success message
        } else if (response.status === 409) {
            // Specific handling for duplicates (Conflict)
            console.warn('Attempted to add duplicate torrent:', result);
            alert(`Torrent already exists: ${result.message || '(This torrent is already in the list)'}`);
            // DO NOT clear the input field here - user might want to copy it or see the duplicate link
        } else {
            // Handle other client/server errors (400, 500, etc.)
            const errorMessage = result.error || result.message || `Failed to add torrent (Server status: ${response.status})`;
            console.error(`Failed to add torrent (${response.status}):`, errorMessage);
            alert(`Error: ${errorMessage}`);
            // DO NOT clear the input field here
        }

    } catch (error) {
        // Handle network errors or issues with the fetch call itself
        console.error('Network or fetch error during add:', error);
        alert('Network error: Could not reach server to add torrent. Please check connection and server status.');
    } finally {
         // Re-enable button regardless of outcome
         submitButton.disabled = false;
         submitButton.textContent = 'Add Magnet';
    }
});

// Handle Remove clicks using event delegation on the list container
torrentsList.addEventListener('click', async (e) => {
    if (e.target.classList.contains('remove')) {
        const button = e.target;
        const infoHash = button.dataset.infohash;

        if (!infoHash) {
            console.error('Remove button clicked without infohash data.');
            return;
        }

        // Confirm before removing (optional but recommended)
        const torrentItem = document.getElementById(`torrent-${infoHash}`);
        const torrentName = torrentItem ? torrentItem.querySelector('h3').textContent : infoHash;
        if (!confirm(`Are you sure you want to remove "${torrentName}"? This action cannot be undone.`)) {
            return; // User clicked cancel
        }

        // Disable button to prevent double clicks during request
        button.disabled = true;
        button.textContent = 'Removing...';
        if (torrentItem) torrentItem.style.opacity = '0.5'; // Visual feedback

        try {
             console.log(`Sending remove request for: ${infoHash}`);
             const response = await fetch(`/api/torrents/${infoHash}`, {
                method: 'DELETE',
             });

             const result = await response.json().catch(() => ({})); // Parse JSON or default

             console.log('Remove Response Status:', response.status);
             console.log('Remove Response Body:', result);

             if (response.ok) { // Status 200 OK
                 console.log(`Remove request successful for ${infoHash}`);
                 // Let the WebSocket event 'torrentRemove' handle the actual UI element removal
                 // removeTorrentElement(infoHash); // Don't remove here, wait for WS broadcast for consistency
             } else {
                 // Handle errors during removal (e.g., 404 Not Found, 500 Server Error)
                  const errorMessage = result.error || result.message || `Failed to remove torrent (Server status: ${response.status})`;
                  console.error(`Failed to remove torrent ${infoHash}:`, errorMessage);
                  alert(`Error removing torrent: ${errorMessage}`);
                  // Re-enable button and restore opacity on failure
                  button.disabled = false;
                  button.textContent = 'Remove';
                  if (torrentItem) torrentItem.style.opacity = '1';
             }

        } catch (error) {
             // Handle network errors
             console.error('Network or fetch error during remove:', error);
             alert('Network error: Could not reach server to remove torrent.');
             // Re-enable button and restore opacity on network failure
             button.disabled = false;
             button.textContent = 'Remove';
             if (torrentItem) torrentItem.style.opacity = '1';
        }
        // Note: Button does not get re-enabled automatically on SUCCESS here,
        // because the element containing the button will be removed by the WebSocket handler.
    }

    // TODO: Add Pause/Resume handling here if implemented on backend/frontend
    /*
    if (e.target.classList.contains('pause-resume')) {
        // ... handle pause/resume clicks ...
    }
    */
});

// --- Initial Setup ---

// Check initial state of the list on page load
checkEmptyList();
