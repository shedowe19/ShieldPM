# Cookbook & Recipes

Configuration examples for popular self-hosted applications.

## ☁️ Nextcloud

Nextcloud often requires specific headers and upload limit adjustments.

### 1. Upload Limits
To allow large file uploads (e.g., 10GB):
1.  Open your Proxy Host.
2.  Go to the **Advanced** tab.
3.  Add:
    ```nginx
    client_max_body_size 10G;
    proxy_request_buffering off;
    ```

### 2. Service Discovery (caldav/carddav)
To suppress the "Your web server is not properly set up to resolve .well-known..." warnings:
1.  Go to the **Advanced** tab.
2.  Add:
    ```nginx
    location ^~ /.well-known {
        # The rules in this block are an adaptation of the rules
        # in `.htaccess` that ship with Nextcloud.
        location = /.well-known/carddav { return 301 /remote.php/dav/; }
        location = /.well-known/caldav  { return 301 /remote.php/dav/; }
        location = /.well-known/webfinger  { return 301 /index.php/.well-known/webfinger; }
        location = /.well-known/nodeinfo  { return 301 /index.php/.well-known/nodeinfo; }
    }
    ```

## 🏠 Home Assistant

Home Assistant relies heavily on Websockets for real-time updates.

1.  **Websockets:** Ensure **Websockets Support** is checked in the Details tab.
2.  **Configuration:**
    *   Scheme: `http`
    *   Forward Port: `8123`
3.  **trusted_proxies:**
    In your `configuration.yaml` of Home Assistant, you must add the IP of the NPMplus container (or the docker gateway IP) to `http.trusted_proxies` and `use_x_forwarded_for: true`.

## 🍿 Jellyfin / Plex / Emby

Media servers need to handle long-lived connections for streaming.

1.  **Websockets:** Enable **Websockets Support**.
2.  **Buffering:** Disable buffering in the **Advanced** tab to prevent playback issues:
    ```nginx
    proxy_buffering off;
    ```

## 🛡️ AdGuard Home

Securing the AdGuard Home web interface.

1.  **Scheme:** `http`
2.  **Forward Port:** `80` (or `3000` depending on setup).
3.  **Location:** If you want to host it under a subpath (e.g., `/adguard`), note that AdGuard Home does not natively support base URLs easily. It is **highly recommended** to use a subdomain (e.g., `dns.example.com`).

---
[🏠 Home](Home) | [🐞 Report a Bug](https://github.com/shedowe19/NPMplus/issues)
