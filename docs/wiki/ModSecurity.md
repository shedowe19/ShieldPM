# ModSecurity (WAF)

ModSecurity is a Web Application Firewall that inspects incoming HTTP requests for malicious payloads using the **OWASP Core Rule Set (CRS v4)**.

---

## 🏗️ Architecture

```
  ┌──────────┐       ┌──────────────────────────────────────────────┐
  │  Client   │──────▶│                  Nginx                       │
  └──────────┘       │  ┌──────────────────────────────────────┐    │
                     │  │     ModSecurity Module                │    │
                     │  │                                      │    │
                     │  │  ┌──────────────┐  ┌──────────────┐  │    │
                     │  │  │ CRS v4       │  │ Custom Rules │  │    │
                     │  │  │ (OWASP)      │  │ (Exclusions) │  │    │
                     │  │  └──────┬───────┘  └──────┬───────┘  │    │
                     │  │         │                  │          │    │
                     │  │         ▼                  ▼          │    │
                     │  │  ┌────────────────────────────────┐  │    │
                     │  │  │ Decision: ALLOW / BLOCK (403)  │  │    │
                     │  │  └────────────────────────────────┘  │    │
                     │  └──────────────────────────────────────┘    │
                     └──────────────────────────────────────────────┘
```

---

## 🚀 Activation

ModSecurity can be enabled on a **per-host basis**:

1. Edit a Proxy Host
2. Go to the **Details** tab
3. Toggle **ModSecurity** → ON
4. Save

> [!TIP]
> Start by enabling ModSecurity on your most sensitive services first (login pages, admin panels, APIs). Monitor logs before enabling it globally to avoid false positives.

---

## ⚙️ Paranoia Levels

The Paranoia Level (PL) controls how aggressively the WAF inspects traffic:

| Level             | False Positives | Security  | Best For                   |
| :---------------- | :-------------- | :-------- | :------------------------- |
| **PL1** (Default) | Low             | Good      | Most applications          |
| **PL2**           | Medium          | High      | E-commerce, sensitive APIs |
| **PL3**           | High            | Very High | Banking, healthcare        |
| **PL4**           | Very High       | Maximum   | Security-critical systems  |

> [!WARNING]
> PL2 and above will likely block legitimate traffic from complex applications like Nextcloud, WordPress, or Grafana. Always test thoroughly and prepare exclusion rules before increasing the paranoia level.

---

## 🔧 Handling False Positives

If a legitimate request is blocked (HTTP 403 Forbidden):

### Step 1: Find the Rule ID

Check the Nginx error log for the `ModSecurity: Access denied` message:

```bash
# Docker
docker logs shieldpm 2>&1 | grep "ModSecurity"

# Native / LXC
grep "ModSecurity" /data/nginx/error.log
```

Look for the rule ID in the log entry: `id "920350"`.

### Step 2: Exclude the Rule

Add an exclusion in the Proxy Host's **Advanced Config** tab:

```nginx
# Exclude a single rule
modsecurity_rules '
  SecRuleRemoveById 920350
';
```

```nginx
# Exclude multiple rules
modsecurity_rules '
  SecRuleRemoveById 920350
  SecRuleRemoveById 941100
  SecRuleRemoveById 942100
';
```

### Step 3: Verify

Reload the page and check that the request now passes through.

---

## 🧩 CRS Plugins

CRS includes plugins for common applications that reduce false positives:

| Plugin         | Purpose                                    |
| :------------- | :----------------------------------------- |
| **WordPress**  | Excludes WP admin AJAX and editor requests |
| **Nextcloud**  | Excludes WebDAV and file upload patterns   |
| **phpMyAdmin** | Excludes SQL-heavy admin requests          |
| **Drupal**     | Excludes Drupal-specific form patterns     |

### Enabling Plugins

1. Place plugin files in `/data/modsecurity/crs-plugins/`
2. Restart ShieldPM to apply

> [!NOTE]
> Plugin files must follow CRS naming conventions. See the [OWASP CRS Plugins](https://github.com/coreruleset/wordpress-rule-exclusions-plugin) repository for available plugins.

---

## 📁 File Locations

| File         | Path                                                | Description                      |
| :----------- | :-------------------------------------------------- | :------------------------------- |
| CRS Rules    | `/usr/local/nginx/conf/conf.d/include/coreruleset/` | OWASP Core Rule Set              |
| Custom Rules | `/data/modsecurity/`                                | Custom rules and exclusions      |
| Plugins      | `/data/modsecurity/crs-plugins/`                    | CRS application-specific plugins |

---

[🏠 Home](Home) | [🛡️ Security Overview](Security) | [🐞 Report a Bug](https://github.com/shedowe19/ShieldPM/issues)
