# WebTorrent Client - Browser-Based Torrenting

A simple, clean, client-side web application for streaming and downloading torrents directly in your browser using WebTorrent. Features a minimal dark UI inspired by Cursor.io.

**Features:**

*   Magnet Link support
*   .torrent file upload support
*   Drag & Drop support for magnet links and .torrent files
*   Real-time streaming of video and audio files
*   Download progress, speed, and ETA display
*   File list with individual stream/download options
*   Minimal, dark, responsive UI (using Tailwind CSS)
*   No backend required - fully client-side
*   Ready for deployment on static hosting platforms (Vercel, Netlify, etc.)

**Technologies Used:**

*   HTML5
*   CSS3 (Tailwind CSS)
*   JavaScript (ES6+)
*   WebTorrent.js

## Setup and Development

**Prerequisites:**

*   Node.js and npm (or yarn) installed.

**Steps:**

1.  **Clone the repository:**
    ```bash
    git clone <your-repo-url>
    cd webtorrent-client
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```
    This installs WebTorrent and the development tools for Tailwind CSS.

3.  **Start the development server (for Tailwind CSS):**
    ```bash
    npm run dev
    ```
    This command will watch the `src/input.css` file and automatically rebuild `public/style.css` whenever you make changes.

4.  **Open `public/index.html` in your browser:**
    You can simply open the file directly, or use a simple static file server like `live-server` (install via `npm install -g live-server` and run `live-server public/`).

## Building for Production

To generate a minified CSS file for deployment:

```bash
npm run build