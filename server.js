/**
 * server.js (Full Version with Streaming)
 * Backend for the TorDirect Web App
 */

// --- CJS Requires ---
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const parseTorrent = require('parse-torrent');
const mime = require('mime'); // <-- ADDED for MIME types

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

        // --- Configuration (ASSUMES PERSISTENT DISK) ---
        const PORT = process.env.PORT || 3000;
        // !! IMPORTANT: Ensure this matches Render Persistent Disk Mount Path !!
        const DOWNLOAD_PATH = process.env.DOWNLOAD_PATH || path.join(__dirname, 'persistent_downloads');

        // --- Persistence File Path ---
        const SAVED_TORRENTS_FILE = path.join(DOWNLOAD_PATH, '.saved_torrents.txt');

        console.log(`[INFO] Server starting application setup...`);
        console.log(`[CONFIG] PORT set to: ${PORT}`);
        console.log(`[CONFIG] DOWNLOAD_PATH set to: ${DOWNLOAD_PATH}`);
        console.log(`[CONFIG] Persistence file set to: ${SAVED_TORRENTS_FILE}`);
        console.warn(`[CONFIG WARN] Ensure ${DOWNLOAD_PATH} points to a Persistent Disk on Render.`);

        // --- Verify Download Directory Exists (Provided by Mount) ---
        try {
            if (!fs.existsSync(DOWNLOAD_PATH)) {
                console.error(`[FATAL] Download directory (Mount Path) NOT FOUND: ${DOWNLOAD_PATH}`);
                throw new Error(`Mount path ${DOWNLOAD_PATH} does not exist.`);
            } else {
                 console.log(`[SETUP] Verified Download directory (Mount Path) exists: ${DOWNLOAD_PATH}`);
                // Check write access
                 try {
                      const testFilePath = path.join(DOWNLOAD_PATH, '.write_test');
                      fs.writeFileSync(testFilePath, 'test');
                      fs.unlinkSync(testFilePath);
                      console.log(`[SETUP] Write access to ${DOWNLOAD_PATH} confirmed.`);
                 } catch (writeErr) {
                      console.error(`[FATAL] ${DOWNLOAD_PATH} exists but IS NOT WRITABLE.`, writeErr);
                      throw new Error(`Download path ${DOWNLOAD_PATH} not writable.`);
                 }
            }
        } catch (err) {
             console.error(`[FATAL] Error during download directory verification:`, err.message);
             throw err;
        }

        // --- Express App, HTTP Server, Socket.IO Setup ---
        const app = express();
        const server = http.createServer(app);
        const io = socketIo(server, { /* ... CORS config ... */ });

        // --- Middleware ---
        app.use(cors());
        app.use(express.json());
        app.use(express.static(path.join(__dirname, 'public')));

        // --- WebTorrent Client ---
        const client = new WebTorrent();
        const torrentState = {};

        // --- Persistence Functions (saveMagnetToFile, removeMagnetFromFile) ---
        // (Include the functions exactly as provided in the previous "persistence fix" response)
        function saveMagnetToFile(magnetURI) { /* ... implementation ... */ }
        function removeMagnetFromFile(infoHashToRemove) { /* ... implementation ... */ }


        // --- State & Helper Functions ---
        function getTorrentInfo(torrent) {
             if (!torrent) return null;
             const state = torrentState[torrent.infoHash] || {};
             // Include simplified file list
             const files = torrent.files ? torrent.files.map((file, index) => ({
                index: index, // Easier to reference by index in API calls
                name: file.name,
                path: file.path, // Relative path within torrent
                length: file.length,
                downloaded: file.downloaded // Track individual file progress
             })) : [];

             return {
                 infoHash: torrent.infoHash,
                 name: torrent.name || 'Fetching metadata...',
                 progress: (torrent.progress * 100).toFixed(1),
                 // ... other fields (speed, peers, etc.) ...
                 length: torrent.length,
                 downloaded: torrent.downloaded,
                 uploaded: torrent.uploaded,
                 timeRemaining: torrent.timeRemaining === Infinity ? null : torrent.timeRemaining,
                 done: torrent.done,
                 paused: torrent.paused,
                 path: torrent.path, // Base download path
                 files: files, // <-- ADDED File List
                 hasError: state.hasError || false,
                 errorMessage: state.errorMessage || null
             };
        }
        // (throttleEmitUpdate, updateTorrentErrorState - include as before)
         function throttleEmitUpdate(infoHash) { /* ... */ }
         function updateTorrentErrorState(infoHash, error) { /* ... */ }


        // --- WebTorrent Event Listeners (Include persistence calls) ---
        client.on('error', (err) => { console.error('[ERROR] WT Client:', err); });
        client.on('torrent', (torrent) => {
             console.log(`[EVENT torrent] Detected: ${torrent.infoHash}`);
             if (!torrentState[torrent.infoHash]) { /* init state */ }
             io.emit('torrentUpdate', getTorrentInfo(torrent));

             torrent.on('metadata', () => {
                  console.log(`[EVENT metadata] ${torrent.infoHash} - ${torrent.name}`);
                  io.emit('torrentUpdate', getTorrentInfo(torrent));
                  if (torrent.magnetURI) { saveMagnetToFile(torrent.magnetURI); } // Persistence
             });
            // Add individual file progress updates (optional, can be chatty)
             torrent.on('download', (bytes) => {
                 throttleEmitUpdate(torrent.infoHash);
                 // If you need per-file progress updates constantly:
                 // const torrentData = getTorrentInfo(torrent);
                 // io.emit('torrentUpdate', torrentData); // Sends full data incl. file progress
             });
             // (Other listeners: upload, done, error, warning - include persistence call in error maybe?)
             torrent.on('upload', (bytes) => throttleEmitUpdate(torrent.infoHash));
             torrent.on('done', () => { /* ... mark done, update state ... */ io.emit('torrentUpdate', getTorrentInfo(torrent)); io.emit('torrentDone', { /*...*/});});
             torrent.on('error', (err) => { /* ... update error state ... */ io.emit('torrentUpdate', getTorrentInfo(torrent)); io.emit('torrentError', { /*...*/});});
             torrent.on('warning', (err) => { console.warn(`[WARN ${torrent.infoHash}]`, err); });
        });

        // --- API Routes ---

        // GET /api/torrents - List current torrents
        app.get('/api/torrents', (req, res) => { /* ... as before ... */ });

        // POST /api/torrents/add - Add torrent
        app.post('/api/torrents/add', (req, res) => { /* ... include saveMagnetToFile() call ... */});

        // DELETE /api/torrents/:infoHash - Remove torrent
        app.delete('/api/torrents/:infoHash', (req, res) => { /* ... include removeMagnetFromFile() call ... */});


        // --- NEW: Streaming/Download Routes ---

        // Find torrent and file helper
        function findTorrentAndFile(req, res, callback) {
            const { infoHash, fileIndex } = req.params;
            const torrent = client.get(infoHash);

            if (!torrent) {
                return res.status(404).send('Torrent not found');
            }
             if (!torrent.ready) {
                 return res.status(409).send('Torrent metadata not ready yet, cannot access files.');
             }

            const index = parseInt(fileIndex, 10);
            if (isNaN(index) || index < 0 || index >= torrent.files.length) {
                return res.status(404).send('File index out of bounds');
            }
            const file = torrent.files[index];
            callback(torrent, file);
        }

        // GET /api/torrents/:infoHash/stream/:fileIndex - Stream file content
        app.get('/api/torrents/:infoHash/stream/:fileIndex', (req, res) => {
            findTorrentAndFile(req, res, (torrent, file) => {
                const fileSize = file.length;
                const range = req.headers.range;
                const mimeType = mime.getType(file.name) || 'application/octet-stream';

                console.log(`[STREAM] Request for ${file.name} (Size: ${fileSize}) Range: ${range || 'None'}`);
                res.setHeader('Content-Type', mimeType);
                res.setHeader('Accept-Ranges', 'bytes'); // Signal support for range requests

                if (range) {
                    try {
                        const parts = range.replace(/bytes=/, "").split("-");
                        const start = parseInt(parts[0], 10);
                        // End might be omitted (meaning stream to end), or specified.
                        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

                        if (start >= fileSize || end >= fileSize || start > end) {
                            console.error(`[STREAM] Invalid Range: start=${start}, end=${end}, size=${fileSize}`);
                            res.setHeader('Content-Range', `bytes */${fileSize}`); // Indicate invalid range
                            return res.status(416).send('Range Not Satisfiable'); // 416 Range Not Satisfiable
                        }

                        const chunksize = (end - start) + 1;
                        res.writeHead(206, { // 206 Partial Content
                            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                            'Content-Length': chunksize,
                            'Connection': 'keep-alive' // Important for streaming
                        });

                         console.log(`[STREAM] Serving Range: bytes ${start}-${end}/${fileSize}`);
                         const streamOptions = { start, end };
                         const fileStream = file.createReadStream(streamOptions);
                         fileStream.pipe(res);

                         fileStream.on('error', (streamErr) => {
                             console.error('[STREAM] Error reading file stream:', streamErr);
                              // Check if headers already sent before trying to send error
                              if (!res.headersSent) {
                                  res.status(500).send('Error reading file stream');
                              } else {
                                   // If headers sent, we can only try to end the response abruptly.
                                   res.end();
                              }
                         });

                    } catch(rangeError) {
                        console.error("[STREAM] Error processing range header:", rangeError);
                         return res.status(400).send("Malformed Range header");
                    }

                } else {
                     // No Range header - serve the whole file
                     console.log(`[STREAM] Serving Full File`);
                     res.setHeader('Content-Length', fileSize);
                     const fileStream = file.createReadStream();
                     fileStream.pipe(res);

                     fileStream.on('error', (streamErr) => {
                        console.error('[STREAM] Error reading full file stream:', streamErr);
                        if (!res.headersSent) {
                            res.status(500).send('Error reading file stream');
                        } else {
                            res.end();
                        }
                    });
                }
            });
        });

        // GET /api/torrents/:infoHash/download/:fileIndex - Force download
        app.get('/api/torrents/:infoHash/download/:fileIndex', (req, res) => {
             findTorrentAndFile(req, res, (torrent, file) => {
                const mimeType = mime.getType(file.name) || 'application/octet-stream';
                console.log(`[DOWNLOAD] Request for ${file.name}`);

                 // Set headers to trigger download dialog
                res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`); // Handles unicode filenames
                res.setHeader('Content-Type', mimeType);
                res.setHeader('Content-Length', file.length);

                 const fileStream = file.createReadStream();
                 fileStream.pipe(res);

                  fileStream.on('error', (streamErr) => {
                     console.error('[DOWNLOAD] Error reading download stream:', streamErr);
                      if (!res.headersSent) {
                            res.status(500).send('Error preparing file for download');
                      } else {
                            res.end();
                      }
                 });
             });
        });


        // --- WebSocket Event Handling ---
        io.on('connection', (socket) => { /* ... include sending initialState with file info ... */});

        // --- Server Initialization & Load Saved Torrents ---
        server.listen(PORT, () => { /* ... include loading from SAVED_TORRENTS_FILE logic ... */});

        // --- Define Actual Graceful Shutdown ---
        gracefulShutdown = (signal) => { /* ... as before ... */ };

    // --- Catch block for main async IIFE ---
    } catch (error) {
        console.error('[FATAL] Server Setup Error:', error);
        process.exit(1);
    }
})();

// --- Global Signal Handlers ---
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// (Make sure the persistence functions saveMagnetToFile, removeMagnetFromFile are included here from previous steps)
function saveMagnetToFile(magnetURI) {
    const trimmedMagnet = magnetURI.trim();
    if (!trimmedMagnet.startsWith('magnet:')) return;
    try {
        let lines = [];
        if (fs.existsSync(SAVED_TORRENTS_FILE)) {
            lines = fs.readFileSync(SAVED_TORRENTS_FILE, 'utf8').split('\n').filter(Boolean);
        }
        let alreadyExists = false;
        try {
            const parsedNew = parseTorrent(trimmedMagnet);
            for (const line of lines) {
                try {
                    const parsedOld = parseTorrent(line);
                    if (parsedOld.infoHash === parsedNew.infoHash) {
                        alreadyExists = true; break;
                    }
                } catch {}
            }
        } catch {}
        if (!alreadyExists) {
            fs.appendFileSync(SAVED_TORRENTS_FILE, trimmedMagnet + '\n', 'utf8');
            console.log(`[PERSIST] Saved: ${trimmedMagnet.substring(0, 60)}...`);
        } else {
            console.log(`[PERSIST] Skip save (exists): ${trimmedMagnet.substring(0, 60)}...`);
        }
    } catch (err) {
        console.error(`[PERSIST ERROR] Save failed ${SAVED_TORRENTS_FILE}:`, err);
    }
}

function removeMagnetFromFile(infoHashToRemove) {
    if (!infoHashToRemove) return;
    try {
        if (!fs.existsSync(SAVED_TORRENTS_FILE)) return;
        console.log(`[PERSIST] Removing ${infoHashToRemove} from file.`);
        const lines = fs.readFileSync(SAVED_TORRENTS_FILE, 'utf8').split('\n');
        let linesWritten = 0;
        const filteredLines = lines.filter(line => {
            const trimmedLine = line.trim();
            if (!trimmedLine) return false;
            try {
                const parsed = parseTorrent(trimmedLine);
                return parsed.infoHash !== infoHashToRemove;
            } catch (e) {
                console.warn(`[PERSIST WARN] Skipping line in remove check: ${trimmedLine.substring(0,50)}...`);
                return true;
            }
        });
        fs.writeFileSync(SAVED_TORRENTS_FILE, filteredLines.join('\n') + '\n', 'utf8');
        linesWritten = filteredLines.length;
        console.log(`[PERSIST] Updated persistence file. Lines remaining: ${linesWritten}.`);
    } catch (err) {
        console.error(`[PERSIST ERROR] Remove failed ${SAVED_TORRENTS_FILE}:`, err);
    }
}
// ... ensure other helper functions (throttleEmitUpdate, updateTorrentErrorState) are included ...
function throttleEmitUpdate(infoHash) {
            const now = Date.now();
            const state = torrentState[infoHash];
            if (!state) {
               torrentState[infoHash] = { lastEmitTime: 0 }; // Ensure state exists
            };

            if (now - (state.lastEmitTime || 0) > EMIT_THROTTLE_MS) {
                const torrent = client.get(infoHash);
                if (torrent) {
                    io.emit('torrentUpdate', getTorrentInfo(torrent));
                    torrentState[infoHash].lastEmitTime = now;
                }
            }
        }
function updateTorrentErrorState(infoHash, error) {
           if (!torrentState[infoHash]) { torrentState[infoHash] = {}; }
           torrentState[infoHash].hasError = !!error;
           torrentState[infoHash].errorMessage = error ? error.message : null;
       }
