# Turbo-Loader

The **Turbo-Loader** is a built-in feature of ShieldPM designed to dramatically accelerate the downloading of large files (like movies, server backups, or game files) over slow or high-latency internet connections by breaking the download into multiple parallel chunks.

## How it works
Normally, web browsers download files using a single TCP connection. If you have packet loss or high latency on the route from your server to your home, that single connection cannot max out your bandwidth.

The Turbo-Loader intercepts file downloads at the Nginx level and serves a specialized, lightweight HTML app instead. This app uses Javascript to request up to **8 parallel chunks** at the same time using HTTP `Range` requests, saturating your downstream bandwidth.

Once all chunks are retrieved, it saves the file directly to your disk with nearly zero RAM overhead.

## When does it trigger?
The Turbo-Loader is automatically active for any Proxy Host where you flip the **Turbo-Loader** toggle in the UI.

When enabled, Nginx intercepts HTTP GET requests based purely on the **file extension**:
* Supported extensions: `.mp4`, `.mkv`, `.zip`, `.iso`, `.bin`, `.rar`, `.tar`, `.gz`, `.7z`
* It is case insensitive (e.g., `.ZIP` and `.iso` both work).
* There is **no server-side size limit** to trigger it.

### Invisible/Embedded Downloads (e.g., Synology DSM, Nextcloud)
Some web applications initiate downloads by creating a "hidden iframe" in the background (e.g., double-clicking a file in Synology File Station).
Since the Turbo-Loader requires a visible User Interface to show download progress and request saving permissions, it cannot operate inside a hidden iframe (the UI would be invisible to the user).

If the Turbo-Loader detects it is embedded in a hidden iframe or triggered via an automated API, it will automatically bypass itself and revert to a standard, single-thread Nginx download.

## Direct-To-Disk vs RAM Fallback
For maximum performance and to prevent browser crashes on huge files, the Turbo-Loader utilizes the modern **File System Access API (FSFA)**. This allows the browser to dynamically write chunks directly to your physical hard drive as they arrive, using almost **0% RAM**.

### Browser Compatibility & Brave "Shields"
* **Supported:** Google Chrome, Microsoft Edge, Opera, and Chromium-based browsers.
* **Blocked:** Firefox (API not supported yet) and **Brave Browser (if Shields are set to Aggressive)**.

If your browser blocks the Direct-To-Disk API (e.g., due to Brave's Aggressive Shields), the Turbo-Loader falls back to **RAM Mode**. It will buffer the entire file in your system memory and assemble it at the very end.

> [!WARNING]
> **The 1.2 GB RAM Crash Limit**
> Chromium browsers have an internal memory limit for Blobs (files assembled in RAM). If you attempt to save a file larger than ~1.5 GB from RAM, the browser's download manager will silently crash and display a vague **"Network Error"** (Netzwerkfehler).
>
> To prevent this, the Turbo-Loader enforces a **strict 1.2 GB limit** when running in RAM Fallback mode. If your file is larger and the Direct-To-Disk API is blocked, the download will not start. Instead, you will be presented with a large **Standard Download** fallback button.

#### How to fix the "Direct-To-Disk Blocked" error in Brave:
1. Click the **Lion icon** in the top-right corner of Brave.
2. Select **"Shields Down"** or change Trackers/Ads blocking to **"Standard"**.
3. Reload the page. The browser will now prompt you for a "Save As" location immediately upon clicking Start to grant it Write permissions.

## Disabling Turbo-Loader for a specific request
If you want to manually bypass the Turbo-Loader and force a standard single-connection download via the browser, simply append `?turbo=0` to the file URL.

Example: `https://your-domain.com/downloads/movie.mkv?turbo=0`
