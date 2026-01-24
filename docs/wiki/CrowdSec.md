# CrowdSec Security

[CrowdSec](https://www.crowdsec.net/) is a collaborative IPS (Intrusion Prevention System) that analyzes logs to detect and block malicious behavior.

## 🏗️ Installation

Top enable CrowdSec with ShieldPM, you need two components: the **Agent** (analyzes logs) and the **Bouncer** (enforces blocks in Nginx).

### 1. The Agent
Add the CrowdSec container to your `compose.yaml`:

```yaml
  crowdsec:
    container_name: crowdsec
    image: docker.io/crowdsecurity/crowdsec:latest
    restart: always
    network_mode: bridge
    environment:
      - "TZ=Europe/Berlin"
      - "COLLECTIONS=shedowe19/shieldpm"
    volumes:
      - "/opt/crowdsec/conf:/etc/crowdsec"
      - "/opt/crowdsec/data:/var/lib/crowdsec/data"
      - "/opt/shieldpm/nginx:/opt/shieldpm/nginx:ro" # Read logs from ShieldPM
```

### 2. Connect ShieldPM (The Bouncer)
ShieldPM has a built-in Nginx Bouncer.

1.  **Generate API Key:**
    Inside the *CrowdSec container*:
    ```bash
    docker exec crowdsec cscli bouncers add shieldpm
    ```
    *Copy the API Key printed.*

2.  **Configure ShieldPM:**
    Edit `/opt/shieldpm/crowdsec/crowdsec.conf` (created after first run):
    ```ini
    API_KEY=your-generated-key
    API_URL=http://<crowdsec-container-ip>:8080
    ```

3.  **Restart ShieldPM:**
    ```bash
    docker restart shieldpm
    ```

## ⚙️ Configuration

### Acquisition
Tell CrowdSec where to find the logs. Create `<crowdsec-conf-vol>/acquis.d/shieldpm.yaml`:

```yaml
filenames:
  - /opt/shieldpm/nginx/*.log
labels:
  type: shieldpm
```

### Collections
The `shedowe19/shieldpm` collection includes parser rules specifically for Nginx Proxy Manager logs.
It should be installed automatically if you set `COLLECTIONS` env var. If not:
```bash
docker exec crowdsec cscli collections install shedowe19/shieldpm
```


## 📦 Manual Installation (Offline/Custom)

If you cannot connect to the CrowdSec Hub or want to use the bundled configurations directly from this repository, you can mount the provided `crowdsec` directory into your container.

1.  **Mount the files:**
    Update your `compose.yaml` to include the local `crowdsec` directory:
    ```yaml
        volumes:
          - "./crowdsec:/etc/crowdsec/hub/parsers/s01-parse/shedowe19-shieldpm-logs.yaml:ro"
          - "./crowdsec:/etc/crowdsec/hub/collections/shedowe19-shieldpm.yaml:ro"
    ```
    *Note: The actual paths inside the container might vary depending on your CrowdSec configuration (e.g., typically `.../hub/parsers/...` or `.../acquis.d/...` for acquisition).*
    
    **Better approach for custom Parsers:**
    Mount them into `conf.d`:
    ```yaml
        volumes:
          - "./crowdsec/parser.yaml:/etc/crowdsec/parsers/s01-parse/shieldpm-logs.yaml:ro"
          - "./crowdsec/collection.yaml:/etc/crowdsec/collections/shieldpm.yaml:ro"
    ```

2.  **Restart CrowdSec:**
    ```bash
    docker compose restart crowdsec
    ```

## 🕹️ Management (cscli)

*   **List Banners:** `cscli decisions list`
*   **Ban an IP:** `cscli decisions add --ip 1.2.3.4`
*   **Unban an IP:** `cscli decisions delete --ip 1.2.3.4`

---
[🏠 Home](Home) | [🐞 Report a Bug](https://github.com/shedowe19/ShieldPM/issues)
