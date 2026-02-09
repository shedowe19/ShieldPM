# Advanced Usage

Unlock the full potential of ShieldPM with these advanced configurations.

## 📊 GoAccess Analytics

ShieldPM includes **GoAccess**, a real-time web log analyzer.

*   **Enable:** Set `GOA=true` in `compose.yaml` (Docker) or `/data/.env` (Native/LXC).
*   **Access:** Open `http://<your-server-ip>:91` (Port 91 by default).
*   **GeoIP:** To enable GeoIP stats, download the MaxMind GeoLite2 databases (Country, City, ASN) into the `goaccess/geoip` folder inside your data directory.

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

1.  Create a `http_top.conf` file in your custom Nginx config directory:
    *   **Docker:** `/opt/shieldpm/custom_nginx/http_top.conf` (maps to `/data/custom_nginx/`)
    *   **Native / LXC:** `/data/custom_nginx/http_top.conf`
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
👉 **[Read the full Streams documentation](Streams)**

---

## 📝 Dashboard Notes

The Dashboard includes a **Sticky Notes** widget where you can create colored notes to keep track of important information, reminders, or documentation for your infrastructure.

### Features
*   **Create / Edit / Delete** notes directly on the Dashboard.
*   **Color Options:** Yellow, Blue, Green, Red, Purple, and Gray.
*   **Shared:** Notes are visible to all users who can access the Dashboard.

### Usage
1.  Go to the **Dashboard** (home page).
2.  Find the **Notes** widget.
3.  Click the **+** button to create a new note.
4.  Enter your text, choose a color, and save.

---
[🏠 Home](Home) | [🐞 Report a Bug](https://github.com/shedowe19/ShieldPM/issues)
