<div align="center">

  <!-- Optional: Replace with your own logo/banner image -->
  <!-- <img src="path/to/your/banner.png" alt="TorDirect Banner" width="800"/> -->
  
  <h1>⚡ TorDirect ⚡</h1>
  
  <p><strong>Direct WebTorrent Downloads & Streaming in Your Browser.</strong></p>
  <p><em>No installation, no logins - just pure peer-to-peer sharing.</em></p>

  <!-- Badges -->
  <p>
    <a href="https://devilgamer5802.github.io/TorDirect/">
      <img src="https://img.shields.io/badge/Website-Live-brightgreen?style=for-the-badge&logo=githubpages" alt="Website Status">
    </a>
    <img src="https://img.shields.io/github/repo-size/DevilGamer5802/TorDirect?style=for-the-badge&color=blueviolet" alt="Repo Size">
    <img src="https://img.shields.io/github/last-commit/DevilGamer5802/TorDirect?style=for-the-badge&color=yellow" alt="Last Commit">
    <a href="LICENSE">
    <img src="https://img.shields.io/badge/License-MIT-informational?style=for-the-badge" alt="License">
    </a> 
    <a href="https://github.com/DevilGamer5802/TorDirect/actions">
    <img src="https://img.shields.io/github/actions/workflow/status/DevilGamer5802/TorDirect/static.yml?style=for-the-badge" alt="Build Status">
    </a>
  </p>
  <a href="https://devilgamer5802.github.io/TorDirect/" target="_blank">
    <img src="https://img.shields.io/badge/►_TRY_IT_NOW-Click_Here-ff69b4?style=for-the-badge&logo=firefoxbrowser" alt="Try TorDirect Now">
  </a>
  
</div>

---

## ✨ Overview

TorDirect leverages the power of **WebTorrent** and **WebRTC** to bring torrent downloading and streaming directly to your web browser. Paste a magnet link or select a `.torrent` file, and start transferring data peer-to-peer without relying on intermediary servers for the actual file transfer.

Hosted entirely via GitHub Pages, it showcases a modern, serverless approach to file sharing.

<div align="center">
  
  <!-- *** Add a Screenshot or GIF Here! *** -->
  <!-- Replace the src with the path to your screenshot/gif in the repo -->
  <img src="TorDirect.gif" alt="TorDirect Screenshot" width="700" style="border-radius: 8px; margin-top: 20px; margin-bottom: 20px; border: 1px solid #555;"/>
  
</div>

## 🚀 Features

*   **🔗 Magnet Link Support:** Simply paste a magnet link to start.
*   **📁 `.torrent` File Support:** Upload torrent files directly from your device.
*   **⚡ Direct Download:** Download files directly to your local machine.
*   **🎬 Media Streaming:** Stream video and audio files *as they download*.
*   **🌐 Peer-to-Peer:** Files are transferred directly between users' browsers.
*   **🚫 No Server Needed:** File transfers don't go through a central server.
*   **🔒 No Login Required:** Use it instantly without accounts.
*   **📱 Responsive UI:** Clean interface that works on different screen sizes.
*   **☁️ GitHub Pages Hosting:** Demonstrates free, static site hosting capabilities.

## 💡 How It Works

This project relies on client-side technologies:

1.  **WebTorrent (`webtorrent.min.js`):** A JavaScript BitTorrent client that works in the browser, using WebRTC for true peer-to-peer transport. It connects to WebSocket trackers (`wss://`) and other WebRTC-capable peers.
2.  **WebRTC:** Enables direct browser-to-browser communication for data transfer, crucial for the peer-to-peer functionality.
3.  **HTML5/CSS3/JavaScript:** Standard web technologies used to build the user interface and application logic.
4.  **GitHub Pages:** Serves the static `index.html`, `style.css`, and `script.js` files to users. No backend server is involved in the torrenting process itself.

## 🔧 Usage

1.  **Visit the Website:** Go to [https://devilgamer5802.github.io/TorDirect/](https://devilgamer5802.github.io/TorDirect/)
2.  **Provide Input:**
    *   Paste a **magnet link** or **info hash** into the input field.
    *   OR, click "**Or Choose File**" to select a `.torrent` file from your device.
3.  **Start:** Click the "**Start Transfer**" button.
4.  **Monitor:** Watch the status, logs, peer count, and download progress.
5.  **Interact:**
    *   Click **Download** next to a file to save it once ready (or partially).
    *   Click **Stream** (for supported media types like MP4, MP3, WebM etc.) to play the file directly in the browser.

## 🛠️ Technology Stack

![HTML5](https://img.shields.io/badge/HTML5-%23E34F26.svg?style=for-the-badge&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-%231572B6.svg?style=for-the-badge&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-%23F7DF1E.svg?style=for-the-badge&logo=javascript&logoColor=black)
![WebTorrent](https://img.shields.io/badge/WebTorrent-%23764ABC.svg?style=for-the-badge&logo=webtorrent&logoColor=white) <!-- Adjust color/logo if needed -->
![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-%23121011.svg?style=for-the-badge&logo=github&logoColor=white)

---

## ⚠️ Disclaimer

**TorDirect is a tool.** Like any tool, it can be used for various purposes. Users are solely responsible for the content they choose to download and share using this application.

**Please respect copyright laws.** Downloading or distributing copyrighted material without proper authorization is illegal in most countries. Only use TorDirect for content you have the legal right to access and share (e.g., open-source software, public domain media, files you created).

The creators of this project do not endorse or encourage piracy or illegal file sharing.

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check [issues page](https://github.com/DevilGamer5802/TorDirect/issues) (if you plan to use it).

1.  Fork the Project
2.  Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the Branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request

## 📄 License

Distributed under the MIT License. See [`LICENSE`](LICENSE) file for more information. 


---

<div align="center">
  <p>Made with ❤️ and JavaScript</p>
</div>
