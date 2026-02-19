# Anubis AI Firewall

ShieldPM integrates **Anubis**, a high-performance security utility that protects your services from malicious AI bots, aggressive scrapers, and automated attacks. It works by "weighing the soul" of incoming HTTP requests using powerful CEL (Common Expression Language) expressions.

## 🚀 Key Features
- **AI Crawler Protection**: Automatically blocks known AI bots like GPTBot, CCBot, and Perplexity.
- **Per-Host Rules**: Define specific security policies for each Proxy Host directly in the UI.
- **Regex Support**: Use regular expressions for Paths and User Agents.
- **Flexible Actions**: `ALLOW`, `DENY`, or `CHALLENGE` requests.
- **Fast Performance**: Runs as a native sidecar with minimal overhead.

---

## 🛠️ Installation & Setup

### Docker (Standard)
Anubis is included in the ShieldPM image. Ensure the environment variable `ANUBIS_ENABLED=true` is set (this is the default).

### Native / LXC Installation
Run the installer and select "Yes" when prompted to install Anubis:
```bash
bash scripts/install.sh
```

---

## 🖥️ UI Configuration (Per-Host)

You can manage security rules for each individual domain in the **UI**:

1.  Edit a **Proxy Host**.
2.  Go to the **Security** tab.
3.  Toggle **Anubis AI Firewall** to `ON`.
4.  **Default Rules**: Upon enabling, ShieldPM automatically populates a set of standard rules to block aggressive AI crawlers. You can keep, modify, or delete these.

### Example UI Rules

| Path Regex | User Agent Regex (Optional) | Action | Description |
| :--- | :--- | :--- | :--- |
| `.*` | `(?i)GPTBot\|CCBot\|Anthropic-ai` | `DENY` | Block major AI crawlers for all paths. |
| `^/admin/.*` | | `DENY` | Block all access to the admin area via Anubis. |
| `^/api/.*` | `^Mozilla.*` | `CHALLENGE` | Challenge browser-like requests to API endpoints. |
| `.*` | | `ALLOW` | Explicitly allow all other traffic. |

> [!TIP]
> **Regex Note**: Paths and User Agents use standard Regex syntax. Use `(?i)` at the start of a regex for case-insensitive matching.

---

## ⚙️ Global Policy (`policy.yaml`)

While the UI handles per-host rules, you can also define a **Global Policy** that applies to the entire Anubis instance.

**Paths:**
- **Docker**: `/data/anubis/policy.yaml`
- **Native**: `/opt/shieldpm/anubis/policy.yaml`

### Example Configuration
```yaml
# policy.yaml
# Global rules defined here are processed by Anubis
bots:
  - name: "Aggressive Scrapers"
    user_agent_regex: "(?i)Bytespider|Amazonbot|FacebookBot"
    action: DENY

rules:
  - action: DENY
    expression: "request.path.matches('^/wp-login.php')"
    comment: "Block WordPress login attempts globally"
```

---

## 🔍 How it Works (Internals)

ShieldPM acts as a bridge:
1.  **Nginx** receives a request.
2.  Nginx forwards the request metadata to **Anubis** via a local Unix socket (`/run/anubis/nginx.sock`).
3.  **Anubis** evaluates the request against your UI rules and global policy.
4.  Anubis returns a decision (`ALLOW`, `DENY`, `CHALLENGE`).
5.  **Nginx** allows or blocks the traffic based on that decision.

---

## ❓ Troubleshooting

### Anubis is not starting
Check the logs:
```bash
# Docker
docker logs shieldpm | grep -i anubis

# Native/LXC
journalctl -u anubis -n 50
```

### Changes not reflecting
Anubis reloads its policy automatically when you save a Proxy Host in ShieldPM. If you manually edit `policy.yaml`, you may need to restart the service or container.

> [!IMPORTANT]
> **Performance**: Anubis is extremely fast, but overly complex regex patterns (especially on `.*` paths) can consume more CPU. Keep your rules targeted.
