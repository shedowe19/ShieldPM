# ModSecurity (WAF)

ModSecurity is a Web Application Firewall that inspects incoming HTTP requests for malicious payloads (SQL Injection, XSS, etc.) using the **OWASP Core Rule Set (CRS)**.

## 🚀 Activation

1.  **Global Enable:** Ensure `NGINX_MODSECURITY_ENABLED=true` (default is false/optional depending on build) or simply rely on per-host toggles.
2.  **Per Host:** In any Proxy Host, go to the **Details** tab and toggle **ModSecurity** ON.

## ⚙️ Configuration

ModSecurity configuration files are located in `/opt/npmplus/modsecurity`.

### CRS Setup
The Core Rule Set is located in `/usr/local/nginx/conf/conf.d/include/coreruleset`.

### Paranoia Level
The Paranoia Level (PL) determines how aggressive the WAF is.
*   **PL1 (Default):** Low false positives. Good starting point.
*   **PL2+:** Higher security, but likely to block legitimate traffic (e.g., complex forms in Nextcloud/Wordpress).

To change it, you typically need to edit the `crs-setup.conf` (if exposed) or inject variables.

### Handling False Positives
If a legitimate request is blocked (403 Forbidden):

1.  **Check Logs:** Look at `/opt/npmplus/nginx/error.log`. Search for `ModSecurity: Access denied`.
2.  **Identify Rule ID:** Note the `id "xxxxxx"`.
3.  **Exclude Rule:**
    You can disable a specific rule for a specific host using **Custom Nginx Config**:
    ```nginx
    modsecurity_rules '
      SecRuleRemoveById 920350
    ';
    ```

## 🧩 Plugins
You can enable CRS plugins (e.g., for WordPress / Nextcloud exclusions) by placing them in `/opt/npmplus/modsecurity/crs-plugins` and enabling them in the config.

---
[🏠 Home](Home) | [🐞 Report a Bug](https://github.com/shedowe19/NPMplus/issues)
