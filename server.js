/**
 * server.js (Modified for Render FREE TIER - EPHEMERAL STORAGE ONLY)
 * Backend for the Render Torrent Web App
 *
 * !!! WARNING !!!
 * THIS VERSION RUNS ON RENDER'S FREE TIER WITHOUT A PERSISTENT DISK.
 * - ALL DOWNLOADED FILES WILL BE LOST ON SERVER RESTARTS/DEPLOYS.
 * - TORRENT LIST IS NOT SAVED AND WILL BE LOST ON RESTARTS.
 * This is suitable only for temporary viewing/downloading, not long-term storage or seeding.
 */

// --- CJS Requires ---
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const parseTorrent = require('parse-torrent');

// --- Placeholder for Graceful Shutdown ---
let gracefulShutdown = (signal) => {
    console.warn(`[SYSTEM] Shutdown called (${signal}) before app fully initialized.`);
    process.exit(1);
};

// --- Main Async IIFE ---
(async () => {
    try {
        // --- Dynamic ESM Import ---
        console.log('[SETUP] Loading WebTorrent (ESM) module...');
        const { default: WebTorrent } = await import('webtorrent');
        console.log('[SETUP] WebTorrent module loaded successfully.');

        // --- Configuration (Using TEMPORARY/EPHEMERAL path) ---
        const PORT = process.env.PORT || 3000;
        // Use a temporary path within the project structure or /tmp
        // Using './ephemeral_downloads' might be slightly more reliable than /tmp across environments
        const DOWNLOAD_PATH = path.join(__dirname, 'ephemeral_downloads');
        // --- PERSISTENCE FILE LOGIC IS REMOVED ---

        console.log(`[INFO] Server starting application setup...`);
        console.log(`[CONFIG] PORT set to: ${PORT}`);
        console.log(`[CONFIG] !! USING EPHEMERAL DOWNLOAD_PATH: ${DOWNLOAD_PATH} !!`);
        console.warn(`[CONFIG WARN] Files in this path will be DELETED on server restarts/deploys.`);

        // --- Ensure TEMPORARY Download Directory Exists ---
        try {
             // For ephemeral storage, we DO need to create the directory.
            if (!fs.existsSync(DOWNLOAD_PATH)) {
                console.log(`[SETUP] Ephemeral download directory not found. Creating: ${DOWNLOAD_PATH}`);
                fs.mkdirSync(DOWNLOAD_PATH, { recursive: true });
                console.log(`[SETUP] Ephemeral download directory created successfully.`);
            } else {
                 console.log(`[SETUP] Ephemeral download directory already exists: ${DOWNLOAD_PATH}`);
                 // Optional: Clear the directory on startup? Might be useful for free tier.
                 /*
                 console.log(`[SETUP] Clearing contents of ephemeral directory: ${DOWNLOAD_PATH}`);
                 fs.readdirSync(DOWNLOAD_PATH).forEach(file => {
                     fs.rmSync(path.join(DOWNLOAD_PATH, file), { recursive: true, force: true });
                 });
                 */
            }
            // Basic write test still useful
            const testFilePath = path.join(DOWNLOAD_PATH, '.write_test');
            fs.writeFileSync(testFilePath, 'test');
            fs.unlinkSync(testFilePath);
            console.log(`[SETUP] Write access to ${DOWNLOAD_PATH} confirmed.`);

        } catch (err) {
            console.error(`[FATAL] Could not create or access ephemeral download directory: ${DOWNLOAD_PATH}`, err);
            throw err;
        }

        // --- Express App, HTTP Server, Socket.IO Setup ---
        const app = express();
        const server = http.createServer(app);
        const io = socketIo(server, { /* ... CORS config ... */ });

        // --- Express Middleware ---
        app.use(cors());
        app.use(express.json());
        app.use(express.static(path.join(__dirname, 'public')));

        // --- WebTorrent Client Setup ---
        const client = new WebTorrent();
        const torrentState = {}; // For throttling, error flags (still useful in-memory)

        // --- REMOVED PERSISTENCE HELPER FUNCTIONS ---
        // saveMagnetToFile(...) and removeMagnetFromFile(...) are GONE.

        // --- State Management & Helper Functions ---
        // getTorrentInfo(...) remains the same
        function getTorrentInfo(torrent) { /* ... as before ... */ }
        // throttleEmitUpdate(...) remains the same
        function throttleEmitUpdate(infoHash) { /* ... as before ... */ }
         // updateTorrentErrorState(...) remains the same
        function updateTorrentErrorState(infoHash, error) { /* ... as before ... */ }


        // --- WebTorrent Global Event Listeners ---
        client.on('error', (err) => { console.error('[ERROR] WT Client:', err); });
        client.on('torrent', (torrent) => {
            console.log(`[EVENT torrent] Detected: ${torrent.infoHash}`);
             if (!torrentState[torrent.infoHash]) { /* init state */}
             io.emit('torrentUpdate', getTorrentInfo(torrent));

            // Torrent Specific Listeners (NO PERSISTENCE CALLS)
            torrent.on('metadata', () => {
                 console.log(`[EVENT metadata] ${torrent.infoHash} - ${torrent.name}`);
                 io.emit('torrentUpdate', getTorrentInfo(torrent));
                 // NO saveMagnetToFile() call here
            });
            torrent.on('download', (bytes) => throttleEmitUpdate(torrent.infoHash));
            torrent.on('upload', (bytes) => throttleEmitUpdate(torrent.infoHash));
            torrent.on('done', () => { /* ... as before, no persistence changes ... */ });
            torrent.on('error', (err) => { /* ... as before, no persistence changes ... */ });
            torrent.on('warning', (err) => { console.warn(`[WARN ${torrent.infoHash}]`, err); });
        });


        // --- API Routes ---

        app.get('/api/torrents', (req, res) => { /* ... as before ... */ });

        app.post('/api/torrents/add', (req, res) => {
             const { magnetURI } = req.body;
             // ... validation ...
             let parsed;
             try {
                 parsed = parseTorrent(magnetURI.trim());
                  if (!parsed || !parsed.infoHash) { throw new Error("Invalid Hash"); }
             } catch (err) { return res.status(400).json({ error: 'Invalid Magnet.'}); }

            if (client.get(parsed.infoHash)) {
                 return res.status(409).json({ message: 'Torrent already active.', infoHash: parsed.infoHash });
            }

            // NO saveMagnetToFile() call here
            const options = { path: DOWNLOAD_PATH }; // Use ephemeral path
             client.add(magnetURI.trim(), options, (torrent) => { /* callback */ });
             res.status(202).json({ message: 'Addition initiated.', infoHash: parsed.infoHash });
        });

        app.delete('/api/torrents/:infoHash', (req, res) => {
             const { infoHash } = req.params;
             const torrent = client.get(infoHash);

            if (!torrent) {
                 // NO removeMagnetFromFile() call needed if not found
                 return res.status(404).json({ error: 'Torrent not found.' });
            }

            const torrentPath = torrent.path; // Store path BEFORE removing torrent object

            client.remove(infoHash, { destroyStore: true }, (err) => {
                 if (err) {
                      // NO removeMagnetFromFile() call on error
                      return res.status(500).json({ error: 'Failed to remove torrent.' });
                 }
                 delete torrentState[infoHash];
                 // NO removeMagnetFromFile() call here
                 io.emit('torrentRemove', { infoHash });

                 // Optional File Deletion - MORE IMPORTANT for ephemeral storage to free space
                 console.warn(`[DELETE] Attempting cleanup of ephemeral files at: ${torrentPath}`);
                 fs.rm(torrentPath, { recursive: true, force: true }, (rmErr) => {
                      if (rmErr) { console.error(`[DELETE ERROR] Could not clean ephemeral files for ${infoHash}:`, rmErr); }
                      else { console.log(`[DELETE] Ephemeral files cleaned for ${infoHash}`); }
                 });

                 res.status(200).json({ message: 'Torrent removed.' });
            });
        });


        // --- WebSocket Event Handling ---
        io.on('connection', (socket) => { /* ... as before ... */ });


        // --- Server Initialization (NO SAVED TORRENT LOADING) ---
        server.listen(PORT, () => {
            console.log(`[INFO] Express server listening on http://localhost:${PORT}`);
            console.warn(`[INFO] Persistence is DISABLED (Free Tier Mode). Downloads are temporary.`);
             console.log("[SETUP] Initialization complete. Server ready.");
        });


        // --- Define the Actual Graceful Shutdown Logic ---
        gracefulShutdown = (signal) => { /* ... as before ... */ };

    } catch (error) {
         console.error('[FATAL] Failed during server setup:', error);
         process.exit(1);
    }
})(); // Execute async function

// --- Global Signal Handlers ---
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
