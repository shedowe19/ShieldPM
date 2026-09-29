# Cookbook & Recipes

Configuration examples for popular self-hosted applications.

## ☁️ Nextcloud

Nextcloud often requires specific headers and upload limit adjustments.

### 1. Upload Limits

To raise Nginx's limit for a single upload request:

1.  Open your Proxy Host.
2.  Go to the **Advanced** tab.
3.  Add:
    ```nginx
    client_max_body_size 10G;
    proxy_request_buffering off;
    ```

This only changes Nginx's request-size limit and buffering; it does not raise any ModSecurity request-body limit. For Nextcloud's chunked WebDAV uploads, enable **Upload Relay** in the Advanced tab instead: its `/remote.php/dav/uploads/` location allows chunks up to 100 MiB while retaining WAF inspection. Large files still depend on the client splitting them into requests under the limits of any CDN, ShieldPM and the application. The Proxy Host's **Disable Buffering** option also turns off request and response buffering for ordinary proxied traffic.

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
    - Scheme: `http`
    - Forward Port: `8123`
3.  **trusted_proxies:**
    In your `configuration.yaml` of Home Assistant, you must add the IP of the ShieldPM container (or the docker gateway IP) to `http.trusted_proxies` and `use_x_forwarded_for: true`.

## 🍿 Jellyfin / Plex / Emby

Media servers need to handle long-lived connections for streaming.

1.  **Websockets:** Enable **Websockets Support**.
2.  **Buffering:** If playback or downloads are delayed by proxy buffering, enable **Disable Buffering** in the Proxy Host's Details options (equivalent to these Nginx directives for proxied traffic):
    ```nginx
    proxy_buffering off;
    proxy_request_buffering off;
    ```

## 🛡️ AdGuard Home

Securing the AdGuard Home web interface.

1.  **Scheme:** `http`
2.  **Forward Port:** `80` (or `3000` depending on setup).
3.  **Location:** If you want to host it under a subpath (e.g., `/adguard`), note that AdGuard Home does not natively support base URLs easily. It is **highly recommended** to use a subdomain (e.g., `dns.example.com`).

---

## Related pages

- [Home](./Home.md)
- [Proxy Hosts](./Proxy-Hosts.md)
- [Disable Buffering](./Disable-Buffering.md)
