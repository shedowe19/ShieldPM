# Advanced Usage

Unlock the full potential of NPMplus with these advanced configurations.

## 📊 GoAccess Analytics

NPMplus includes **GoAccess**, a real-time web log analyzer.

*   **Enable:** Set `GOA=true` in `compose.yaml`.
*   **Access:** Open `http://<your-server-ip>:91` (Port 91 by default).
*   **GeoIP:** To enable GeoIP stats, download the MaxMind GeoLite2 databases (Country, City, ASN) into `/opt/npmplus/goaccess/geoip`.

## 🐘 PHP-FPM Integration

You can serve PHP applications directly through NPMplus.

### External PHP-FPM (Recommended)
1.  Run a separate PHP-FPM container (e.g., `php:8.2-fpm-alpine`).
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

### Custom Upstreams (Load Balancing)
1.  Create `/opt/npmplus/custom_nginx/http_top.conf`.
2.  Define your upstream block:
    ```nginx
    upstream my_backend {
        server 10.0.0.1:80;
        server 10.0.0.2:80;
    }
    ```
3.  In the UI, point your Proxy Host scheme to `http` and Forward Host to `my_backend`.

### Prerun Scripts
Automate startup tasks.
1.  Create `/opt/npmplus/prerun/myscript.sh`.
2.  Ensure it has `#!/usr/bin/env sh`.
3.  Set `ENABLE_PRERUN: "true"` in `compose.yaml`.
