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

ModSecurity is wired to the Proxy Host's **Block Exploits** option:

1. Edit a Proxy Host
2. In **Details**, find **Options**
3. Enable **Block Exploits**
4. Save

The generated Nginx configuration enables `modsecurity on` when **Block Exploits** is set (and also in demo mode). It chooses `modsecurity-crs.conf` for a host with caching enabled and `modsecurity.conf` otherwise. The included rule files come from the Nginx base image; check the active file before assuming that every CRS rule is loaded.

> [!TIP]
> Start by enabling ModSecurity on your most sensitive services first (login pages, admin panels, APIs). Monitor logs before enabling it globally to avoid false positives.

---

## ⚙️ Paranoia Levels

The Paranoia Level (PL) controls how aggressively OWASP CRS rules inspect traffic. ShieldPM does not expose a separate PL selector in the Proxy Host editor; changes to CRS settings require editing the mounted ModSecurity configuration and checking the active rule include.

| Level | False Positives | Security | Best For |
| :--- | :--- | :--- | :--- |
| **PL1** | Low | Good | Most applications |
| **PL2** | Medium | High | E-commerce, sensitive APIs |
| **PL3** | High | Very High | Banking, healthcare |
| **PL4** | Very High | Maximum | Security-critical systems |

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
grep "ModSecurity" /data/logs/error.log
```

Look for the rule ID in the log entry: `id "920350"`.

### Step 2: Exclude the Rule

Prefer the persistent exclusion files provisioned under `/data/modsecurity/` (`REQUEST-900-EXCLUSION-RULES-BEFORE-CRS.conf` for rules before CRS, or `RESPONSE-999-EXCLUSION-RULES-AFTER-CRS.conf` for response exclusions), and verify your Nginx base image's rule includes. A host-specific advanced Nginx directive is possible only in a context where `modsecurity_rules` is valid:

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

| Plugin | Purpose |
| :--- | :--- |
| **WordPress** | Excludes WP admin AJAX and editor requests |
| **Nextcloud** | Excludes WebDAV and file upload patterns |
| **phpMyAdmin** | Excludes SQL-heavy admin requests |
| **Drupal** | Excludes Drupal-specific form patterns |

### Enabling Plugins

1. Check the plugin files copied to `/data/modsecurity/crs-plugins/` at startup, and add or configure the plugin following its own installation instructions.
2. Confirm that the active CRS include loads that plugin, then validate and reload Nginx. Merely placing a file in that directory does not guarantee it is executed.

> [!NOTE]
> Plugin files must follow CRS naming conventions. See the [OWASP CRS Plugins](https://github.com/coreruleset/wordpress-rule-exclusions-plugin) repository for available plugins.

---

## 📁 File Locations

| File | Path | Description |
| :--- | :--- | :--- |
| CRS Rules | `/usr/local/nginx/conf/conf.d/include/coreruleset/` | OWASP Core Rule Set |
| Custom Rules | `/data/modsecurity/` | Custom rules and exclusions |
| Plugins | `/data/modsecurity/crs-plugins/` | CRS application-specific plugins |

The startup script also seeds `/data/modsecurity/modsecurity-default.conf`, `crs-setup.conf`, and the `REQUEST-900` / `RESPONSE-999` exclusion files from examples when missing. These are persistent files; inspect the include paths in your Nginx image before editing them.

---

[🏠 Home](Home) | [🛡️ Security Overview](Security) | [🐞 Report a Bug](https://github.com/shedowe19/ShieldPM/issues)
