# CrowdSec Security

[CrowdSec](https://www.crowdsec.net/) is a collaborative IPS (Intrusion Prevention System) that analyzes logs to detect and block malicious behavior.

## 🏗️ Architecture

```
  ┌──────────┐        ┌──────────────────────────────────────────┐
  │  Client   │───────▶│                  Nginx                   │
  └──────────┘        │                                          │
                      │  ┌────────────────────────────────────┐  │
                      │  │      Lua Bouncer (init_by_lua)     │  │
                      │  │  ┌─────────────────────────────┐   │  │
                      │  │  │ Check IP against CrowdSec   │   │  │
                      │  │  │ Local API Decisions Cache    │   │  │
                      │  │  └──────────┬──────────────────┘   │  │
                      │  └─────────────┼──────────────────────┘  │
                      └────────────────┼─────────────────────────┘
                           ┌───────────┴───────────┐
                           ▼                       ▼
                     ┌──────────┐            ┌──────────┐
                     │  ALLOW   │            │  BLOCK   │
                     │ (proxy)  │            │ (403/Ban │
                     └──────────┘            │  Page)   │
                                             └──────────┘
                                                   ▲
  ┌──────────────────────────────────────┐         │
  │         CrowdSec Agent               │         │
  │  ┌──────────┐    ┌───────────────┐   │      Decisions
  │  │ Log Parser│───▶│ Scenario      │───┼────────┘
  │  │ (acquis)  │    │ Engine        │   │
  │  └──────────┘    └───────────────┘   │
  │       ▲                              │
  │       │ reads                        │
  │  /data/nginx/json_access.log         │
  └──────────────────────────────────────┘
```

**Key Points:**

- The **Lua Bouncer** is built into Nginx and checks every request against CrowdSec decisions
- The **Agent** continuously parses Nginx logs and creates ban decisions for malicious IPs
- Communication between Bouncer and Agent uses the **Local API** (HTTP on port 8080)
- Decisions are cached locally for sub-millisecond lookup performance

## Installation / Configuration

To enable CrowdSec with ShieldPM, you need two components: the **Agent** (analyzes logs) and the **Bouncer** (enforces blocks in Nginx). The Nginx Bouncer is **already built-in** — you only need to install and connect the Agent.

---

## 🐳 Docker Setup

### 1. Pre-Requisites & Order

> [!IMPORTANT]
> **Initialization Order Matters!**
> ShieldPM creates the necessary configuration files (`parser.yaml`, `collection.yaml`) on first boot in your data directory.
> **You must start ShieldPM FIRST** before enabling the CrowdSec container.
>
> 1. Start ShieldPM (`docker compose up -d shieldpm`).
> 2. Wait for it to initialize (check logs).
> 3. Restart or start CrowdSec (`docker compose up -d crowdsec`).
>
> If you start CrowdSec while these files are missing, Docker may create them as **directories**, causing CrowdSec to crash.

### 2. The Agent

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
      - "/opt/shieldpm/crowdsec/shieldpm-acquis.yaml:/etc/crowdsec/acquis.d/shieldpm.yaml:ro"
```

> [!WARNING]
> **Check your paths!**
> The example above uses the standard installation path `/opt/shieldpm`.
> If you are using a custom location or relative paths (e.g. `./data`), adjust the volume mounts accordingly.

### 3. Connect ShieldPM (The Bouncer)

1. **Generate API Key:**
    Inside the *CrowdSec container*:

    ```bash
    docker exec crowdsec cscli bouncers add shieldpm
    ```

    *Copy the API Key printed.*

2. **Configure ShieldPM:**
    Edit `data/crowdsec/crowdsec.conf`:

    ```ini
    API_KEY=your-generated-key
    API_URL=http://<crowdsec-container-ip>:8080
    ```

3. **Restart ShieldPM:**

    ```bash
    docker restart shieldpm
    ```

---

## 📦 Native / LXC Setup

For Native and LXC installations, CrowdSec runs as a **local systemd service** — no Docker container needed.

### Option A: During Installation (Recommended)

The ShieldPM installer offers CrowdSec as an optional step:

```
=== CrowdSec IPS (Optional) ===
Install CrowdSec? [y/N]:
```

Selecting **Y** will automatically:

1. Install the CrowdSec Agent via `apt`
2. Configure log acquisition (pointing to `/data/nginx/json_access.log` and `/data/nginx/error.log`)
3. Install the ShieldPM parser and security collections
4. Generate a Bouncer API key
5. Configure the built-in Nginx Bouncer (`/data/crowdsec/crowdsec.conf`)
6. Enable and start the `crowdsec` systemd service

**No further configuration needed** — CrowdSec will be fully operational after the installer completes.

### Option B: Manual Installation (Existing Systems)

If you skipped CrowdSec during installation or want to add it later:

1. **Install CrowdSec:**

    ```bash
    curl -s https://install.crowdsec.net | bash
    apt install -y crowdsec
    ```

2. **Create Acquisition Config:**

    ```bash
    mkdir -p /etc/crowdsec/acquis.d
    cat > /etc/crowdsec/acquis.d/shieldpm.yaml << 'EOF'
    filenames:
      - /data/nginx/json_access.log
      - /data/nginx/error.log
    labels:
      type: shieldpm
    EOF
    ```

3. **Install Parsers & Collections:**

    ```bash
    cscli hub update
    cscli parsers install shedowe19/shieldpm-logs
    cscli collections install crowdsecurity/base-http-scenarios
    cscli collections install crowdsecurity/http-cve
    cscli collections install crowdsecurity/appsec-virtual-patching
    ```

4. **Generate Bouncer Key & Configure:**

    ```bash
    cscli bouncers add shieldpm-bouncer
    # Copy the printed API key, then:
    nano /data/crowdsec/crowdsec.conf
    ```

    Set:

    ```ini
    ENABLED=true
    API_KEY=your-generated-key
    API_URL=http://127.0.0.1:8080
    ```

5. **Restart Services:**

    ```bash
    systemctl enable --now crowdsec
    systemctl restart shieldpm
    ```

---

## 📄 Configuration Reference (`crowdsec.conf`)

| Parameter | Required | Description | Example |
| :--- | :--- | :--- | :--- |
| `ENABLED` | **Yes** | Set to `true` to enable the Bouncer. | `true` |
| `API_URL` | **Yes** | URL of your CrowdSec Agent (Local API). | `http://127.0.0.1:8080` |
| `API_KEY` | **Yes** | Bouncer API Key generated via `cscli`. | `your-generated-key` |
| `CACHE_EXPIRATION` | No | How long to cache decisions locally. | `1s` |
| `BAN_TEMPLATE_PATH` | No | Path to the HTML file for Ban pages. | `/data/crowdsec/ban.html` |
| `CAPTCHA_TEMPLATE_PATH` | No | Path to the HTML file for Captcha pages. | `/data/crowdsec/captcha.html` |
| `SITE_KEY` | Conditional | reCaptcha Site Key (required for Captcha). | `your-site-key` |
| `SECRET_KEY` | Conditional | reCaptcha Secret Key (required for Captcha). | `your-secret-key` |
| `REDIRECT_LOCATION` | No | URL to redirect banned users to (instead of template). | `https://google.com` |
| `RET_CODE` | No | HTTP Status Code for bans (Default: 403). | `403` |

## ⚙️ Acquisition Configuration

ShieldPM automatically provisions the acquisition configuration.

| Deployment | Acquis File Location | Log Paths |
|:---|:---|:---|
| **Docker** | mounted via `compose.yaml` | `/opt/shieldpm/nginx/json_access.log` |
| **Native/LXC** | `/etc/crowdsec/acquis.d/shieldpm.yaml` | `/data/nginx/json_access.log` |

---

## 🕹️ Management (cscli)

```bash
# Docker
docker exec crowdsec cscli decisions list
docker exec crowdsec cscli decisions add --ip 1.2.3.4
docker exec crowdsec cscli decisions delete --ip 1.2.3.4

# Native / LXC
cscli decisions list
cscli decisions add --ip 1.2.3.4
cscli decisions delete --ip 1.2.3.4
```

---
[🏠 Home](Home) | [🐞 Report a Bug](https://github.com/shedowe19/ShieldPM/issues)
