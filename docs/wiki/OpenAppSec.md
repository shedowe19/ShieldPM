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

The ShieldPM native installer offers OpenAppSec as an optional step on **Debian 13 (Trixie)**. Agent archive availability depends on the architecture; the upstream ARM64 archive currently returns HTTP 403:

```
=== OpenAppSec WAF (Optional) ===
Install OpenAppSec Agent? [y/N] (Default: N): y
Cloud Portal deployment token (leave empty for local policy):
Path to optional Advanced Model .tgz (leave empty to skip):
```

- **With Token:** Agent connects to the Cloud Portal for centralized management. The prompt hides the token; do not put it on a command line.
- **Without Token:** The installer creates and applies a [v1beta1 local policy](https://docs.openappsec.io/getting-started/start-with-linux/local-policy-file-advanced) in **detect-learn** mode if no policy exists. An existing policy is preserved. Inspect the active policy and logs before relying on WAF enforcement.

ShieldPM's Nginx binary under `/usr/local/nginx` already includes the attachment. ShieldPM installs the agent directly from OpenAppSec's architecture-specific archive, without installing another Nginx package, and enables its own attachment setting after checking the installation. The upstream `open-appsec-install --auto` wrapper searches for a package-managed Nginx and reports `NGINX is not installed` for this layout; do not use that wrapper for ShieldPM native/LXC deployments. The helper supports Debian 13 x86_64 and aarch64, but ARM64 installation currently stops with a clear download error because its upstream archive returns HTTP 403.

### Option B: Add the Agent to an Existing Native/LXC Installation

```bash
shieldpm-openappsec-agent-install
```

Run this command as `root` inside the native host or LXC. The helper prompts for the Cloud Portal deployment token without echoing it. Leave the prompt empty for local management. It then offers an optional Advanced Model `.tgz` path, enables the Nginx attachment setting in `/data/.env` after installation checks, and restarts an already running ShieldPM service. For the native installation flow, ShieldPM starts the service after this step. Check `open-appsec-ctl --status`, `open-appsec-ctl --list-policies` and the Nginx status after installation.

Get a deployment token from [my.openappsec.io](https://my.openappsec.io) if you choose Cloud Portal management. Do not paste it into shell commands: command arguments may appear in shell history and process listings. If this helper is missing, install/update ShieldPM from a release containing it first.

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

**Native / LXC:** Enter the path to the `.tgz` file when the ShieldPM agent helper prompts for it. The helper validates and copies it to `/advanced-model/open-appsec-advanced-model.tgz`, then stops the agent, extracts the model into `/etc/cp/conf/waap`, and starts the agent. These steps follow [OpenAppSec's Linux embedded procedure](https://docs.openappsec.io/getting-started/using-the-advanced-machine-learning-model). Verify the active model type and version with `open-appsec-ctl --status` after installation.

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
