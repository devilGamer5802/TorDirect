/**
 * server.js
 * Backend for the Render Torrent Web App
 */

// --- Requires ---
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const WebTorrent = require('webtorrent');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const parseTorrent = require('parse-torrent'); // Use the correct package name

// --- Configuration ---
const PORT = process.env.PORT || 3000; // Render provides the PORT env var

// IMPORTANT: This MUST match the Mount Path of your Persistent Disk on Render
// Use an environment variable for flexibility, defaulting for local dev
const DOWNLOAD_PATH = process.env.DOWNLOAD_PATH || path.join(__dirname, 'downloads');

console.log(`[INFO] Server starting...`);
console.log(`[CONFIG] PORT set to: ${PORT}`);
console.log(`[CONFIG] DOWNLOAD_PATH set to: ${DOWNLOAD_PATH}`);

// Ensure the download directory exists on startup
try {
    if (!fs.existsSync(DOWNLOAD_PATH)) {
        console.log(`[SETUP] Download directory not found. Creating: ${DOWNLOAD_PATH}`);
        fs.mkdirSync(DOWNLOAD_PATH, { recursive: true });
        console.log(`[SETUP] Download directory created successfully.`);
    } else {
        console.log(`[SETUP] Download directory already exists: ${DOWNLOAD_PATH}`);
    }
} catch (err) {
    console.error(`[FATAL] Could not create download directory: ${DOWNLOAD_PATH}`, err);
    process.exit(1); // Exit if we can't create the essential download path
}


// --- Express App Setup ---
const app = express();
const server = http.createServer(app);

// --- Socket.IO Setup ---
const io = socketIo(server, {
    cors: {
        origin: "*", // Allow all origins for simplicity; restrict in production if needed
        methods: ["GET", "POST"]
    }
});

// --- Middleware ---
app.use(cors()); // Enable CORS for all origins/routes
app.use(express.json()); // Parse JSON request bodies
app.use(express.static(path.join(__dirname, 'public'))); // Serve static frontend files

// --- WebTorrent Client Setup ---
const client = new WebTorrent();
const torrentState = {}; // In-memory store for minimal state (e.g., throttling info)

// --- State Management & Helper Functions ---

function getTorrentInfo(torrent) {
    if (!torrent) return null;
    return {
        infoHash: torrent.infoHash,
        name: torrent.name || 'Fetching metadata...',
        progress: (torrent.progress * 100).toFixed(1),
        downloadSpeed: torrent.downloadSpeed,
        uploadSpeed: torrent.uploadSpeed,
        numPeers: torrent.numPeers,
        length: torrent.length,         // Total size
        downloaded: torrent.downloaded, // Bytes downloaded
        uploaded: torrent.uploaded,     // Bytes uploaded
        timeRemaining: torrent.timeRemaining === Infinity ? null : torrent.timeRemaining, // Avoid sending Infinity
        done: torrent.done,
        paused: torrent.paused,
        path: torrent.path, // Base path where torrent is saved
        // files: torrent.files.map(f => ({ name: f.name, path: f.path, length: f.length })) // Optionally include file list
        hasError: torrentState[torrent.infoHash]?.hasError || false, // Check if we flagged an error
        errorMessage: torrentState[torrent.infoHash]?.errorMessage || null
    };
}

function addTorrentToState(infoHash) {
    if (!torrentState[infoHash]) {
        torrentState[infoHash] = { lastEmitTime: 0, hasError: false, errorMessage: null };
        // --- Persistence (Improvement) ---
        // TODO: Save infoHash/magnet URI to a file on the persistent disk here
        //       so it can be reloaded on server restart.
        // Example: append Magnet URI to a 'torrents.txt' file.
    }
}

function updateTorrentErrorState(infoHash, error) {
     if (torrentState[infoHash]) {
         torrentState[infoHash].hasError = true;
         torrentState[infoHash].errorMessage = error ? error.message : 'Unknown error';
     }
}

function removeTorrentFromState(infoHash) {
    delete torrentState[infoHash];
     // --- Persistence (Improvement) ---
     // TODO: Remove the corresponding infoHash/magnet from your persistent storage file.
}

// Throttle WebSocket updates for performance
const EMIT_THROTTLE_MS = 1000; // Max 1 update per second per torrent
function throttleEmitUpdate(infoHash) {
    const now = Date.now();
    const state = torrentState[infoHash];
    if (!state) return; // Shouldn't happen if addTorrentToState is called correctly

    if (now - state.lastEmitTime > EMIT_THROTTLE_MS) {
        const torrent = client.get(infoHash);
        if (torrent) {
            io.emit('torrentUpdate', getTorrentInfo(torrent));
            state.lastEmitTime = now;
        }
    }
}

// --- WebTorrent Global Event Listeners ---

client.on('error', (err) => {
    console.error('[ERROR] WebTorrent Client Error:', err);
    // Maybe broadcast a general client error?
    // io.emit('clientError', { message: err.message });
});

client.on('torrent', (torrent) => {
    console.log(`[TORRENT ADDED] Name: ${torrent.name || torrent.infoHash}, Hash: ${torrent.infoHash}`);
    addTorrentToState(torrent.infoHash);

    // Emit initial state for this specific torrent
    io.emit('torrentUpdate', getTorrentInfo(torrent));

    // --- Torrent Specific Event Listeners ---

    torrent.on('metadata', () => {
        console.log(`[METADATA] ${torrent.infoHash} - Name: ${torrent.name}`);
        // Name is now available, send an update
        io.emit('torrentUpdate', getTorrentInfo(torrent));
        // Persist the magnet URI now that we likely have the name in it (optional)
    });

    torrent.on('download', (bytes) => {
        // Throttled update
        throttleEmitUpdate(torrent.infoHash);
    });

    torrent.on('upload', (bytes) => {
        // Throttled update
        throttleEmitUpdate(torrent.infoHash);
    });

    torrent.on('done', () => {
        console.log(`[TORRENT DONE] ${torrent.infoHash} - Name: ${torrent.name}`);
        updateTorrentErrorState(torrent.infoHash, null); // Clear any previous error state
        const finalState = getTorrentInfo(torrent);
        io.emit('torrentUpdate', finalState); // Ensure final 'done' state is emitted
        io.emit('torrentDone', { infoHash: torrent.infoHash, name: torrent.name });
    });

    torrent.on('error', (err) => {
        console.error(`[TORRENT ERROR] ${torrent.infoHash} - Name: ${torrent.name}:`, err);
        updateTorrentErrorState(torrent.infoHash, err); // Store error state
        io.emit('torrentUpdate', getTorrentInfo(torrent)); // Emit update with error info
        io.emit('torrentError', {
            infoHash: torrent.infoHash,
            name: torrent.name || 'Fetching metadata...',
            error: err.message
        });
    });

     torrent.on('warning', (err) => {
        console.warn(`[TORRENT WARNING] ${torrent.infoHash} - Name: ${torrent.name}:`, err);
         // Optionally emit warnings too
         // io.emit('torrentWarning', { infoHash: torrent.infoHash, name: torrent.name, warning: err.message });
    });
});

// --- API Routes ---

// GET /api/torrents - List all currently active torrents
app.get('/api/torrents', (req, res) => {
    const torrents = client.torrents.map(getTorrentInfo);
    res.json(torrents);
});

// POST /api/torrents/add - Add a new torrent via Magnet URI
app.post('/api/torrents/add', (req, res) => {
    const { magnetURI } = req.body;

    if (!magnetURI || typeof magnetURI !== 'string') {
        return res.status(400).json({ error: 'Magnet URI is required and must be a string.' });
    }

    console.log(`[API] Received add request for: ${magnetURI.substring(0, 60)}...`);

    let parsed;
    try {
        // Use the CORRECT package 'parse-torrent'
        parsed = parseTorrent(magnetURI);
        if (!parsed || !parsed.infoHash) {
            // Basic check, parse-torrent might succeed but still lack infoHash for malformed magnets
            throw new Error("Invalid or incomplete Magnet URI structure.");
        }
        console.log(`[API] Parsed Magnet URI. Info Hash: ${parsed.infoHash}`);

    } catch (err) {
        console.error("[API] Error parsing magnet URI:", err.message);
        // Don't expose detailed error message to client usually
        return res.status(400).json({ error: 'Invalid Magnet URI provided.' });
    }

    // Check if torrent already exists
    if (client.get(parsed.infoHash)) {
        console.log(`[API] Torrent already exists: ${parsed.infoHash}`);
        return res.status(409).json({ // 409 Conflict is appropriate
            message: 'Torrent is already active in the client.',
            infoHash: parsed.infoHash
        });
    }

    // Options for adding the torrent
    const options = {
        path: DOWNLOAD_PATH // Crucial: Save to the persistent disk path
        // Add other options here if needed, e.g.,
        // announce: [], // Override announce trackers
    };

    // Add the torrent to the client
    client.add(magnetURI, options, (torrent) => {
        // This callback executes *after* the 'torrent' event is typically emitted,
        // often when metadata is first available.
        // The 'torrent' event listener above handles the primary logic.
        console.log(`[API] Callback: Torrent addition process initiated for ${torrent.infoHash}`);
        // Respond with 202 Accepted, as adding is asynchronous.
        // Client should rely on WebSocket updates for status.
        res.status(202).json({
            message: 'Torrent addition initiated.',
            infoHash: torrent.infoHash
        });
    });

    // Note: Initial 'client.add' errors (like invalid tracker responses) might trigger
    // the global 'error' or torrent-specific 'error'/'warning' listeners.
});

// DELETE /api/torrents/:infoHash - Remove a torrent
app.delete('/api/torrents/:infoHash', (req, res) => {
    const { infoHash } = req.params;
    const torrent = client.get(infoHash);

    console.log(`[API] Received remove request for: ${infoHash}`);

    if (!torrent) {
        console.log(`[API] Torrent not found for removal: ${infoHash}`);
        // If it's not found, it might have already been removed or never existed
        // Return 404 or maybe 200 OK if we want removal to be idempotent. 404 seems clearer.
        return res.status(404).json({ error: 'Torrent not found.' });
    }

    const torrentName = torrent.name || infoHash; // Get name for logging/optional file deletion
    const torrentPath = torrent.path; // Get the specific path used by this torrent

    client.remove(infoHash, { destroyStore: true }, (err) => {
        if (err) {
            console.error(`[API] Error removing torrent ${infoHash} from WebTorrent client:`, err);
            return res.status(500).json({ error: 'Failed to remove torrent from client.' });
        }

        console.log(`[API] Torrent ${infoHash} removed successfully from client.`);
        removeTorrentFromState(infoHash); // Update our simple state store
        io.emit('torrentRemove', { infoHash }); // Notify frontend clients

        // --- Optional: Delete downloaded files ---
        // !! WARNING: Uncommenting this WILL delete files permanently !!
        // !! Use with EXTREME caution. Ensure paths are correct. !!
        /*
        const fullPathToDelete = path.join(DOWNLOAD_PATH, torrentPath); // path is relative to DOWNLOAD_PATH
        console.warn(`[API] Attempting to delete files for torrent ${infoHash} at: ${fullPathToDelete}`);
        fs.rm(fullPathToDelete, { recursive: true, force: true }, (rmErr) => {
            if (rmErr) {
                // Log the error, but the torrent *is* removed from the client.
                // Don't fail the request just because file deletion failed.
                console.error(`[API] Error deleting files for torrent ${infoHash} at ${fullPathToDelete}:`, rmErr);
            } else {
                console.log(`[API] Successfully deleted files for removed torrent ${infoHash}`);
            }
        });
        */

        // Respond AFTER client removal is confirmed.
        res.status(200).json({ message: 'Torrent removed successfully.' });
    });
});


// --- WebSocket Event Handling ---
io.on('connection', (socket) => {
    console.log(`[WS] Client connected: ${socket.id}`);

    // Send the current state of all torrents to the newly connected client
    const currentTorrents = client.torrents.map(getTorrentInfo);
    socket.emit('initialState', currentTorrents);
    console.log(`[WS] Sent initial state (${currentTorrents.length} torrents) to ${socket.id}`);

    socket.on('disconnect', (reason) => {
        console.log(`[WS] Client disconnected: ${socket.id}, Reason: ${reason}`);
    });

    // Handle potential client-side errors or custom events if needed
    // socket.on('clientError', (data) => { ... });
});


// --- Server Initialization ---
server.listen(PORT, () => {
    console.log(`[INFO] Express server listening on http://localhost:${PORT}`);
    // --- Persistence (Improvement) ---
    // TODO: On startup, read the saved list of infoHashes/magnets
    //       from the persistent disk file and use client.add() for each
    //       to resume previous torrents. Make sure to handle errors gracefully
    //       if a saved torrent can no longer be added.
    /* Example idea:
    try {
        const savedTorrents = fs.readFileSync(path.join(DOWNLOAD_PATH, 'torrents.txt'), 'utf8').split('\n');
        savedTorrents.forEach(magnet => {
            if (magnet.trim()) {
                 console.log(`[RESUME] Attempting to resume: ${magnet.substring(0,60)}...`);
                 client.add(magnet.trim(), { path: DOWNLOAD_PATH }, torrent => {
                      console.log(`[RESUME] Successfully re-added ${torrent.infoHash}`);
                 });
            }
        });
    } catch (err) {
         if (err.code !== 'ENOENT') { // Ignore if file doesn't exist
              console.error('[ERROR] Could not load saved torrents for resuming:', err);
         } else {
              console.log('[INFO] No saved torrents file found to resume.');
         }
    }
    */
});


// --- Graceful Shutdown ---
function gracefulShutdown(signal) {
    console.log(`[SYSTEM] Received ${signal}. Shutting down gracefully...`);
    io.close(() => {
        console.log('[SYSTEM] Socket.IO closed.');
        // Destroy the WebTorrent client, closing connections and releasing resources
        client.destroy((err) => {
            if (err) console.error('[SYSTEM] Error destroying WebTorrent client:', err);
            else console.log('[SYSTEM] WebTorrent client destroyed.');

            // Close the HTTP server
            server.close(() => {
                console.log('[SYSTEM] HTTP server closed.');
                process.exit(0); // Exit successfully
            });
        });
    });

    // Force exit after a timeout if graceful shutdown hangs
    setTimeout(() => {
        console.error('[SYSTEM] Graceful shutdown timed out. Forcing exit.');
        process.exit(1);
    }, 10000); // 10 seconds timeout
}

process.on('SIGINT', () => gracefulShutdown('SIGINT')); // Ctrl+C
process.on('SIGTERM', () => gracefulShutdown('SIGTERM')); // Termination signal from Render/Docker/etc.
