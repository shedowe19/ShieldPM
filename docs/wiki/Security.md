# Security Features

NPMplus puts security at the forefront.

## 🛡️ Core Security

*   **HTTP/3 (QUIC):** Enabled by default (requires UDP port 443 exposed). Provides faster connection establishment and better performance on unreliable networks.
*   **HSTS:** HTTP Strict Transport Security is recommended. `NGINX_HSTS_SUBDOMAINS=true` enforces it for subdomains as well.
*   **Protocol Optimization:** Only secure TLSv1.2 and TLSv1.3 are enabled. Weak ciphers are disabled.

## 🦅 CrowdSec Integration (IPS)

[CrowdSec](https://www.crowdsec.net/) is an open-source IPS that can block malicious IPs based on community intelligence.

### Setup Guide
1.  **Install CrowdSec** container (see `compose.yaml` example).
2.  **Enable Logging:** Set `LOGROTATE: "true"` in NPMplus `compose.yaml`.
3.  **Configure Acquisition:**
    Create `/opt/crowdsec/conf/acquis.d/npmplus.yaml`:
    ```yaml
    filenames:
      - /opt/npmplus/nginx/*.log
    labels:
      type: npmplus
    ```
4.  **Connect-Bouncer:**
    Run `docker exec crowdsec cscli bouncers add npmplus -o raw` to get an API key, then add it to `/opt/npmplus/crowdsec/crowdsec.conf`.

## 🔥 ModSecurity (WAF)

Web Application Firewall integration using the **OWASP Core Rule Set (CRS)**.

### How to use
1.  **Download Plugins:** Get the CRS plugin files.
2.  **Place Files:** Put them in `/opt/npmplus/modsecurity/crs-plugins`.
3.  **Activate:** Configure the specific `<plugin>-config.conf` files as needed.
4.  **Enable in UI:** When creating a Proxy Host, toggle "ModSecurity" on.

## 🔐 OpenAppSec

NPMplus supports [OpenAppSec](https://www.openappsec.io/) for advanced machine learning-based protection.
*   Enable via `NGINX_LOAD_OPENAPPSEC_ATTACHMENT_MODULE=true`.
*   Requires a dedicated `openappsec-agent` container (see `compose.yaml`).
