# Disable Buffering

The **Disable Buffering** feature allows you to selectively disable Nginx's proxy buffering for specific Proxy Hosts. This is useful for streaming applications or large file transfers where buffering causes high disk I/O, latency, or timeouts.

---

## 🏗️ How it Works

```
  Buffered (Default):
  ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
  │  Backend  │────▶│  Nginx   │────▶│  Disk    │────▶│  Client   │
  └──────────┘     │  Buffer  │     │  Cache   │     └──────────┘
                   └──────────┘     └──────────┘
                   (Stores response in temp file first)

  Unbuffered:
  ┌──────────┐     ┌──────────┐     ┌──────────┐
  │  Backend  │────▶│  Nginx   │────▶│  Client   │
  └──────────┘     │ (pass-   │     └──────────┘
                   │  through)│
                   └──────────┘
                   (Direct stream, no temp files)
```

### When to Enable

| Application | Buffering | Why |
| :--- | :--- | :--- |
| Static websites | ✅ On (default) | Nginx handles slow clients efficiently |
| APIs | ✅ On (default) | Small responses benefit from buffering |
| **Jellyfin / Plex** | ❌ **Off** | Large media streams cause disk I/O |
| **Emby / Tautulli** | ❌ **Off** | Video streaming needs direct passthrough |
| **WebSocket apps** | ❌ **Off** | Real-time data needs low latency |
| **Large file downloads** | ❌ **Off** | Prevents temp file bloat |

## Use Cases

### Streaming Services

Applications like **Jellyfin**, **Plex**, **Emby**, or **Tautulli** often stream large media files. If Nginx tries to buffer these streams:

1. **Disk I/O**: It writes the stream to a temporary file on disk (`/var/lib/nginx/body` or similar).
2. **Latency**: It may wait for a buffer to fill before sending data.
3. **Warnings**: You might see warnings in your logs like:
    > *an upstream response is buffered to a temporary file /var/cache/nginx/...*

Enabling "Disable Buffering" resolves these issues by allowing the stream to pass through directly.

### Real-time Applications

Applications that require low-latency, real-time data flow (e.g., certain WebSocket implementations or live dashboards) may also benefit from disabled buffering.

## Configuration

To enable this feature:

1. Navigate to your **Dashboard**.
2. Go to **Proxy Hosts**.
3. **Edit** the desired host (or create a new one).
4. In the **Details** tab, locate the **Options** section.
5. Toggle the **Disable Buffering** switch.
6. Click **Save**.

> [!NOTE]
> Disabling buffering removes the ability for Nginx to handle slow clients efficiently. For standard web pages or static assets, keeping buffering **enabled** (default) is generally recommended for better performance.
