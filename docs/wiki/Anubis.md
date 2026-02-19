# Anubis AI Firewall

ShieldPM integrates **[Anubis](https://anubis.techaro.lol)**, a high-performance security utility that protects your services from malicious AI bots, aggressive scrapers, and automated attacks. It works by evaluating incoming HTTP requests and applying configurable rules to decide whether to allow, deny, or challenge each request.

> [!NOTE]
> **Anubis is Open Source**, developed by [Techaro](https://techaro.lol). ShieldPM integrates it natively so you can configure everything from the UI — no manual YAML editing required.

---

## 🚀 Key Features

| Feature | Description |
| :--- | :--- |
| **AI Crawler Protection** | Blocks known AI bots (GPTBot, CCBot, Perplexity, etc.) |
| **Proof-of-Work Challenge** | Forces browsers to solve a cryptographic puzzle before accessing your site |
| **Per-Host Rules** | Define specific security policies for each Proxy Host in the UI |
| **Regex Matching** | Use regular expressions for Paths, User Agents, and Headers |
| **IP Filtering** | Allow/Deny traffic based on CIDR ranges (e.g. `192.168.1.0/24`) |
| **Challenge Tuning** | Adjust difficulty and algorithm per rule |
| **Fast Performance** | Runs as a native sidecar via Unix socket with minimal overhead |

---

## 🛠️ Installation & Setup

### Docker (Standard)
Anubis is **included** in the ShieldPM image and enabled by default.

Set the environment variable to control it:
```bash
ANUBIS_ENABLED=true  # (default)
ANUBIS_ENABLED=false # to disable globally
```

### Native / LXC Installation
Run the installer and select **Yes** when prompted to install Anubis:
```bash
bash scripts/install.sh
```

---

## 🖥️ UI Configuration (Per-Host)

### Enabling Anubis for a Host

1. Edit a **Proxy Host** in the ShieldPM UI.
2. Go to the **Security** tab (Shield icon).
3. Toggle **Anubis AI Firewall** to `ON`.
4. Configure your rules and click **Save**.

When Anubis is first enabled, ShieldPM automatically populates two default rules:

| Rule Name | Path | User Agent | Action |
| :--- | :--- | :--- | :--- |
| `block-ai-crawlers` | `.*` | `(?i)GPTBot\|CCBot\|...` | **DENY** |
| `challenge-browsers` | `.*` | `Mozilla` | **CHALLENGE** |

You can freely modify, delete, or add rules as needed.

---

### Rule Configuration Reference

Each Anubis rule supports the following fields:

| Field | Type | Description |
| :--- | :--- | :--- |
| **Name** | `string` | Unique rule identifier (kebab-case). Exposed in Prometheus metrics. Auto-generated if empty. |
| **Path Regex** | `string` | Regular expression to match the request path. `.*` matches all paths. |
| **Action** | `enum` | What to do when the rule matches. See [Actions](#actions) below. |
| **User Agent Regex** | `string` | Regular expression to match the `User-Agent` header. Leave empty to match all agents. |
| **Remote Addresses** | `string[]` | Comma-separated list of CIDR ranges (e.g. `10.0.0.0/8, 192.168.1.0/24`). Only match requests from these IPs. |
| **Challenge Difficulty** | `integer` | Number of leading zeros required for PoW (1-16). Default: `4`. Higher = harder. Only applies to `CHALLENGE` action. |
| **Challenge Algorithm** | `enum` | Challenge method to use. Only applies to `CHALLENGE` action. See [Challenge Types](#challenge-types) below. |

> [!TIP]
> Click the **expand arrow** (▼) on each rule to see advanced settings like Remote Addresses and Challenge configuration.

---

### Actions

| Action | Effect |
| :--- | :--- |
| **ALLOW** | Bypass all further checks and forward the request directly to the backend. Use this for trusted bots (e.g. Googlebot) or internal networks. |
| **DENY** | Block the request and send a fake "success" page that tricks scrapers into thinking they loaded the content. |
| **CHALLENGE** | Show a Proof-of-Work challenge page. The browser must solve a cryptographic puzzle before accessing the site. Once solved, a cookie is set that lasts **7 days**. |

> [!IMPORTANT]
> Rules are evaluated **top to bottom**. The **first matching rule wins**. Place more specific rules (like ALLOW for Googlebot) above general rules (like CHALLENGE for all Mozilla).

---

### Challenge Types

When using the `CHALLENGE` action, you can choose different challenge algorithms:

| Algorithm | Description | Use Case |
| :--- | :--- | :--- |
| **fast** (default) | Standard SHA-256 Proof-of-Work. Solves in 1-3 seconds at difficulty 4. | General browser protection |
| **slow** | Intentionally wastes CPU cycles. Much slower to solve. | Punishing known bot patterns |
| **metarefresh** | Uses HTML `<meta http-equiv="refresh">` redirect. No JavaScript required. | Low-resource clients |
| **preact** | Lightweight JavaScript challenge using Preact framework. | Alternative JS challenge |

**Difficulty Scale:**

| Difficulty | Solve Time (approx.) | Use Case |
| :--- | :--- | :--- |
| 1-4 | < 3 seconds | Normal users |
| 5-8 | 3-30 seconds | Suspicious traffic |
| 9-12 | 30s - 5 minutes | Aggressive deterrent |
| 13-16 | Minutes to hours | Effectively impossible |

---

## 📋 Example Configurations

### Basic: Block AI Crawlers + Challenge Browsers

This is the **default configuration** when you enable Anubis:

| # | Name | Path | User Agent | Action |
| :--- | :--- | :--- | :--- | :--- |
| 1 | `block-ai-crawlers` | `.*` | `(?i)GPTBot\|CCBot\|Anthropic-ai` | DENY |
| 2 | `challenge-browsers` | `.*` | `Mozilla` | CHALLENGE |

### Protect Admin Area

| # | Name | Path | User Agent | Action | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | `allow-internal` | `.*` | | ALLOW | Remote: `10.0.0.0/8` |
| 2 | `block-admin` | `^/admin/.*` | | DENY | Block external admin access |
| 3 | `challenge-all` | `.*` | `Mozilla` | CHALLENGE | Difficulty: 8 |

### Allow Specific Search Engines

| # | Name | Path | User Agent | Action |
| :--- | :--- | :--- | :--- | :--- |
| 1 | `allow-google` | `.*` | `Googlebot` | ALLOW |
| 2 | `allow-bing` | `.*` | `Bingbot` | ALLOW |
| 3 | `block-scrapers` | `.*` | `(?i)GPTBot\|CCBot` | DENY |
| 4 | `challenge-rest` | `.*` | `Mozilla` | CHALLENGE |

### API Protection

| # | Name | Path | User Agent | Action | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | `allow-api-keys` | `^/api/.*` | | ALLOW | Remote: `203.0.113.0/24` |
| 2 | `challenge-api` | `^/api/.*` | `Mozilla` | CHALLENGE | Difficulty: 12, Algorithm: slow |
| 3 | `allow-static` | `^/static/.*` | | ALLOW | |
| 4 | `challenge-site` | `.*` | `Mozilla` | CHALLENGE | |

---

## 🔧 How it Works (Architecture)

```
                ┌─────────────┐
  Client  ───► │    Nginx     │
  Request      │  (Frontend)  │
                └──────┬──────┘
                       │ proxy_pass unix:/run/anubis/nginx.sock
                       ▼
                ┌─────────────┐
                │   Anubis    │ ◄── Evaluates rules from policy.yaml
                │  (Firewall) │
                └──────┬──────┘
                       │ If ALLOW or CHALLENGE passed:
                       │ forward to unix:/run/nginx/anubis-upstream.sock
                       ▼
                ┌─────────────┐
                │    Nginx    │
                │  (Backend)  │ ◄── Applies Nginx options (Caching, Buffering, etc.)
                └──────┬──────┘
                       │ proxy_pass to your service
                       ▼
                ┌─────────────┐
                │  Your App   │
                │ (upstream)  │
                └─────────────┘
```

**Key Points:**
- Anubis runs as a **sidecar process** on the same host.
- Communication uses **Unix sockets** for maximum speed (no TCP overhead).
- When you save a Proxy Host, ShieldPM automatically regenerates `policy.yaml` and sends `SIGHUP` to Anubis to reload.
- All Nginx options (Caching, Buffering, Block Exploits, WebSocket, Rate Limiting) work normally — they are applied in the **Backend** Nginx server block.

---

## ⚙️ Global Policy File

While the UI handles per-host rules, you can also manually define a **global policy** at `/data/anubis/policy.yaml`. ShieldPM automatically generates and manages this file from your UI settings.

> [!WARNING]
> **Do NOT manually edit** `/data/anubis/policy.yaml` — it will be overwritten every time you save a Proxy Host. Use the UI instead.

### Extracting Default Anubis Policy

To see Anubis's built-in default configuration:
```bash
# Inside the container or on the host
anubis -extract-resources /tmp/anubis-defaults
cat /tmp/anubis-defaults/botPolicies.yaml
```

---

## ❓ Troubleshooting

### Anubis is not starting
```bash
# Check logs (Docker)
docker logs shieldpm | grep -i anubis

# Check logs (Native/LXC)
journalctl -u shieldpm | grep -i anubis

# Check process
ps aux | grep anubis
```

### Challenge page not showing
1. **Clear cookies** or use **Incognito mode** — the challenge cookie lasts 7 days.
2. **Check rule order** — rules are evaluated top-to-bottom, first match wins.
3. **Verify policy** was regenerated:
   ```bash
   cat /data/anubis/policy.yaml
   ```
4. **Test with curl** (no cookies):
   ```bash
   curl -v -H "User-Agent: Mozilla/5.0" https://your-domain.com/
   ```
   You should see HTML with the Anubis challenge script, not a redirect.

### Changes not reflecting
- Anubis reloads automatically when you **Save** a Proxy Host.
- If you suspect a reload issue, restart the service:
  ```bash
  # Docker
  docker restart shieldpm

  # Native/LXC
  systemctl restart shieldpm
  ```

### Common Log Messages

| Message | Meaning |
| :--- | :--- |
| `starting up Anubis` | Anubis is initializing |
| `loading policy file` | Policy YAML is being read |
| `generating random key` | Normal warning — only relevant for multi-instance setups |
| `REDIRECT_DOMAINS is not set` | Normal warning — Anubis redirects to the same domain |
| `listening` | Anubis is ready and processing requests |

---

## 📚 Further Reading

- [Anubis Official Documentation](https://anubis.techaro.lol/docs)
- [Anubis GitHub Repository](https://github.com/TecharoHQ/anubis)
- [Default Bot Policies](https://github.com/TecharoHQ/anubis/blob/main/data/botPolicies.yaml)
- [Why Proof-of-Work?](https://anubis.techaro.lol/docs/design/why-proof-of-work)
