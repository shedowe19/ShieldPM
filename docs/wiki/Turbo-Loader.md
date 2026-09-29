# Turbo-Loader

The **Turbo-Loader** is a built-in feature of ShieldPM designed to dramatically accelerate the downloading of large files (like movies, server backups, or game files) over slow or high-latency internet connections by breaking the download into multiple parallel chunks.

## How it works

Normally, web browsers download files using a single TCP connection. If you have packet loss or high latency on the route from your server to your home, that single connection cannot max out your bandwidth.

The Turbo-Loader intercepts file downloads at the Nginx level and serves a specialized, lightweight HTML app instead. This app uses Javascript to request up to **8 parallel chunks** at the same time using HTTP `Range` requests, saturating your downstream bandwidth.

With a compatible browser and permission to choose a save location, it writes received chunks to disk. Other browsers may need to buffer the full file in memory before saving.

## When does it trigger?

The Turbo-Loader is automatically active for any Proxy Host where you flip the **Turbo-Loader** toggle in the UI.

When enabled, Nginx intercepts HTTP GET requests based purely on the **file extension**:

- Supported extensions: `.mp4`, `.mkv`, `.zip`, `.iso`, `.bin`, `.rar`, `.tar`, `.gz`, `.7z`
- It is case insensitive (e.g., `.ZIP` and `.iso` both work).
- There is **no server-side size limit** to trigger it.

### Invisible/Embedded Downloads (e.g., Synology DSM, Nextcloud)

Some web applications initiate downloads by creating a "hidden iframe" in the background (e.g., double-clicking a file in Synology File Station).
Since the Turbo-Loader requires a visible User Interface to show download progress and request saving permissions, it cannot operate inside a hidden iframe (the UI would be invisible to the user).

If the Turbo-Loader page is embedded in any iframe, it redirects that iframe to the ordinary download with `turbo=0`. Other automated clients should use `?turbo=0` explicitly if they need the original file response instead of the HTML download page.

## Direct-To-Disk vs RAM Fallback

For maximum performance and to prevent browser crashes on huge files, the Turbo-Loader utilizes the modern **File System Access API (FSFA)**. This allows the browser to dynamically write chunks directly to your physical hard drive as they arrive, using almost **0% RAM**.

### Browser Compatibility & Brave "Shields"

- **Direct-to-disk:** Available when the browser exposes `showSaveFilePicker` in the page's security context and permits the user to choose a file.
- **RAM fallback:** Used when that API is absent or blocked. Some Brave settings and browser permission policies can block the file picker.

If your browser blocks the Direct-To-Disk API, the Turbo-Loader falls back to **RAM Mode**. It buffers the entire file in memory before offering a save action.

> [!WARNING]
> **The 1.2 GB RAM Crash Limit**
> Assembling a large Blob may exhaust a browser tab's memory or fail during saving; the exact threshold depends on the browser and device.
>
> The Turbo-Loader enforces a **1.2 GiB limit** in RAM fallback mode and asks for confirmation above 512 MiB. For larger files without the direct-to-disk API, use its **Standard Download** button.

#### How to fix the "Direct-To-Disk Blocked" error in Brave:

1. Click the **Lion icon** in the top-right corner of Brave.
2. Select **"Shields Down"** or change Trackers/Ads blocking to **"Standard"**.
3. Reload the page. The browser will now prompt you for a "Save As" location immediately upon clicking Start to grant it Write permissions.

## Disabling Turbo-Loader for a specific request

If you want to manually bypass the Turbo-Loader and force a standard single-connection download via the browser, simply append `?turbo=0` to the file URL.

Example: `https://your-domain.com/downloads/movie.mkv?turbo=0`
