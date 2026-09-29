# OpenAppSec WAF

[OpenAppSec](https://www.openappsec.io/) is an AI-based Web Application Firewall (WAF) that uses machine learning to detect and block OWASP Top 10 threats — without relying on signature databases.

## Architecture

OpenAppSec has two components:

| Component                   | Description                                         |   Status in ShieldPM   |
| :-------------------------- | :-------------------------------------------------- | :--------------------: |
| **Nginx Attachment Module** | Plugin loaded by Nginx to intercept traffic         | ✅ Already compiled in |
| **Agent** (`cp-nano-agent`) | ML engine that analyzes traffic and makes decisions | ❌ Needs installation  |

```
  ┌──────────┐       ┌──────────────────────────────────────────────┐
  │  Client   │──────▶│                  Nginx                       │
  └──────────┘       │  ┌──────────────────────────────────────┐    │
                     │  │  OpenAppSec Attachment Module         │    │
                     │  │  (Intercept HTTP request/response)   │    │
                     │  └──────────────┬───────────────────────┘    │
                     └─────────────────┼────────────────────────────┘
                                       │ IPC (shared memory)
                                       ▼
                     ┌──────────────────────────────────────────────┐
                     │           cp-nano-agent (Agent)              │
                     │  ┌──────────────┐   ┌────────────────────┐  │
                     │  │  ML Engine   │   │  Policy Engine     │  │
                     │  │  (AI Model)  │   │  (local_policy     │  │
                     │  │              │   │   .yaml)           │  │
                     │  └──────┬───────┘   └────────────────────┘  │
                     │         │                                    │
                     │         ▼                                    │
                     │  ┌──────────────────┐                       │
                     │  │ Decision:        │                       │
                     │  │ ALLOW / BLOCK /  │                       │
                     │  │ DETECT           │                       │
                     │  └──────────────────┘                       │
                     └──────────────────────────────────────────────┘
                                  ▲ (optional)
                                  │
                     ┌────────────┴─────────────┐
                     │  Cloud Portal            │
                     │  my.openappsec.io        │
                     │  (Centralized Mgmt)      │
                     └──────────────────────────┘
```

**Key Points:**

- The **Attachment Module** is compiled into Nginx and intercepts all HTTP traffic
- The **Agent** runs as a separate process and uses **machine learning** for threat detection
- Communication between Nginx and Agent uses **shared memory (IPC)** for minimal latency
- Can be managed locally via `local_policy.yaml` or centrally via the Cloud Portal

## 🐳 Docker Setup

Uncomment the `openappsec-agent` service in your `compose.yaml` (see [Docker Compose Reference](Docker-Compose-Reference) for the full configuration).

1. **Enable the Nginx Module:**

   ```yaml
   environment:
     - "NGINX_LOAD_OPENAPPSEC_ATTACHMENT_MODULE=true"
   ```

2. **Enable IPC and shared memory:** uncomment `ipc: host` and `shm-volume:/dev/shm/check-point` on the ShieldPM service, plus the corresponding `shm-volume` definition at the bottom of `compose.yaml`. The agent service already includes `ipc: host` and the same volume once uncommented.

3. **For local management**, configure `local_policy.yaml` at `/opt/openappsec/localconf/local_policy.yaml` on the host. The agent mounts `/opt/openappsec/localconf` at `/ext/appsec`; the native/LXC policy path below is different.

4. **Without Cloud Portal:** Uncomment the additional containers (`smartsync`, `shared-storage`, `tuning-svc`, `openappsec-db`).

5. **With Cloud Portal:** Set `AGENT_TOKEN` from [my.openappsec.io](https://my.openappsec.io). Configure credentials and bind-mounted directories before bringing up the service.

---

## 📦 Native / LXC Setup

OpenAppSec can run in two management modes:

| Mode             | Description                                                                          |
| :--------------- | :----------------------------------------------------------------------------------- |
| **Cloud Portal** | Managed via [my.openappsec.io](https://my.openappsec.io). Requires an `AGENT_TOKEN`. |
| **Local-only**   | Managed via `local_policy.yaml` file. No cloud account needed.                       |

### Option A: During Installation (Recommended)

The ShieldPM installer offers OpenAppSec as an optional step:

```
=== OpenAppSec WAF (Optional) ===
Install OpenAppSec Agent? [y/N]: y
Enter AGENT_TOKEN (leave empty for local-only mode):
```

- **With Token:** Agent connects to the Cloud Portal for centralized management.
- **Without Token:** The installer writes a `local_policy.yaml` with **detect-learn** selected. Its current inline practice/trigger structure does not match OpenAppSec's documented v1beta1 or v1beta2 schema. Replace or correct the file using the [official local policy schema](https://docs.openappsec.io/getting-started/start-with-linux/local-policy-file-advanced), then apply it and verify the agent's active policy before relying on WAF enforcement.

Both options automatically enable the Nginx attachment module.

### Option B: Manual Installation

```bash
# 1. Download and run installer
cd /tmp
wget https://downloads.openappsec.io/open-appsec-install && chmod +x open-appsec-install

# With Cloud Portal:
./open-appsec-install --auto --token YOUR_AGENT_TOKEN

# Without Cloud Portal (local-only):
./open-appsec-install --auto

# 2. Enable the module in ShieldPM
echo "NGINX_LOAD_OPENAPPSEC_ATTACHMENT_MODULE=true" >> /data/.env

# 3. Restart ShieldPM
systemctl restart shieldpm
```

> [!TIP]
> Get your `AGENT_TOKEN` from [my.openappsec.io](https://my.openappsec.io) → Create Deployment Profile → Copy Token.

---

## 🧠 Advanced ML Model

OpenAppSec uses machine learning models for threat detection. Two models are available:

| Model        | Detection Quality                       | Access                                                        |
| :----------- | :-------------------------------------- | :------------------------------------------------------------ |
| **Basic**    | Standard detection, included by default | ✅ Free                                                       |
| **Advanced** | Higher accuracy, fewer false positives  | 🔑 Download from [my.openappsec.io](https://my.openappsec.io) |

### Installation

**During Install:** The installer prompts for the model path:

```
Path to Advanced Model .tgz (leave empty to skip): /path/to/open-appsec-advanced-model.tgz
```

**Docker:** Save the downloaded archive on the Docker host as
`/opt/openappsec/open-appsec-advanced-model.tgz` before starting the agent. The
`openappsec-agent` service in `compose.yaml` mounts this directory:

```yaml
volumes:
  - "/opt/openappsec:/advanced-model"
```

The agent then sees the archive at
`/advanced-model/open-appsec-advanced-model.tgz`. You can also bind-mount the
individual `.tgz` file to that path, provided the host file already exists;
otherwise Docker may create a directory in its place and the container will
fail to start.

**Native / LXC:** ShieldPM's installer copies a selected archive to `/etc/cp/conf/open-appsec-advanced-model.tgz`. For an existing agent, verify the agent's model-loading procedure for your installed OpenAppSec version and confirm activation in its status/logs; copying the archive alone does not establish that the advanced model was loaded.

```bash
# This mirrors the file-copy step in scripts/install.sh; check agent status afterward.
cp open-appsec-advanced-model.tgz /etc/cp/conf/open-appsec-advanced-model.tgz
```

---

## ⚙️ Configuration (`local_policy.yaml`)

For **Native / LXC**, edit `/etc/cp/conf/local_policy.yaml`. For **Docker**, edit `/opt/openappsec/localconf/local_policy.yaml` on the host (mounted at `/ext/appsec/local_policy.yaml` in the agent). These are local management files; the policy controls what OpenAppSec detects and blocks. The example below uses the documented **v1beta1** schema; deployments using v1beta2 require a different structure.

### Modes

| Mode            | Behavior                                                                  |
| :-------------- | :------------------------------------------------------------------------ |
| `detect-learn`  | **Default.** Logs threats but does **not** block. Use for initial tuning. |
| `prevent-learn` | Blocks threats **and** continues learning. Recommended for production.    |
| `prevent`       | Alias for `prevent-learn` in the v1beta1 schema.                          |
| `inactive`      | Disabled.                                                                 |

### Example v1beta1 Policy

The policy references named practice and log-trigger entries. Keep the practice's `override-mode: as-top-level` if you want changing the policy mode to affect enforcement.

```yaml
policies:
  default:
    mode: detect-learn
    practices:
      - shieldpm-web
    triggers:
      - shieldpm-log
practices:
  - name: shieldpm-web
    web-attacks:
      override-mode: as-top-level
      minimum-confidence: medium
log-triggers:
  - name: shieldpm-log
    appsec-logging:
      detect-events: true
      prevent-events: true
    log-destination:
      cloud: false
      stdout:
        format: json
```

### Switching to Active Blocking

Change `detect-learn` → `prevent-learn` after checking the active policy and logs, then apply the change. For Native / LXC:

```bash
# Edit the policy
nano /etc/cp/conf/local_policy.yaml

# Apply changes
open-appsec-ctl --apply-policy
```

For Docker, edit the host file at `/opt/openappsec/localconf/local_policy.yaml` and run `docker exec openappsec-agent open-appsec-ctl --apply-policy` (or use the configured `autoPolicyLoad=true`).

> [!WARNING]
> Always start in **detect-learn** mode to observe what traffic would be blocked. Review logs before switching to **prevent-learn** to avoid false positives.

---

## 🕹️ Management (`open-appsec-ctl`)

```bash
# Docker
docker exec openappsec-agent open-appsec-ctl --status

# Native / LXC
open-appsec-ctl --status              # Agent status
open-appsec-ctl --apply-policy        # Apply policy changes
open-appsec-ctl --list-policies       # Show active policies
```

---

## 📊 Logs

| Deployment     | Log Location            |
| :------------- | :---------------------- |
| **Docker**     | `/opt/openappsec/logs/` |
| **Native/LXC** | `/var/log/nano_agent/`  |

---

## 🔗 Resources

- [OpenAppSec Documentation](https://docs.openappsec.io/)
- [Cloud Management Portal](https://my.openappsec.io)
- [GitHub Repository](https://github.com/openappsec/openappsec)

---

[🏠 Home](Home) | [🐞 Report a Bug](https://github.com/shedowe19/ShieldPM/issues)
