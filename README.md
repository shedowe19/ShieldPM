# NPMplus

![Version](https://img.shields.io/github/v/release/shedowe19/NPMplus?style=for-the-badge&color=blue)
![License](https://img.shields.io/github/license/shedowe19/NPMplus?style=for-the-badge&color=orange)
![CI Status](https://img.shields.io/github/actions/workflow/status/shedowe19/NPMplus/docker.yml?style=for-the-badge)

**NPMplus** is an advanced, security-focused fork of Nginx Proxy Manager (NPM). It empowers you to manage Nginx reverse proxies with a user-friendly web interface while integrating cutting-edge features like **HTTP/3 (QUIC)**, **CrowdSec IPS**, **ModSecurity (WAF)**, and **enhanced TLS certificate management**.

---

## 🚀 Quick Start

Get up and running in seconds with Docker Compose.

**1. Download Configuration**
```bash
curl -o compose.yaml https://raw.githubusercontent.com/shedowe19/NPMplus/refs/heads/develop/compose.yaml
```

**2. Configure**
Edit `compose.yaml`:
*   Set `TZ` (Timezone)
*   Set `ACME_EMAIL` (for Let's Encrypt)

**3. Launch**
```bash
docker compose up -d
```

**4. Access Admin UI**
Open `https://<your-ip>:81`
*   **Email:** `admin@example.org`
*   **Password:** Check logs (`docker logs npmplus`) for the unique initial password.

---

## 🛠️ Tech Stack

![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white)
![Nginx](https://img.shields.io/badge/Nginx-009639?style=flat-square&logo=nginx&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=nodedotjs&logoColor=white)
![React](https://img.shields.io/badge/React-61DAFB?style=flat-square&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-003B57?style=flat-square&logo=sqlite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=flat-square&logo=tailwind-css&logoColor=white)

---

## ✨ Key Features

NPMplus extends the original Nginx Proxy Manager with significant enhancements:

### 🛡️ Core Security
*   **HTTP/3 (QUIC) Support:** Leverage the latest web protocol for faster, more efficient connections. Requires exposing HTTPS with UDP.
*   **CrowdSec Integration:** Enhanced security with IPS capabilities to block malicious IPs.
*   **ModSecurity (WAF):** Web Application Firewall with CoreRuleSet support for added protection.
*   **Improved TLS Management:**
    *   Faster certificate creation by minimizing Nginx reloads.
    *   **OCSP Stapling/Must-Staple** support for enhanced security.
    *   Automatic cleaning of old, invalid Certbot certificates.
    *   Support for different ACME servers and **ML-KEM**.

### ⚡ Performance & Nginx Configuration
*   **Protocol Optimization:** Only enables TLSv1.2 and TLSv1.3. HTTP/2 is always enabled.
*   **Load Balancing:** Capabilities for complex upstream setups (requires custom configuration).
*   **Upload Limits:** Allows infinite upload size (may be limited by ModSecurity).
*   **Header Security:** `Server` response header hidden by default. Basic security headers added when HSTS is enabled.
*   **OpenAppSec:** Option to load OpenAppSec attachment module.
*   **Punycode:** Full support for international domain names.

### 💻 Usability & Administration
*   **Lightweight:** Smaller Docker image based on **Alpine Linux**.
*   **Secure Admin:** Admin backend and default page run securely with HTTPS.
*   **Database:** Automatic **SQLite** vacuum and password reset utility.
*   **Networking:** Many environment options optimized for `network_mode: host`.
*   **Security Secrets:** DNS secrets are saved in the DB and rewritten on container start (no external mounts needed).
*   **GoAccess:** Real-time web log analyzer (accessible on `:91`).
*   **PHP:** Optional PHP-FPM integration (8.2/8.3/8.4).

---

## 📦 Migration & Compatibility

| Feature | Status | Note |
| :--- | :--- | :--- |
| **Architectures** | `amd64`, `arm64` | 32-bit not supported |
| **Database** | SQLite (Rec.) | MySQL/PG supported but offers no major benefit |
| **From NPM** | One-way | **Cannot downgrade** to original NPM. Backup first! |

### Migration Steps
**Note: Migrating back to the original version is not possible.**

1.  **Backup** `/data` and `/etc/letsencrypt`.
2.  **Stop** old NPM container.
3.  **Update** `compose.yaml` volumes to point to your data.
4.  **Deploy** NPMplus (`docker compose up -d`).
5.  **Clean up**: Remove `/etc/letsencrypt` volume after first run (moved to `/data`).
6.  **Verify**: Check all host settings and update Proxy Scheme to HTTPS if proxying NPMplus through itself.

---

## 🛡️ Advanced Security Configuration

### CrowdSec (IPS)
To enable CrowdSec IPS integration:

<details>
<summary>Click to view setup instructions</summary>

1.  **Install Collection**: Install CrowdSec and the `shedowe19/npmplus` collection.
2.  **Enable Logging**: Set `LOGROTATE: "true"` in `compose.yaml`.
3.  **Configure Acquisition**: Create/update `/opt/crowdsec/conf/acquis.d/npmplus.yaml`:
    ```yaml
    filenames:
      - /opt/npmplus/nginx/*.log
    labels:
      type: npmplus
    ---
    filenames:
      - /opt/npmplus/nginx/*.log
    labels:
      type: modsecurity
    ---
    listen_addr: 0.0.0.0:7422
    appsec_config: crowdsecurity/appsec-default
    name: appsec
    source: appsec
    labels:
      type: appsec
    ```
4.  **Host Network**: Ensure `network_mode: host` is used.
5.  **Bouncer**: Run `docker exec crowdsec cscli bouncers add npmplus -o raw` and save the key.
6.  **Config**: Edit `/opt/npmplus/crowdsec/crowdsec.conf`, set `ENABLED=true` and `API_KEY`.
7.  **Firewall Bouncer**: Recommended for optimal protection.
</details>

### ModSecurity (WAF) CoreRuleSet
1.  **Download** plugin files (`-before.conf`, `-config.conf`, etc.).
2.  **Place** them in `/opt/npmplus/modsecurity/crs-plugins`.
3.  **Configure** the `<plugin-name>-config.conf`.

---

## 🔌 Feature Integrations

### PHP-FPM
<details>
<summary><strong>External PHP-FPM (Recommended)</strong></summary>

1.  Create a Proxy Host (dummy data for Scheme/IP/Path).
2.  In **Advanced Configuration**, add:
    ```nginx
    location / {
        alias /var/www/<site-folder>/;
        location ~* \.php(?:$|/) {
          fastcgi_split_path_info ^(.*\.php)(/.*)$;
          try_files $fastcgi_script_name =404;
          fastcgi_pass <php-fpm-address>; # socket/tcp
        }
    }
    ```
</details>

<details>
<summary><strong>Inbuilt PHP-FPM</strong></summary>

1.  Enable `PHP82`, `PHP83`, or `PHP84` vars in `compose.yaml`.
2.  In Proxy Host UI, set Forwarding Port to `82`, `83`, or `84`.
</details>

### Load Balancing
Define upstream servers in `/opt/npmplus/custom_nginx/http_top.conf`:
```nginx
upstream my_app {
    server 10.0.0.1:80;
    server 10.0.0.2:80;
    server 10.0.0.3:80 backup;
}
```
Then point your Proxy Host to `http://my_app` (or use specific ports as needed).

### Prerun Scripts
Create `/opt/npmplus/prerun/` and place shell scripts (`.sh`) there.
*   Ensure shebang is present (`#!/usr/bin/env sh`).
*   Set `ENABLE_PRERUN: "true"` in `compose.yaml`.

---

## 🔐 Auth Requests (SSO) configuration
NPMplus supports easy integration with auth providers via `auth_request`.

<details>
<summary><strong>Authentik</strong></summary>

**Custom Location `/`**:
```nginx
auth_request /outpost.goauthentik.io/auth/nginx;
error_page 401 = @goauthentik_proxy_signin;
auth_request_set $auth_cookie $upstream_http_set_cookie;
add_header Set-Cookie $auth_cookie;
# ... (See full docs for headers)
```

**Custom Location `/outpost.goauthentik.io`**:
Proxy to your Authentik instance (`https://<ip>:9443/outpost.goauthentik.io`).

**Advanced Config**:
```nginx
location @goauthentik_proxy_signin {
    internal;
    add_header Set-Cookie $auth_cookie;
    return 302 /outpost.goauthentik.io/start?rd=$request_uri;
}
```
</details>

<details>
<summary><strong>Authelia</strong></summary>

**Custom Location `/`**:
```nginx
auth_request /internal/authelia/authz;
auth_request_set $redirection_url $upstream_http_location;
error_page 401 =302 $redirection_url;
# ... (User/Groups Headers)
```
</details>

<details>
<summary><strong>Anubis</strong></summary>
Add `auth_request /.within.website/x/cmd/anubis/api/check;` to custom location `/`.
</details>

<details>
<summary><strong>TinyAuth</strong></summary>
Add `auth_request /tinyauth;` to custom location `/`.
</details>

---

## ⚠️ Notes on Cloudflare
It is **not recommended** to use Cloudflare proxy (`users <=> Cloudflare <=> NPMplus`) in front of NPMplus.

*   **MITM:** Cloudflare acts as a Man-in-the-Middle, decrypting traffic.
*   **Features:** Breaks HTTP/3 between user and NPMplus.
*   **Overrides:** Overrides HSTS and TLS settings.
*   **Uploads:** 100MB upload limit on free plans.
*   **Privacy:** Cannot protect if real IP is known; does not protect non-HTTP ports.

**Recommendation:** Use CrowdSec for WAF/IPS or Cloudflared tunnels (without proxying) if IP hiding is needed. If you must use Cloudflare, set SSL/TLS to **Full (strict)**.

---

## 📝 Privacy & Data Handling (Hints)
**Disclaimer: This is not legal advice.** Please disclose the following:

1.  **Nginx Error Logs:** Contain user IPs (WARN level+), written to Docker logs.
2.  **LOGROTATE:** If true, access/error logs (with IPs) are written to disk.
3.  **CrowdSec:** Metadata sent to CrowdSec if sharing is enabled.
4.  **IP Blocking:** Disclose use of access lists, GeoIP, etc.
5.  **GoAccess:** Stores analytics/IPs on disk.
6.  **PHP-FPM:** Error logs contain IPs.
7.  **OpenAppSec:** Mention if module is loaded.
8.  **Custom Data:** Any custom Lua scripts collecting data.
9.  **Caddy:** If using Caddy redirect container.
10. **Anubis:** See Anubis privacy policy.
11. **Extra Configs:** Any user-data related custom configs.
12. **Backend:** General data handling/storage policies.
13. **OCSP:** Clients may contact CAs directly.
14. **Nameservers:** Providers may see DNS requests.

---

## 🌐 Expected Connections
The container may initiate outbound connections to:
*   Clients & Upstream Services
*   ACME/OCSP Servers
*   Gravatar (Profile Pics)
*   GitHub (Update checks)
*   PyPI (Certbot plugins)
*   DNS Providers (Challenges)
*   Site24x7 (Reachability checks)
*   Cloudflare (IP Ranges)
*   CrowdSec LAPI

---

## 🤝 Contributing & Support

*   **Support**: [GitHub Discussions](https://github.com/shedowe19/NPMplus/discussions)
*   **Chat**: [Discord Server](https://discord.gg/y8DhYhv427)
*   **Bugs**: [GitHub Issues](https://github.com/shedowe19/NPMplus/issues)

**Maintained with ❤️ by the open source community.**
