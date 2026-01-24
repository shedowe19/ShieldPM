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
      # ⚠️ STANDARD PATH: /opt/shieldpm/data/crowdsec/
      # Verify this matches your 'volumes' in shieldpm service!
      - "/opt/shieldpm/data/crowdsec/parser.yaml:/etc/crowdsec/parsers/s01-parse/shieldpm-logs.yaml:ro"
      - "/opt/shieldpm/data/crowdsec/collection.yaml:/etc/crowdsec/collections/shieldpm.yaml:ro"
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

## ⚙️ Acquisition Configuration

Tell CrowdSec where to find the logs. Create `<crowdsec-conf-vol>/acquis.d/shieldpm.yaml`:

```yaml
filenames:
  - /opt/shieldpm/nginx/*.log
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
