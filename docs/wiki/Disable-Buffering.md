# Disable Buffering

The **Disable Buffering** option disables both Nginx response buffering (`proxy_buffering`) and request buffering (`proxy_request_buffering`) for a Proxy Host. This can help streaming responses or large uploads avoid proxy buffering and temporary files.

---

## 🏗️ How it Works

```
  Buffered response (Default):
  ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
  │  Backend  │────▶│  Nginx   │────▶│  Buffer  │────▶│  Client   │
  └──────────┘     │  Buffer  │     │  Cache   │     └──────────┘
                   └──────────┘     └──────────┘
                   (May use a temporary file for larger responses)

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
| **Streaming HTTP responses** | ❌ **Off** | Reduces buffering before sending data to the client |
| **Large file downloads** | ❌ **Off** | Prevents temp file bloat |

## Use Cases

### Streaming Services

Applications like **Jellyfin**, **Plex**, **Emby**, or **Tautulli** often stream large media files. If Nginx tries to buffer these streams:

1. **Disk I/O**: A buffered upstream response may spill to an Nginx proxy temporary file. Request bodies use separate temporary files.
2. **Latency**: It may wait for a buffer to fill before sending data.
3. **Warnings**: You might see warnings in your logs like:
    > *an upstream response is buffered to a temporary file /var/cache/nginx/...*

Enabling "Disable Buffering" resolves these issues by allowing the stream to pass through directly.

### Real-time Applications

Applications that send incremental HTTP responses, such as event streams or live dashboards, may benefit from disabled buffering. WebSocket upgrade support is a separate Proxy Host option; disabling proxy buffering is not a substitute for enabling WebSockets.

## Configuration

To enable this feature:

1. Navigate to your **Dashboard**.
2. Go to **Proxy Hosts**.
3. **Edit** the desired host (or create a new one).
4. In the **Details** tab, locate the **Options** section.
5. Toggle the **Disable Buffering** switch.
6. Click **Save**.

> [!NOTE]
> Disabling response buffering can make slow clients hold upstream connections longer. Disabling request buffering also changes how uploads are sent to the origin. For ordinary pages and small requests, leave the option at its default unless you need streaming behavior.

## Related pages

- [Proxy Hosts](./Proxy-Hosts.md)
- [Cookbook](./Cookbook.md)
