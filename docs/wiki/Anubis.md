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
Extract a full native/LXC installer release package, run its bundled `install.sh`, and select **Yes** when prompted to install Anubis. The source checkout's `scripts/install.sh` requires the prebuilt release payload beside it and is not a standalone install script.

---

## 🖥️ UI Configuration (Per-Host)

### Enabling Anubis for a Host

1. Edit a **Proxy Host** in the ShieldPM UI.
2. Go to the **Security** tab (Shield icon).
3. Toggle **Anubis AI Firewall** to `ON`.
4. Configure your rules and click **Save**.

Enabling Anubis does **not** populate custom rules. Add the rules you need under **Anubis rules**. ShieldPM writes the rules of active, Anubis-enabled Proxy Hosts to `/data/anubis/policy.yaml`. If there are no configured rules, ShieldPM writes a single placeholder rule that matches only `AnubisPlaceholderBot`; do not rely on that placeholder for crawler protection.

---

### Rule Configuration Reference

Each Anubis rule supports the following fields:

| Field | Type | Description |
| :--- | :--- | :--- |
| **Name** | `string` | Rule identifier. ShieldPM generates one if omitted; choose a unique name for clarity. |
| **Path Regex** | `string` | Regular expression to match the request path. `.*` matches all paths. |
| **Action** | `enum` | What to do when the rule matches. See [Actions](#actions) below. |
| **User Agent Regex** | `string` | Regular expression to match the `User-Agent` header. Leave empty to match all agents. |
| **Remote Addresses** | `string[]` | Comma-separated CIDR ranges (e.g. `10.0.0.0/8, 192.168.1.0/24`). Only match requests from these IPs. |
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
| **CHALLENGE** | Show an Anubis challenge. Cookie lifetime and challenge behavior depend on the installed Anubis binary and its configuration. |

> [!IMPORTANT]
> Rules are evaluated **top to bottom**. The **first matching rule wins**. Place more specific rules (like ALLOW for Googlebot) above general rules (like CHALLENGE for all Mozilla).

---

### Challenge Types

When using the `CHALLENGE` action, you can choose different challenge algorithms:

| Algorithm | Description | Use Case |
| :--- | :--- | :--- |
| **fast** (default in the UI) | Proof-of-Work challenge. | General browser protection |
| **slow** | Intentionally wastes CPU cycles. Much slower to solve. | Punishing known bot patterns |
| **metarefresh** | Uses HTML `<meta http-equiv="refresh">` redirect. No JavaScript required. | Low-resource clients |
| **preact** | Lightweight JavaScript challenge using Preact framework. | Alternative JS challenge |

**Difficulty:** The UI accepts values from 1 to 16. Actual solving time depends on the client's hardware and the installed Anubis version; test your policy before using high values.

---

## 📋 Example Configurations

### Basic: Block AI Crawlers + Challenge Browsers

This is an **example to add manually** after enabling Anubis:

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
                       │ proxy_pass unix:/run/shieldpm/anubis.sock
                       ▼
                ┌─────────────┐
                │   Anubis    │ ◄── Evaluates rules from policy.yaml
                │  (Firewall) │
                └──────┬──────┘
                       │ If ALLOW or CHALLENGE passed:
                       │ forward to unix:/run/shieldpm/anubis-upstream.sock
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
- Changes to Proxy Hosts schedule policy regeneration (debounced by 2 seconds); ShieldPM then sends `SIGHUP` to Anubis.
- All Nginx options (Caching, Buffering, Block Exploits, WebSocket, Rate Limiting) work normally — they are applied in the **Backend** Nginx server block.

---

## ⚙️ Global Policy File

The UI manages per-host rules. ShieldPM generates `/data/anubis/policy.yaml` from enabled hosts; the launch script passes this file to Anubis when present.

> [!WARNING]
> **Do NOT manually edit** `/data/anubis/policy.yaml` — a later policy generation can overwrite your changes. Use the UI instead.

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
1. **Clear cookies** or use **Incognito mode** — a valid challenge cookie may bypass another challenge.
2. **Check rule order** — rules are evaluated top-to-bottom, first match wins.
3. **Verify policy** was regenerated:
   ```bash
   cat /data/anubis/policy.yaml
   ```
4. **Test with curl** (no cookies) using a User-Agent and path that match one of your rules:
   ```bash
   curl -v -H "User-Agent: Mozilla/5.0" https://your-domain.com/
   ```
   Check the response against your configured action; a placeholder-only policy will not challenge this request.

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
