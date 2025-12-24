# CrowdSec Security

[CrowdSec](https://www.crowdsec.net/) is a collaborative IPS (Intrusion Prevention System) that analyzes logs to detect and block malicious behavior.

## 🏗️ Installation

Top enable CrowdSec with NPMplus, you need two components: the **Agent** (analyzes logs) and the **Bouncer** (enforces blocks in Nginx).

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
      - "COLLECTIONS=ZoeyVid/npmplus"
    volumes:
      - "/opt/crowdsec/conf:/etc/crowdsec"
      - "/opt/crowdsec/data:/var/lib/crowdsec/data"
      - "/opt/npmplus/nginx:/opt/npmplus/nginx:ro" # Read logs from NPMplus
```

### 2. Connect NPMplus (The Bouncer)
NPMplus has a built-in Nginx Bouncer.

1.  **Generate API Key:**
    Inside the *CrowdSec container*:
    ```bash
    docker exec crowdsec cscli bouncers add npmplus
    ```
    *Copy the API Key printed.*

2.  **Configure NPMplus:**
    Edit `/opt/npmplus/crowdsec/crowdsec.conf` (created after first run):
    ```ini
    API_KEY=your-generated-key
    API_URL=http://<crowdsec-container-ip>:8080
    ```

3.  **Restart NPMplus:**
    ```bash
    docker restart npmplus
    ```

## ⚙️ Configuration

### Acquisition
Tell CrowdSec where to find the logs. Create `<crowdsec-conf-vol>/acquis.d/npmplus.yaml`:

```yaml
filenames:
  - /opt/npmplus/nginx/*.log
labels:
  type: npmplus
```

### Collections
The `ZoeyVid/npmplus` collection includes parser rules specifically for Nginx Proxy Manager logs.
It should be installed automatically if you set `COLLECTIONS` env var. If not:
```bash
docker exec crowdsec cscli collections install ZoeyVid/npmplus
```

## 🕹️ Management (cscli)

*   **List Banners:** `cscli decisions list`
*   **Ban an IP:** `cscli decisions add --ip 1.2.3.4`
*   **Unban an IP:** `cscli decisions delete --ip 1.2.3.4`
