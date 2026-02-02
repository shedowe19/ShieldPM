# Advanced Usage

Unlock the full potential of ShieldPM with these advanced configurations.

## 📊 GoAccess Analytics

ShieldPM includes **GoAccess**, a real-time web log analyzer.

*   **Enable:** Set `GOA=true` in `compose.yaml`.
*   **Access:** Open `http://<your-server-ip>:91` (Port 91 by default).
*   **GeoIP:** To enable GeoIP stats, download the MaxMind GeoLite2 databases (Country, City, ASN) into `/opt/shieldpm/goaccess/geoip`.

## 🐘 PHP-FPM Integration

You can serve PHP applications directly through ShieldPM.

### External PHP-FPM (Recommended)
This approach keeps your containers clean and separated.
1.  Run a separate PHP-FPM container (e.g., `php:8.2-fpm`).
2.  In your Proxy Host's **Advanced Configuration**:
    ```nginx
    location / {
        alias /var/www/html/;
        location ~* \.php(?:$|/) {
          try_files $fastcgi_script_name =404;
          fastcgi_pass <php-container-ip>:9000;
          fastcgi_split_path_info ^(.*\.php)(/.*)$;
          include fastcgi_params;
          fastcgi_param SCRIPT_FILENAME $request_filename;
        }
    }
    ```

### Internal PHP (Not Recommended)
*   Enable `PHP82=true` (or 83/84) in `compose.yaml`.
*   In the UI, set the "Forward Host" to `127.0.0.1` and Port to `82` (or 83/84).

## 🛠️ Custom Nginx Configurations

### Defined Locations
You can add custom Nginx directives to specific locations in the **Locations** tab of a Proxy Host.

> [!TIP]
> **Example: Protecting a path**
> Add a location `/admin`, and in the Custom Config gear icon:
> ```nginx
> allow 192.168.1.0/24;
> deny all;
> ```

### Custom Upstreams (Load Balancing)
1.  Create `/opt/shieldpm/custom_nginx/http_top.conf`.
2.  Define your upstream block:
    ```nginx
    upstream my_backend {
        least_conn;               # Load balancing strategy
        server 10.0.0.1:80;
        server 10.0.0.2:80;
        server 10.0.0.3:80 down;  # Mark server as down
    }
    ```
3.  In the UI, point your Proxy Host scheme to `http` and Forward Host to `my_backend`.

### Stream Hosts (TCP/UDP Forwarding)
ShieldPM isn't just for HTTP/HTTPS. You can forward raw TCP/UDP traffic (e.g., Game Servers, Database ports).

1.  Navigate to **Streams**.
2.  **Incoming Port:** The port ShieldPM will listen on (e.g., `25565` for Minecraft).
    *   *Note:* This port must be mapped in your `compose.yaml` (Expose ports `25565:25565`).
3.  **Forward Host/Port:** The destination server.
4.  **Protocol:** TCP or UDP.

### Prerun Scripts
Automate startup tasks (e.g., installing extra packages, fixing permissions).
1.  Create `/opt/shieldpm/prerun/myscript.sh`.
2.  Ensure it has `#!/usr/bin/env sh` and is executable.
3.  Set `ENABLE_PRERUN: "true"` in `compose.yaml`.

---
[🏠 Home](Home) | [🐞 Report a Bug](https://github.com/shedowe19/ShieldPM/issues)
