const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const WebTorrent = require('webtorrent');
const path = require('path');
const cors = require('cors'); // Include CORS

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*", // Allow all origins for simplicity, restrict in production if needed
        methods: ["GET", "POST"]
    }
});

// --- Configuration ---
// !! IMPORTANT: Use Render's Persistent Disk mount path !!
// Render sets the PORT environment variable
const PORT = process.env.PORT || 3000;
// Define the download path (points to the Persistent Disk on Render)
// Default Render disk mount path is often /var/data
// Use an environment variable for flexibility
const DOWNLOAD_PATH = process.env.DOWNLOAD_PATH || path.join(__dirname, 'downloads');
console.log(`Download path configured to: ${DOWNLOAD_PATH}`);
// Ensure the download directory exists (optional, webtorrent might create it)
const fs = require('fs');
if (!fs.existsSync(DOWNLOAD_PATH)) {
    console.log(`Creating download directory: ${DOWNLOAD_PATH}`);
    fs.mkdirSync(DOWNLOAD_PATH, { recursive: true });
}

// --- Middleware ---
app.use(cors()); // Enable CORS for all routes
app.use(express.json()); // To parse JSON bodies
app.use(express.static(path.join(__dirname, 'public'))); // Serve frontend files

// --- WebTorrent Client Setup ---
const client = new WebTorrent();
let torrentState = {}; // Store minimal torrent info

client.on('error', (err) => {
    console.error('WebTorrent error:', err);
});

client.on('torrent', (torrent) => {
    console.log(`Torrent added: ${torrent.name} (${torrent.infoHash})`);
    addTorrentState(torrent);

    torrent.on('download', () => {
        updateTorrentState(torrent);
        // Limit updates to avoid flooding
        throttleEmitUpdate(torrent.infoHash);
    });

    torrent.on('upload', () => {
         updateTorrentState(torrent);
         // Limit updates
         throttleEmitUpdate(torrent.infoHash);
    });

    torrent.on('done', () => {
        console.log(`Torrent finished downloading: ${torrent.name}`);
        updateTorrentState(torrent);
        io.emit('torrentUpdate', getTorrentInfo(torrent)); // Ensure final state is sent
        io.emit('torrentDone', { infoHash: torrent.infoHash, name: torrent.name });
    });

    torrent.on('error', (err) => {
        console.error(`Error in torrent ${torrent.name}:`, err);
        updateTorrentState(torrent, true); // Mark as errored
        io.emit('torrentError', { infoHash: torrent.infoHash, name: torrent.name, error: err.message });
    });

    // Initial state broadcast
    io.emit('torrentUpdate', getTorrentInfo(torrent));
});

// --- State Management & Helpers ---
function getTorrentInfo(torrent) {
    if (!torrent) return null;
    return {
        infoHash: torrent.infoHash,
        name: torrent.name || 'Fetching metadata...',
        progress: (torrent.progress * 100).toFixed(1),
        downloadSpeed: torrent.downloadSpeed,
        uploadSpeed: torrent.uploadSpeed,
        numPeers: torrent.numPeers,
        length: torrent.length,
        downloaded: torrent.downloaded,
        timeRemaining: torrent.timeRemaining,
        done: torrent.done,
        paused: torrent.paused,
        path: torrent.path // Store the base path
        // Note: We don't send the full 'files' array by default for performance,
        // but you could add an endpoint to request file list for a specific torrent.
    };
}

function addTorrentState(torrent) {
    torrentState[torrent.infoHash] = { lastEmitTime: 0 };
    // Consider saving infoHash/magnet to disk here for persistence across restarts
}

function updateTorrentState(torrent, isError = false) {
    if (torrentState[torrent.infoHash]) {
       // update flags if needed, e.g. torrentState[torrent.infoHash].hasError = isError;
    } else {
       addTorrentState(torrent); // Add if somehow missed
    }
}

function removeTorrentState(infoHash) {
    delete torrentState[infoHash];
    // Consider removing saved infoHash/magnet from disk here
}

// Throttle emit updates per torrent to once per second max
const EMIT_THROTTLE_MS = 1000;
function throttleEmitUpdate(infoHash) {
     const now = Date.now();
     if (!torrentState[infoHash]) return; // Should not happen if added correctly
     if (now - torrentState[infoHash].lastEmitTime > EMIT_THROTTLE_MS) {
        const torrent = client.get(infoHash);
        if (torrent) {
           io.emit('torrentUpdate', getTorrentInfo(torrent));
           torrentState[infoHash].lastEmitTime = now;
        }
     }
}

// --- API Routes ---

// Get current torrents
app.get('/api/torrents', (req, res) => {
    const torrents = client.torrents.map(getTorrentInfo);
    res.json(torrents);
});

// Add a new torrent (Magnet URI)
app.post('/api/torrents/add', (req, res) => {
    const { magnetURI } = req.body;
    if (!magnetURI || typeof magnetURI !== 'string') {
        return res.status(400).json({ error: 'Magnet URI is required.' });
    }

    console.log(`Attempting to add torrent: ${magnetURI.substring(0, 50)}...`);

    // Check if torrent already exists
    // Note: webtorrent might handle duplicate adds gracefully depending on version,
    // but explicit check is good practice. infoHash is derived from magnet.
    try {
        const parsed = require('parse-torrent-uri')(magnetURI);
        if (!parsed.infoHash) throw new Error("Invalid Magnet URI")
        if (client.get(parsed.infoHash)) {
            console.log(`Torrent already added: ${parsed.infoHash}`);
            return res.status(409).json({ message: 'Torrent already added.', infoHash: parsed.infoHash });
        }
    } catch (err) {
         console.error("Error parsing magnet URI:", err);
         return res.status(400).json({ error: 'Invalid Magnet URI.' });
    }


    client.add(magnetURI, { path: DOWNLOAD_PATH }, (torrent) => {
        // The 'torrent' event listener handles the rest (state update, emit)
        console.log(`Callback: Torrent adding initiated: ${torrent.infoHash}`);
        res.status(202).json({ message: 'Torrent addition initiated.', infoHash: torrent.infoHash });
    });

    // Handle errors during the initial add phase (e.g., invalid magnet)
    // Note: This requires listening to client 'error' or specific add errors if available.
    // The 'torrent' event's 'error' listener handles runtime torrent errors.
});


// Remove a torrent
app.delete('/api/torrents/:infoHash', (req, res) => {
    const { infoHash } = req.params;
    const torrent = client.get(infoHash);

    if (!torrent) {
        return res.status(404).json({ error: 'Torrent not found.' });
    }

    // Ask webtorrent to remove & destroy
    client.remove(infoHash, { destroyStore: true }, (err) => {
        if (err) {
            console.error(`Error removing torrent ${infoHash}:`, err);
            return res.status(500).json({ error: 'Failed to remove torrent.' });
        }
        removeTorrentState(infoHash);
        io.emit('torrentRemove', { infoHash }); // Notify clients
        console.log(`Torrent removed: ${infoHash}`);
        res.status(200).json({ message: 'Torrent removed successfully.' });

        // !! CAUTION: Optionally delete files !!
        // Uncomment if you want to delete files from disk when removing.
        // BE VERY CAREFUL with file system operations.
        /*
        const torrentPath = path.join(DOWNLOAD_PATH, torrent.name); // Assumes default naming
        console.log(`Attempting to delete files at: ${torrentPath}`);
        fs.rm(torrentPath, { recursive: true, force: true }, (rmErr) => {
            if (rmErr) {
                console.error(`Error deleting torrent files for ${infoHash} at ${torrentPath}:`, rmErr);
                // Don't send error to client, removal from client is done. Log it server-side.
            } else {
                console.log(`Successfully deleted files for torrent ${infoHash}`);
            }
        });
        */
    });
});

// TODO: Implement Pause/Resume routes if needed
// app.post('/api/torrents/:infoHash/pause', ...);
// app.post('/api/torrents/:infoHash/resume', ...);

// --- WebSocket Handling ---
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // Send current state to newly connected client
    const currentTorrents = client.torrents.map(getTorrentInfo);
    socket.emit('initialState', currentTorrents);

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// --- Server Start ---
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
    console.log(`Access the app at http://localhost:${PORT}`);
});

// --- Graceful Shutdown (Optional but Recommended) ---
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

function gracefulShutdown(signal) {
    console.log(`Received ${signal}. Shutting down gracefully...`);
    io.close(() => { // Close socket connections
        console.log('Socket.IO closed.');
        client.destroy((err) => { // Destroy webtorrent client
            if (err) console.error('Error destroying WebTorrent client:', err);
            else console.log('WebTorrent client destroyed.');
            server.close(() => { // Close HTTP server
                console.log('HTTP server closed.');
                process.exit(0);
            });
        });
    });

    // Force exit after timeout
    setTimeout(() => {
        console.error('Could not close connections in time, forcing exit.');
        process.exit(1);
    }, 10000); // 10 seconds timeout
}

// Helper function for parsing magnet URIs if not installing full package
// This is very basic, prefer the 'parse-torrent-uri' package if possible
function parseMagnetBasic(magnetURI) {
    const match = magnetURI.match(/btih:([a-fA-F0-9]{40})/);
    return match ? match[1].toLowerCase() : null;
}
