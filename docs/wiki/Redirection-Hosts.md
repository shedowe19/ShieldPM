# Redirection & Dead Hosts

Sometimes you don't want to proxy traffic to a service, but rather redirect it or block it.

## ➡️ Redirection Hosts

Use these to forward traffic from one domain to another URL.

### Status Codes
*   **301 (Permanent):** Use this if the move is permanent. Browsers (and search engines) will cache this redirect aggressively.
    *   *Example:* Moving from `old-site.com` to `new-site.com`.
*   **302 (Found / Temporary):** Use this if the redirect is temporary or subject to change.
    *   *Example:* Maintenance redirect or short-links.

### Usage
1.  **Domain Names:** The source domain (e.g., `short.io`).
2.  **Forward Scheme/Host/Port:** Ignored for Redirections.
3.  **Advanced:** Look for the "Redirection" inputs.
    *   **Forward URL:** The destination (e.g., `https://google.com`).
    *   **Preserve Path:** If checked, `short.io/foo` redirects to `google.com/foo`.

## 💀 Dead Hosts (404)

Use these to explicitly **block** a domain or handle wildcard catch-alls.

### Usage
1.  Create a **404 Host**.
2.  **Domain Names:** Enter the domain (e.g., `*.example.com` to catch all undefined subdomains).
3.  **Result:** Any request to this domain will immediately return a `404 Not Found` error page (or `444 No Response` if configured in `compose.yaml`), without hitting any backend.

This is excellent for security to prevent domain hijacking or scanning of undefined subdomains.

---
[🏠 Home](Home) | [🐞 Report a Bug](https://github.com/shedowe19/NPMplus/issues) | [💬 Discord](https://discord.gg/y8DhYhv427)
