# OpenAppSec WAF

[OpenAppSec](https://www.openappsec.io/) is an AI-based Web Application Firewall (WAF) that uses machine learning to detect and block OWASP Top 10 threats — without relying on signature databases.

## Architecture

OpenAppSec has two components:

| Component | Description | Status in ShieldPM |
|:---|:---|:---:|
| **Nginx Attachment Module** | Plugin loaded by Nginx to intercept traffic | ✅ Already compiled in |
| **Agent** (`cp-nano-agent`) | ML engine that analyzes traffic and makes decisions | ❌ Needs installation |

---

## 🐳 Docker Setup

Uncomment the `openappsec-agent` service in your `compose.yaml` (see [Docker Compose Reference](Docker-Compose-Reference) for the full configuration).

1. **Enable the Nginx Module:**
   ```yaml
   environment:
     - "NGINX_LOAD_OPENAPPSEC_ATTACHMENT_MODULE=true"
   ```

2. **Enable IPC and shared memory volume** for the ShieldPM service.

3. **Configure `local_policy.yaml`** at `/opt/openappsec/localconf/local_policy.yaml`.

4. **Without Cloud Portal:** Uncomment the additional containers (`smartsync`, `shared-storage`, `tuning-svc`, `openappsec-db`).

5. **With Cloud Portal:** Set `AGENT_TOKEN` from [my.openappsec.io](https://my.openappsec.io) instead.

---

## 📦 Native / LXC Setup

OpenAppSec can run in two management modes:

| Mode | Description |
|:---|:---|
| **Cloud Portal** | Managed via [my.openappsec.io](https://my.openappsec.io). Requires an `AGENT_TOKEN`. |
| **Local-only** | Managed via `local_policy.yaml` file. No cloud account needed. |

### Option A: During Installation (Recommended)

The ShieldPM installer offers OpenAppSec as an optional step:

```
=== OpenAppSec WAF (Optional) ===
Install OpenAppSec Agent? [y/N]: y
Enter AGENT_TOKEN (leave empty for local-only mode):
```

- **With Token:** Agent connects to the Cloud Portal for centralized management.
- **Without Token:** A default `local_policy.yaml` is created in **detect-learn** mode.

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

| Model | Detection Quality | Access |
|:---|:---|:---|
| **Basic** | Standard detection, included by default | ✅ Free |
| **Advanced** | Higher accuracy, fewer false positives | 🔑 Download from [my.openappsec.io](https://my.openappsec.io) |

### Installation

**During Install:** The installer prompts for the model path:
```
Path to Advanced Model .tgz (leave empty to skip): /path/to/open-appsec-advanced-model.tgz
```

**Docker:** Mount as a volume in `compose.yaml`:
```yaml
volumes:
  - "/opt/openappsec/open-appsec-advanced-model.tgz:/advanced-model/open-appsec-advanced-model.tgz"
```

**Native / LXC (manually):**
```bash
cp open-appsec-advanced-model.tgz /etc/cp/conf/open-appsec-advanced-model.tgz
open-appsec-ctl --apply-policy
```

---

## ⚙️ Configuration (`local_policy.yaml`)

The policy file is located at `/etc/cp/conf/local_policy.yaml`. It controls what OpenAppSec detects and blocks.

### Modes

| Mode | Behavior |
|:---|:---|
| `detect-learn` | **Default.** Logs threats but does **not** block. Use for initial tuning. |
| `prevent-learn` | Blocks threats **and** continues learning. Recommended for production. |
| `prevent` | Blocks threats, no learning. |
| `inactive` | Disabled. |

### Example Policy

```yaml
policies:
  default:
    mode: detect-learn
    practices:
      - web-attacks:
          override-mode: detect-learn
          minimum-confidence: medium
      - anti-bot:
          override-mode: detect-learn
          injected-URIs: []
          validated-URIs: []
    triggers:
      - log:
          verbosity: standard
          extendedLogging: true
          logToAgent: true
          logToCloud: false
```

### Switching to Active Blocking

Change `detect-learn` → `prevent-learn` and apply:

```bash
# Edit the policy
nano /etc/cp/conf/local_policy.yaml

# Apply changes
open-appsec-ctl --apply-policy
```

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

| Deployment | Log Location |
|:---|:---|
| **Docker** | `/opt/openappsec/logs/` |
| **Native/LXC** | `/var/log/nano_agent/` |

---

## 🔗 Resources

*   [OpenAppSec Documentation](https://docs.openappsec.io/)
*   [Cloud Management Portal](https://my.openappsec.io)
*   [GitHub Repository](https://github.com/openappsec/openappsec)

---
[🏠 Home](Home) | [🐞 Report a Bug](https://github.com/shedowe19/ShieldPM/issues)
