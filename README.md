# TorDirect: Your Personal Torrent Streaming & Download Hub 🚀☁️

**(Powered by Node.js, WebTorrent, Render & A Sprinkle of Magic ✨)**

[![Build Status](https://img.shields.io/badge/Build-Passing%20(Probably)-brightgreen)](https://youtu.be/dQw4w9WgXcQ) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT) [![Code Style: Galactic Standard](https://img.shields.io/badge/Code%20Style-Galactic%20Standard-blueviolet)](https://tvtropes.org/pmwiki/pmwiki.php/Main/AppliedPhlebotinum)

---

Fed up with bloated desktop clients? Annoyed by ad-infested web UIs? Crave *direct* control over your torrents from anywhere, beamed straight to your browser?

**Then prepare for TorDirect!** This nifty web application lets you harness the power of the BitTorrent network directly, deploying your very own private torrent command center on the [Render](https://render.com/) cloud platform.

Think of it as **uTorrent Web's cleaner, faster, ad-free cousin** that lives in *your* corner of the internet. Add magnets, see your files appear, and – here’s the really cool part – **stream video and audio files directly** in your browser as they download, or grab the whole file whenever you're ready!

---

## What's Inside the Awesome Box? 🎁 (Features)

*   🧲 **Magnet Maestro:** Effortlessly add torrents via magnet links.
*   📂 **File Explorer:** See a list of files within your torrents as soon as metadata arrives.
*   🎬 **Stream On Demand:** Directly stream common video and audio formats (`.mp4`, `.mkv`, `.mp3`, etc.) right in your browser - powered by HTTP Range Requests! No waiting for the full download.
*   🎶 **Listen Live:** Stream audio files while they download. Perfect for catching up on podcasts or... other audio. 😉
*   💾 **Direct Downloads:** Snag any file directly to your device with a simple download link.
*   📊 **Real-Time Radar:** Watch progress, download/upload speeds, and peer counts update live via WebSockets.
*   🚫 **Ad-Free & Bloat-Free Zone:** Just the pure, essential torrenting experience. Built for speed and simplicity.
*   ☁️ **Cloud-Powered:** Designed specifically for easy deployment on [Render](https://render.com/), leveraging their persistent disks.
*   ✨ **Clean UI:** Simple, intuitive interface using vanilla JavaScript (keeping it lean!).

---

## Under the Hood 🛠️ (Tech Stack)

*   **Backend:** Node.js with Express.js
*   **Torrent Engine:** The mighty [WebTorrent](https://webtorrent.io/) library (handles all the peer-to-peer magic)
*   **Real-time:** Socket.IO for instant updates
*   **Frontend:** Vanilla JavaScript, HTML, CSS (No heavy frameworks here!)
*   **Deployment:** Optimized for [Render](https://render.com/) (Web Service + Persistent Disk)
*   **Utilities:** `mime` (for Content-Types), `parse-torrent` (for magnet parsing)

---

## Blast Off Sequence 🚀 (Setup on Render)

Getting your own TorDirect instance running is pretty straightforward, but **PAY ATTENTION TO STEP 3 & 4 - THEY ARE CRITICAL!**

1.  **Fork/Clone:** Get this code into your own GitHub/GitLab repository.
2.  **Render Service:** Create a new **Web Service** on Render, connecting it to your repository. Select the **Node** environment.
3.  **🚨 PERSISTENT DISK (Paid Feature Required!) 🚨:**
    *   Go to your new Render service's "Disks" tab.
    *   Click "Add Disk".
    *   Give it a name (e.g., `torrent-storage`).
    *   Set the **Mount Path** to something memorable, like `/data/torrents`. **Remember this path!**
    *   Choose a suitable disk size (depends on your hoarding habits!).
    *   Create the disk!
4.  **🔥 ENVIRONMENT VARIABLE 🔥:**
    *   Go to the "Environment" tab for your service.
    *   Add an Environment Variable:
        *   **Key:** `DOWNLOAD_PATH`
        *   **Value:** `/data/torrents` (or **whatever Mount Path you set in Step 3 - they MUST match exactly!**)
5.  **Deploy:** Let Render build and deploy your service (or trigger a manual deploy). Monitor the logs for success! Look for lines confirming the `DOWNLOAD_PATH` is correct and write access is confirmed.
6.  **Access:** Grab the public `.onrender.com` URL Render provides for your service.

---

## Operating the Command Center 🎮 (Usage)

1.  Navigate to your unique `your-app-name.onrender.com` URL.
2.  Find a magnet link for the content you *totally* have the rights to download. 😉
3.  Paste the magnet link into the input field and hit "Add Magnet".
4.  Watch the torrent appear in the list!
5.  Once metadata loads, expand the "Files" section.
6.  Click "Stream" for supported video/audio files to watch/listen directly.
7.  Click "Download" to save any file locally.
8.  Click "Remove" when you're done (this also cleans up the persisted magnet link).

---

## ⚠️ Important Holo-Deck Warnings! ⚠️

*   **Persistent Disk REQUIRED:** This app *needs* the Render Persistent Disk feature (a paid add-on) to store downloaded files and the list of active torrents. The free tier's ephemeral storage **will not work** correctly for saving files or resuming across restarts.
*   **👮 LEGAL & ETHICAL USE:** You are SOLELY responsible for the content you download using this application. Downloading copyrighted material without permission is illegal in most places. Please use TorDirect responsibly and ethically. Don't be *that* person. 🙏
*   **🔓 SECURITY:** By default, this application has **NO AUTHENTICATION**. Anyone with the URL can add torrents. For personal use, you might be okay, but if you need security, you'll need to add authentication yourself (e.g., Basic Auth behind a Render custom domain, or integrating a proper auth library).
*   **Resource Usage:** Torrents can consume significant bandwidth and CPU. Keep an eye on your Render plan's limits.

---

## Future Missions & Contributing 🌠

This is a solid base, but there's always room for more awesome! Potential ideas:

*   User authentication / Access control
*   Torrent prioritization / Bandwidth controls
*   More detailed file progress
*   Better error reporting in the UI
*   Ability to select *which* files to download within a torrent
*   Prettier UI / Themes

Feel free to fork, improve, and submit Pull Requests!

---

## License

MIT License - Go wild (but responsibly)!

---

**Happy (Direct) Torrenting!**
