# CrowdSec Security

[CrowdSec](https://www.crowdsec.net/) is a collaborative IPS (Intrusion Prevention System) that analyzes logs to detect and block malicious behavior.

## Installation / Configuration

To enable CrowdSec with ShieldPM, you need two components: the **Agent** (analyzes logs) and the **Bouncer** (enforces blocks in Nginx).

### 1. The Agent

Add the CrowdSec container to your `compose.yaml`.
**Important:** ShieldPM automatically provisions the necessary Parser and Collection configurations to your data directory (default: `data/crowdsec/`). You **must** mount these into the CrowdSec container.

```yaml
  crowdsec:
    container_name: crowdsec
    image: docker.io/crowdsecurity/crowdsec:latest
    restart: always
    network_mode: bridge
    environment:
      - "TZ=Europe/Berlin"
      - "COLLECTIONS=crowdsecurity/nginx" # Install basic nginx collection
    volumes:
      - "./crowdsec-db:/var/lib/crowdsec/data"
      - "./crowdsec-config:/etc/crowdsec"
      - "/opt/shieldpm/nginx:/opt/shieldpm/nginx:ro" # Read logs from ShieldPM
      # Mount ShieldPM Custom Configs
      # ⚠️ STANDARD PATH: /opt/shieldpm/crowdsec/
      # Verify this matches your 'volumes' in shieldpm service!
      - "/opt/shieldpm/crowdsec/parser.yaml:/etc/crowdsec/parsers/s01-parse/shieldpm-logs.yaml:ro"
      - "/opt/shieldpm/crowdsec/collection.yaml:/etc/crowdsec/collections/shieldpm.yaml:ro"
```

> [!WARNING]
> **Check your paths!**
> The example above uses the standard installation path `/opt/shieldpm`.
> If you are using a custom location or relative paths (e.g. `./data`), adjust the volume mounts accordingly.

### 2. Connect ShieldPM (The Bouncer)

ShieldPM has a built-in Nginx Bouncer.

1.  **Generate API Key:**
    Inside the *CrowdSec container*:
    ```bash
    docker exec crowdsec cscli bouncers add shieldpm
    ```
    *Copy the API Key printed.*

2.  **Configure ShieldPM:**
    Edit `data/crowdsec/crowdsec.conf` (or via the UI if available/environment variables):
    ```ini
    API_KEY=your-generated-key
    API_URL=http://<crowdsec-container-ip>:8080
    ```

3.  **Restart ShieldPM:**
    ```bash
    docker restart shieldpm
    ```

### 📄 Configuration Reference (`crowdsec.conf`)

| Parameter | Required | Description | Example |
| :--- | :--- | :--- | :--- |
| `ENABLED` | **Yes** | Set to `true` to enable the Bouncer. | `true` |
| `API_URL` | **Yes** | URL of your CrowdSec Agent (Local API). | `http://crowdsec:8080` |
| `API_KEY` | **Yes** | Bouncer API Key generated via `cscli`. | `your-generated-key` |
| `CACHE_EXPIRATION` | No | How long to cache decisions locally. | `1s` |
| `BAN_TEMPLATE_PATH` | No | Path to the HTML file for Ban pages. | `/data/crowdsec/ban.html` |
| `CAPTCHA_TEMPLATE_PATH` | No | Path to the HTML file for Captcha pages. | `/data/crowdsec/captcha.html` |
| `SITE_KEY` | Conditional | reCaptcha Site Key (required for Captcha). | `your-site-key` |
| `SECRET_KEY` | Conditional | reCaptcha Secret Key (required for Captcha). | `your-secret-key` |
| `REDIRECT_LOCATION` | No | URL to redirect banned users to (instead of template). | `https://google.com` |
| `RET_CODE` | No | HTTP Status Code for bans (Default: 403). | `403` |

## ⚙️ Acquisition Configuration

Tell CrowdSec where to find the logs. Create `<crowdsec-conf-vol>/acquis.d/shieldpm.yaml`:

```yaml
filenames:
  - /opt/shieldpm/nginx/json_access.log
  - /opt/shieldpm/nginx/error.log
labels:
  type: shieldpm
```

---

## 🕹️ Management (cscli)

*   **List Banners:** `cscli decisions list`
*   **Ban an IP:** `cscli decisions add --ip 1.2.3.4`
*   **Unban an IP:** `cscli decisions delete --ip 1.2.3.4`

---
[🏠 Home](Home) | [🐞 Report a Bug](https://github.com/shedowe19/ShieldPM/issues)
