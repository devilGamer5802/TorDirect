/**
 * server.js
 * Backend for the Render Torrent Web App
 * - Uses dynamic import() for ESM modules (webtorrent v2+).
 * - Implements basic file-based persistence for magnet links.
 * - Includes graceful shutdown.
 */

// --- CJS Requires (Synchronous Modules) ---
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path'); // 'path' module is loaded here
const fs = require('fs');
const cors = require('cors');
const parseTorrent = require('parse-torrent'); // Use correct 'parse-torrent' package

// --- Placeholder for Graceful Shutdown function ---
// Will be reassigned inside the async IIFE once the server components are initialized.
let gracefulShutdown = (signal) => {
    console.warn(`[SYSTEM] Shutdown called (${signal}) before app fully initialized or function was assigned.`);
    process.exit(1); // Exit immediately if called before setup is complete
};

// --- Main Async IIFE (Immediately Invoked Function Expression) ---
// This wraps the main application logic to allow top-level await for ESM import.
(async () => {
    try {
        // --- Dynamic ESM Import ---
        console.log('[SETUP] Loading WebTorrent (ESM) module...');
        const { default: WebTorrent } = await import('webtorrent');
        // Note: Assumes the main export is 'default'. Check if specific version requires different import.
        console.log('[SETUP] WebTorrent module loaded successfully.');

        // --- Configuration (Defined INSIDE async scope) ---
        const PORT = process.env.PORT || 3000;
        const DOWNLOAD_PATH = process.env.DOWNLOAD_PATH || path.join(__dirname, 'downloads'); // Uses 'path' required earlier

        // --- Persistence File Path (Defined INSIDE async scope, AFTER DOWNLOAD_PATH) ---
        // This file will store magnet links for resuming across restarts.
        const SAVED_TORRENTS_FILE = path.join(DOWNLOAD_PATH, '.saved_torrents.txt');

        console.log(`[INFO] Server starting application setup...`);
        console.log(`[CONFIG] PORT set to: ${PORT}`);
        console.log(`[CONFIG] DOWNLOAD_PATH set to: ${DOWNLOAD_PATH}`);
        console.log(`[CONFIG] Persistence file set to: ${SAVED_TORRENTS_FILE}`);

        // --- Ensure Download Directory Exists ---
        try {
            if (!fs.existsSync(DOWNLOAD_PATH)) {
                console.log(`[SETUP] Download directory not found. Creating: ${DOWNLOAD_PATH}`);
                fs.mkdirSync(DOWNLOAD_PATH, { recursive: true });
                console.log(`[SETUP] Download directory created successfully.`);
            } else {
                console.log(`[SETUP] Download directory already exists: ${DOWNLOAD_PATH}`);
            }
        } catch (err) {
            console.error(`[FATAL] Could not create or access download directory: ${DOWNLOAD_PATH}`, err);
            throw err; // Throw error to be caught by the main catch block
        }

        // --- Express App, HTTP Server, Socket.IO Setup ---
        const app = express();
        const server = http.createServer(app);
        const io = socketIo(server, {
            cors: {
                origin: "*", // Adjust for production if needed
                methods: ["GET", "POST"]
            }
        });

        // --- Express Middleware ---
        app.use(cors()); // Enable Cross-Origin Resource Sharing
        app.use(express.json()); // Parse JSON request bodies
        app.use(express.static(path.join(__dirname, 'public'))); // Serve static frontend files

        // --- WebTorrent Client Setup ---
        console.log('[SETUP] Initializing WebTorrent client...');
        const client = new WebTorrent();
        console.log('[SETUP] WebTorrent client initialized.');
        const torrentState = {}; // Minimal in-memory state (for throttling, temporary flags)

        // --- Persistence Helper Functions ---

        // Saves a magnet link to the persistence file
        function saveMagnetToFile(magnetURI) {
            const trimmedMagnet = magnetURI.trim();
            if (!trimmedMagnet.startsWith('magnet:')) return; // Basic validation

            try {
                 // Read existing lines to prevent duplicates
                 let lines = [];
                 if (fs.existsSync(SAVED_TORRENTS_FILE)) {
                      lines = fs.readFileSync(SAVED_TORRENTS_FILE, 'utf8').split('\n').filter(Boolean); // Read and remove empty lines
                 }

                 // Check if this magnet URI (or infoHash) already exists
                 let alreadyExists = false;
                 try {
                      const parsedNew = parseTorrent(trimmedMagnet);
                      for (const line of lines) {
                          try {
                              const parsedOld = parseTorrent(line);
                              if (parsedOld.infoHash === parsedNew.infoHash) {
                                   alreadyExists = true;
                                   break;
                              }
                          } catch { /* ignore parse errors in existing file for this check */ }
                      }
                 } catch { /* ignore parse error for the new magnet here */ }


                 if (!alreadyExists) {
                     // Append the new magnet URI only if it's not found
                     fs.appendFileSync(SAVED_TORRENTS_FILE, trimmedMagnet + '\n', 'utf8');
                     console.log(`[PERSIST] Saved new magnet to file: ${trimmedMagnet.substring(0, 60)}...`);
                 } else {
                      console.log(`[PERSIST] Magnet already in file, skipping save: ${trimmedMagnet.substring(0, 60)}...`);
                 }

            } catch (err) {
                console.error(`[PERSIST ERROR] Could not save magnet to ${SAVED_TORRENTS_FILE}:`, err);
            }
        }

        // Removes all references to a given infoHash from the persistence file
        function removeMagnetFromFile(infoHashToRemove) {
            if (!infoHashToRemove) return;

            try {
                if (!fs.existsSync(SAVED_TORRENTS_FILE)) {
                    console.log(`[PERSIST] Remove requested, but file not found: ${SAVED_TORRENTS_FILE}`);
                    return; // File doesn't exist, nothing to remove
                }

                console.log(`[PERSIST] Attempting to remove torrent ${infoHashToRemove} references from file.`);
                const lines = fs.readFileSync(SAVED_TORRENTS_FILE, 'utf8').split('\n');
                let linesWritten = 0;

                // Filter out lines matching the infoHash
                const filteredLines = lines.filter(line => {
                    const trimmedLine = line.trim();
                    if (!trimmedLine) return false; // Skip empty lines
                    try {
                        const parsed = parseTorrent(trimmedLine);
                        // Keep line ONLY if infoHash DOES NOT match the one to remove
                        return parsed.infoHash !== infoHashToRemove;
                    } catch (e) {
                        // Handle potential errors parsing lines in the file
                        console.warn(`[PERSIST WARN] Skipping potentially unparseable line during removal check: ${trimmedLine.substring(0,50)}...`);
                        return true; // Keep lines that can't be parsed, just in case? Or remove? Decide policy. Keeping is safer.
                    }
                });

                // Write the filtered lines back to the file
                fs.writeFileSync(SAVED_TORRENTS_FILE, filteredLines.join('\n') + '\n', 'utf8'); // Ensure trailing newline
                linesWritten = filteredLines.length;

                console.log(`[PERSIST] Finished updating persistence file. Removed references to ${infoHashToRemove}. Lines remaining: ${linesWritten}.`);

            } catch (err) {
                console.error(`[PERSIST ERROR] Could not update ${SAVED_TORRENTS_FILE} after removal attempt for ${infoHashToRemove}:`, err);
            }
        }

        // --- State Management & Helper Functions (Frontend Data Formatting) ---
        function getTorrentInfo(torrent) {
             if (!torrent) return null;
             const state = torrentState[torrent.infoHash] || {}; // Get potential error state
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
                 hasError: state.hasError || false,
                 errorMessage: state.errorMessage || null
             };
        }

        // --- Throttle Function for WebSocket updates ---
        const EMIT_THROTTLE_MS = 1000;
        function throttleEmitUpdate(infoHash) {
             const now = Date.now();
             const state = torrentState[infoHash];
             if (!state) {
                torrentState[infoHash] = { lastEmitTime: 0 }; // Ensure state exists
             };

             if (now - torrentState[infoHash].lastEmitTime > EMIT_THROTTLE_MS) {
                 const torrent = client.get(infoHash);
                 if (torrent) {
                     io.emit('torrentUpdate', getTorrentInfo(torrent));
                     torrentState[infoHash].lastEmitTime = now;
                 }
             }
        }

        // Helper to manage error state in torrentState map
        function updateTorrentErrorState(infoHash, error) {
            if (!torrentState[infoHash]) { torrentState[infoHash] = {}; }
            torrentState[infoHash].hasError = !!error;
            torrentState[infoHash].errorMessage = error ? error.message : null;
        }

        // --- WebTorrent Global Event Listeners ---
        client.on('error', (err) => {
            console.error('[ERROR] WebTorrent Client Global Error:', err);
            // Consider broadcasting a generic error to UI if needed
            // io.emit('clientError', { message: err.message });
        });

        client.on('torrent', (torrent) => {
            console.log(`[EVENT torrent] Detected: ${torrent.infoHash} - Name: ${torrent.name || '(pending)'}`);
            // Initialize minimal state for throttling etc. if not already present
            if (!torrentState[torrent.infoHash]) {
                torrentState[torrent.infoHash] = { lastEmitTime: 0, hasError: false, errorMessage: null };
            }
            // Send initial update for this torrent
            io.emit('torrentUpdate', getTorrentInfo(torrent));

            // --- Torrent Specific Event Listeners ---
            torrent.on('metadata', () => {
                console.log(`[EVENT metadata] ${torrent.infoHash} - Name: ${torrent.name}`);
                io.emit('torrentUpdate', getTorrentInfo(torrent)); // Update UI with name
                // Attempt to save magnet link now that we have metadata (best source for full magnet)
                if (torrent.magnetURI) {
                    saveMagnetToFile(torrent.magnetURI); // Call persistence function
                } else {
                    console.warn(`[PERSIST WARN] magnetURI not available on metadata event for ${torrent.infoHash}. Persistence might be incomplete if not added via API.`);
                    // If added via API, the original input magnet should be saved then. Need robust logic.
                    // For now, relying on metadata event's magnetURI.
                }
            });

            torrent.on('download', (bytes) => {
                throttleEmitUpdate(torrent.infoHash);
            });

            torrent.on('upload', (bytes) => {
                 throttleEmitUpdate(torrent.infoHash);
            });

            torrent.on('done', () => {
                console.log(`[EVENT done] ${torrent.infoHash} - Name: ${torrent.name}`);
                updateTorrentErrorState(torrent.infoHash, null); // Clear error state on success
                const finalState = getTorrentInfo(torrent);
                io.emit('torrentUpdate', finalState); // Send final 'done' state update
                io.emit('torrentDone', { infoHash: torrent.infoHash, name: torrent.name });
            });

            torrent.on('error', (err) => {
                console.error(`[EVENT error] ${torrent.infoHash} - Name: ${torrent.name || '(pending)'}:`, err.message || err);
                updateTorrentErrorState(torrent.infoHash, err); // Set error state
                io.emit('torrentUpdate', getTorrentInfo(torrent)); // Update UI with error status
                io.emit('torrentError', {
                    infoHash: torrent.infoHash,
                    name: torrent.name || '(pending)',
                    error: err.message || 'Unknown torrent error'
                });
            });

            torrent.on('warning', (err) => {
                console.warn(`[EVENT warning] ${torrent.infoHash} - Name: ${torrent.name || '(pending)'}:`, err.message || err);
                 // Optionally emit warnings too if UI handles them
            });
        });


        // --- API Routes ---

        // GET /api/torrents - List current torrents known by the client
        app.get('/api/torrents', (req, res) => {
            const currentTorrents = client.torrents.map(getTorrentInfo);
            res.json(currentTorrents);
        });

        // POST /api/torrents/add - Add a new torrent via Magnet URI
        app.post('/api/torrents/add', (req, res) => {
            const { magnetURI } = req.body;
            const trimmedMagnet = magnetURI ? magnetURI.trim() : null;

            if (!trimmedMagnet || !trimmedMagnet.startsWith('magnet:')) {
                return res.status(400).json({ error: 'Valid Magnet URI starting with "magnet:" is required.' });
            }

            console.log(`[API ADD] Received request: ${trimmedMagnet.substring(0, 60)}...`);

            let parsed;
            try {
                parsed = parseTorrent(trimmedMagnet);
                if (!parsed || !parsed.infoHash) { throw new Error("Could not parse infoHash from Magnet URI."); }
                console.log(`[API ADD] Parsed. Info Hash: ${parsed.infoHash}`);
            } catch (err) {
                console.error("[API ADD] Error parsing magnet URI:", err.message);
                return res.status(400).json({ error: 'Invalid Magnet URI format.' });
            }

            // Check if torrent already exists in the client
            if (client.get(parsed.infoHash)) {
                console.log(`[API ADD] Torrent already exists: ${parsed.infoHash}`);
                // Still save the magnet URI here? Ensures persistence even if added when client thinks it exists.
                 saveMagnetToFile(trimmedMagnet);
                return res.status(409).json({ message: 'Torrent is already active in the client.', infoHash: parsed.infoHash });
            }

            // Save magnet BEFORE adding to client to ensure it's persisted even if add fails later
             saveMagnetToFile(trimmedMagnet);

            const options = { path: DOWNLOAD_PATH };
            console.log(`[API ADD] Adding torrent ${parsed.infoHash} to client with options:`, options);
            client.add(trimmedMagnet, options, (torrent) => {
                 // This callback is asynchronous, usually fires after 'metadata'
                 console.log(`[API ADD] Callback: Client add process ongoing for ${torrent.infoHash}`);
            });

            // Respond immediately with 202 Accepted. Frontend relies on WebSocket updates.
            res.status(202).json({ message: 'Torrent addition initiated.', infoHash: parsed.infoHash });
        });

        // DELETE /api/torrents/:infoHash - Remove a torrent
        app.delete('/api/torrents/:infoHash', (req, res) => {
            const { infoHash } = req.params;
            console.log(`[API DELETE] Received request for: ${infoHash}`);

            const torrent = client.get(infoHash);
            if (!torrent) {
                console.log(`[API DELETE] Torrent not found in client: ${infoHash}. Attempting removal from persistence file anyway.`);
                // Remove from file even if not in client (handles cleanup if client crashed before remove)
                removeMagnetFromFile(infoHash);
                return res.status(404).json({ error: 'Torrent not found in active client state.' });
            }

            client.remove(infoHash, { destroyStore: true }, (err) => {
                if (err) {
                    console.error(`[API DELETE] Error removing torrent ${infoHash} from WebTorrent client:`, err);
                    // Don't remove from file if client removal fails? Or try anyway? Trying anyway seems better for cleanup.
                    removeMagnetFromFile(infoHash);
                    return res.status(500).json({ error: 'Failed to remove torrent from client. Check server logs.' });
                }

                console.log(`[API DELETE] Torrent ${infoHash} removed successfully from client.`);
                delete torrentState[infoHash]; // Remove from minimal in-memory state
                removeMagnetFromFile(infoHash); // Remove from persistence file
                io.emit('torrentRemove', { infoHash }); // Notify frontend clients

                // --- Optional File Deletion ---
                // WARNING: Uncommenting WILL delete files! Be cautious!
                /*
                const fullPathToDelete = torrent.path; // Use path stored on torrent object
                console.warn(`[API DELETE] Attempting to delete files at: ${fullPathToDelete}`);
                fs.rm(fullPathToDelete, { recursive: true, force: true }, (rmErr) => {
                    if (rmErr) { console.error(`[API DELETE] Error deleting files for ${infoHash} at ${fullPathToDelete}:`, rmErr); }
                    else { console.log(`[API DELETE] Successfully deleted files for ${infoHash}`); }
                });
                */

                res.status(200).json({ message: 'Torrent removed successfully.' });
            });
        });


        // --- WebSocket Event Handling ---
        io.on('connection', (socket) => {
            console.log(`[WS] Client connected: ${socket.id}`);

            // Send the current state of ALL torrents from the client upon connection
            try {
                const currentTorrents = client.torrents.map(getTorrentInfo);
                console.log('[WS] Generating initialState:', JSON.stringify(currentTorrents.map(t => ({ hash: t.infoHash, name: t.name, done: t.done })), null, 2));
                socket.emit('initialState', currentTorrents);
                console.log(`[WS] Sent initial state (${currentTorrents.length} torrents) to ${socket.id}`);
            } catch (error) {
                 console.error("[WS ERROR] Failed to generate or send initial state:", error);
            }


            socket.on('disconnect', (reason) => {
                console.log(`[WS] Client disconnected: ${socket.id}, Reason: ${reason}`);
            });
        });


        // --- Server Initialization ---
        server.listen(PORT, () => {
            console.log(`[INFO] Express server listening on http://localhost:${PORT}`);

            // --- Load and Re-add Saved Torrents from Persistence File ---
            try {
                if (fs.existsSync(SAVED_TORRENTS_FILE)) {
                    console.log(`[PERSIST LOAD] Found saved torrents file: ${SAVED_TORRENTS_FILE}. Loading...`);
                    const savedMagnets = fs.readFileSync(SAVED_TORRENTS_FILE, 'utf8').split('\n');
                    let count = 0;
                    savedMagnets.forEach(magnet => {
                        const trimmedMagnet = magnet.trim();
                        if (trimmedMagnet && trimmedMagnet.startsWith('magnet:')) {
                             console.log(`[PERSIST LOAD] Attempting re-add: ${trimmedMagnet.substring(0,60)}...`);
                             try {
                                 const parsed = parseTorrent(trimmedMagnet);
                                 if (!client.get(parsed.infoHash)) {
                                     const options = { path: DOWNLOAD_PATH };
                                     client.add(trimmedMagnet, options, torrent => {
                                          // 'torrent' event listener handles UI updates etc.
                                          console.log(`[PERSIST LOAD] Successfully re-added ${torrent.infoHash} via client.add`);
                                     });
                                     count++;
                                 } else {
                                      console.log(`[PERSIST LOAD] Torrent ${parsed.infoHash} already loaded/active in client, skipping re-add.`);
                                       // Optionally emit an update for torrents found this way?
                                        const existingTorrent = client.get(parsed.infoHash);
                                        if(existingTorrent) {
                                           io.emit('torrentUpdate', getTorrentInfo(existingTorrent));
                                        }
                                 }
                             } catch(parseErr) {
                                 console.error(`[PERSIST LOAD ERROR] Failed to parse saved magnet: ${trimmedMagnet.substring(0,50)}...`, parseErr);
                                 // Optionally try to remove the invalid line? removeMagnetFromFile requires infoHash... tricky.
                             }
                        }
                    });
                    console.log(`[PERSIST LOAD] Finished processing file. Attempted to re-add ${count} distinct torrents.`);
                } else {
                    console.log('[PERSIST LOAD] No saved torrents file found. Starting fresh.');
                }
            } catch (err) {
                console.error('[PERSIST LOAD ERROR] Could not load or process saved torrents file:', err);
            }

             console.log("[SETUP] Initialization complete. Server ready."); // Log when fully ready
        });


        // --- Define the Actual Graceful Shutdown Logic ---
        // This function now has access to io, client, server from the IIFE scope.
        // It overwrites the placeholder defined outside the IIFE.
        gracefulShutdown = (signal) => {
            console.log(`[SYSTEM] Received ${signal}. Shutting down gracefully...`);
            // 1. Close WebSocket connections
            io.close(() => {
                console.log('[SYSTEM] Socket.IO connections closed.');
                // 2. Destroy WebTorrent client (closes peer connections etc.)
                if (client && typeof client.destroy === 'function') {
                    client.destroy((err) => {
                        if (err) console.error('[SYSTEM] Error destroying WebTorrent client:', err);
                        else console.log('[SYSTEM] WebTorrent client destroyed.');
                        // 3. Close HTTP server
                        server.close(() => {
                            console.log('[SYSTEM] HTTP server closed.');
                            process.exit(0); // Successful exit
                        });
                    });
                } else {
                    // Fallback if client doesn't exist or isn't initialized
                    console.warn('[SYSTEM] WebTorrent client not found or not initialized, closing server directly.');
                    server.close(() => {
                        console.log('[SYSTEM] HTTP server closed.');
                        process.exit(0);
                    });
                }
            });

            // Force exit after a timeout if shutdown hangs
            setTimeout(() => {
                console.error('[SYSTEM] Graceful shutdown timed out after 10 seconds. Forcing exit.');
                process.exit(1);
            }, 10000); // 10 seconds
        };

    // --- Catch block for the main async IIFE ---
    } catch (error) {
        console.error('[FATAL] Failed during server setup or main async execution:', error);
        process.exit(1); // Exit with error code if setup fails
    }
})(); // Immediately execute the async function

// --- Global Signal Handlers (Outside IIFE) ---
// These will call the `gracefulShutdown` function (either placeholder or the real one once assigned)
process.on('SIGINT', () => gracefulShutdown('SIGINT')); // Handle Ctrl+C
process.on('SIGTERM', () => gracefulShutdown('SIGTERM')); // Handle termination signals (from Render/Docker/etc.)

console.log('[INFO] Script execution finished (async operations may still be running).');
