/**
 * server.js
 * Backend for the Render Torrent Web App (Using async/await for ESM import)
 */

// --- CJS Requires (Keep these synchronous ones) ---
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const parseTorrent = require('parse-torrent');

// --- Main Async Function Wrapper ---
(async () => {
    try {
        // --- Dynamic ESM Import ---
        // Use await import() for ESM modules like webtorrent v2+
        console.log('[SETUP] Loading WebTorrent module...');
        const { default: WebTorrent } = await import('webtorrent');
        // Note: ESM modules often export their main class under 'default'.
        console.log('[SETUP] WebTorrent module loaded successfully.');

        // --- Configuration (INSIDE async function) ---
        const PORT = process.env.PORT || 3000;
        const DOWNLOAD_PATH = process.env.DOWNLOAD_PATH || path.join(__dirname, 'downloads');

        console.log(`[INFO] Server starting...`);
        console.log(`[CONFIG] PORT set to: ${PORT}`);
        console.log(`[CONFIG] DOWNLOAD_PATH set to: ${DOWNLOAD_PATH}`);

        // Ensure download directory exists
        if (!fs.existsSync(DOWNLOAD_PATH)) {
            console.log(`[SETUP] Download directory not found. Creating: ${DOWNLOAD_PATH}`);
            fs.mkdirSync(DOWNLOAD_PATH, { recursive: true });
            console.log(`[SETUP] Download directory created successfully.`);
        } else {
            console.log(`[SETUP] Download directory already exists: ${DOWNLOAD_PATH}`);
        }

        // --- App/Server/Socket Instances (INSIDE async function) ---
        const app = express();
        const server = http.createServer(app);
        const io = socketIo(server, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            }
        });

        // --- Middleware (INSIDE async function) ---
        app.use(cors());
        app.use(express.json());
        app.use(express.static(path.join(__dirname, 'public')));

        // --- WebTorrent Client Setup (INSIDE async function) ---
        console.log('[SETUP] Initializing WebTorrent client...');
        // Now 'WebTorrent' is the class constructor imported via await
        const client = new WebTorrent();
        console.log('[SETUP] WebTorrent client initialized.');
        const torrentState = {};

        // --- State Management & Helper Functions (INSIDE async function scope) ---
        // (Keep these functions as they were, they can be defined here)
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
              uploaded: torrent.uploaded,
              timeRemaining: torrent.timeRemaining === Infinity ? null : torrent.timeRemaining,
              done: torrent.done,
              paused: torrent.paused,
              path: torrent.path,
              hasError: torrentState[torrent.infoHash]?.hasError || false,
              errorMessage: torrentState[torrent.infoHash]?.errorMessage || null
          };
        }

        function addTorrentToState(infoHash) {
          if (!torrentState[infoHash]) {
              torrentState[infoHash] = { lastEmitTime: 0, hasError: false, errorMessage: null };
              // TODO: Persistence improvement
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
           // TODO: Persistence improvement
        }

        const EMIT_THROTTLE_MS = 1000;
        function throttleEmitUpdate(infoHash) {
          const now = Date.now();
          const state = torrentState[infoHash];
          if (!state) return;
          if (now - state.lastEmitTime > EMIT_THROTTLE_MS) {
              const torrent = client.get(infoHash);
              if (torrent) {
                  io.emit('torrentUpdate', getTorrentInfo(torrent));
                  state.lastEmitTime = now;
              }
          }
        }

        // --- WebTorrent Event Listeners (INSIDE async function scope) ---
        client.on('error', (err) => {
            console.error('[ERROR] WebTorrent Client Error:', err);
        });

        client.on('torrent', (torrent) => {
            console.log(`[TORRENT ADDED] Name: ${torrent.name || torrent.infoHash}, Hash: ${torrent.infoHash}`);
            addTorrentToState(torrent.infoHash);
            io.emit('torrentUpdate', getTorrentInfo(torrent));

            torrent.on('metadata', () => { /* ... */ io.emit('torrentUpdate', getTorrentInfo(torrent)); });
            torrent.on('download', (bytes) => throttleEmitUpdate(torrent.infoHash));
            torrent.on('upload', (bytes) => throttleEmitUpdate(torrent.infoHash));
            torrent.on('done', () => { /* ... */ io.emit('torrentUpdate', getTorrentInfo(torrent)); io.emit('torrentDone', { /*...*/ }); });
            torrent.on('error', (err) => { /* ... */ updateTorrentErrorState(torrent.infoHash, err); io.emit('torrentUpdate', getTorrentInfo(torrent)); io.emit('torrentError', { /*...*/ }); });
            torrent.on('warning', (err) => { console.warn(`[TORRENT WARNING] ${torrent.infoHash}:`, err); });
        });


        // --- API Routes (INSIDE async function scope) ---
        app.get('/api/torrents', (req, res) => {
             const torrents = client.torrents.map(getTorrentInfo);
             res.json(torrents);
        });

        app.post('/api/torrents/add', (req, res) => {
            // (Keep the add logic as it was)
            const { magnetURI } = req.body;
             if (!magnetURI || typeof magnetURI !== 'string') { /* ... */ }
             let parsed;
             try {
                 parsed = parseTorrent(magnetURI);
                 if (!parsed || !parsed.infoHash) { throw new Error("Invalid/incomplete Magnet URI"); }
             } catch (err) { /*...*/ return res.status(400).json({ error: 'Invalid Magnet URI.' }); }
             if (client.get(parsed.infoHash)) { /*...*/ return res.status(409).json({ message: 'Torrent already active.'}); }
             const options = { path: DOWNLOAD_PATH };
             client.add(magnetURI, options, (torrent) => {
                  console.log(`[API] Callback: Torrent add initiated for ${torrent.infoHash}`);
                  res.status(202).json({ message: 'Torrent addition initiated.', infoHash: torrent.infoHash });
             });
        });

        app.delete('/api/torrents/:infoHash', (req, res) => {
            // (Keep the delete logic as it was)
             const { infoHash } = req.params;
             const torrent = client.get(infoHash);
             if (!torrent) { /*...*/ return res.status(404).json({ error: 'Torrent not found.' }); }
             client.remove(infoHash, { destroyStore: true }, (err) => {
                 if (err) { /*...*/ return res.status(500).json({ error: 'Failed to remove torrent.' }); }
                 removeTorrentFromState(infoHash);
                 io.emit('torrentRemove', { infoHash });
                 // Optional file deletion logic here (commented out previously)
                 res.status(200).json({ message: 'Torrent removed.' });
             });
        });

        // --- WebSocket Event Handling (INSIDE async function scope) ---
        io.on('connection', (socket) => {
            console.log(`[WS] Client connected: ${socket.id}`);
            const currentTorrents = client.torrents.map(getTorrentInfo);
            socket.emit('initialState', currentTorrents);
            console.log(`[WS] Sent initial state (${currentTorrents.length} torrents) to ${socket.id}`);
            socket.on('disconnect', (reason) => {
                console.log(`[WS] Client disconnected: ${socket.id}, Reason: ${reason}`);
            });
        });


        // --- Server Initialization (INSIDE async function) ---
        server.listen(PORT, () => {
            console.log(`[INFO] Express server listening on http://localhost:${PORT}`);
            // Optional resume logic here
        });


        // --- Graceful Shutdown Function (Defined INSIDE IIFE to access io, client, server) ---
        const gracefulShutdown = (signal) => {
            console.log(`[SYSTEM] Received ${signal}. Shutting down gracefully...`);
            io.close(() => { // Close socket connections first
                console.log('[SYSTEM] Socket.IO closed.');
                if (client && typeof client.destroy === 'function') {
                    client.destroy((err) => { // Then destroy webtorrent client
                        if (err) console.error('[SYSTEM] Error destroying WebTorrent client:', err);
                        else console.log('[SYSTEM] WebTorrent client destroyed.');
                        server.close(() => { // Finally close HTTP server
                            console.log('[SYSTEM] HTTP server closed.');
                            process.exit(0);
                        });
                    });
                } else {
                     // Fallback if client wasn't initialized or doesn't have destroy
                     server.close(() => {
                           console.log('[SYSTEM] HTTP server closed (WebTorrent client likely not initialized).');
                           process.exit(0);
                     });
                }
            });

            // Force exit after timeout
            setTimeout(() => {
                console.error('[SYSTEM] Graceful shutdown timed out. Forcing exit.');
                process.exit(1);
            }, 10000);
        }

         // --- Signal Listeners (Outside IIFE, but call the function defined inside) ---
        // These listeners still need to be attached globally
        process.on('SIGINT', () => gracefulShutdown('SIGINT'));
        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));


    } catch (error) {
        // --- Error Handling for Top-Level Async Function ---
        console.error('[FATAL] Failed during server setup or ESM import:', error);
        process.exit(1); // Exit if basic setup fails
    }
})(); // Execute the async function immediately
