# Redirection & Dead Hosts

Sometimes you don't want to proxy traffic to a backend service, but rather **redirect** it to another URL or **block** it entirely.

---

## ➡️ Redirection Hosts

Redirection Hosts forward visitors from one domain to another URL using an HTTP redirect.

### When to Use

| Scenario | Status Code | Example |
| :--- | :--- | :--- |
| Domain moved permanently | **301** (Permanent) | `old-site.com` → `new-site.com` |
| Temporary redirect | **302** (Temporary) | Maintenance pages, short links |
| Brand consolidation | **301** (Permanent) | `brand-old.com` → `brand-new.com` |
| Non-www to www | **301** (Permanent) | `example.com` → `www.example.com` |

### Configuration

1. Navigate to **Redirection Hosts** in the sidebar
2. Click **Add Redirection Host**
3. Fill in:

| Field | Description | Example |
| :--- | :--- | :--- |
| **Domain Names** | The source domain(s) to redirect from | `old-site.com` |
| **Forward HTTP Code** | `301` (Permanent) or `302` (Temporary) | `301` |
| **Forward Domain Name** | The destination URL | `https://new-site.com` |
| **Preserve Path** | Append the original path to the destination | ✅ |

### How "Preserve Path" Works

| Preserve Path | User visits | Redirected to |
| :--- | :--- | :--- |
| ❌ Off | `old.com/blog/post-1` | `https://new.com` |
| ✅ On | `old.com/blog/post-1` | `https://new.com/blog/post-1` |

> [!TIP]
> Use **Preserve Path** when both the old and new sites have the same URL structure. This ensures bookmarks and search engine links continue to work.

### SSL for Redirections

You can assign an SSL certificate to a Redirection Host so that both `http://` and `https://` requests on the source domain are properly redirected. Without SSL, only HTTP requests will be caught.

---

## 💀 Dead Hosts (404)

Dead Hosts explicitly **block** traffic to a domain, returning an error page instead of proxying anywhere.

### When to Use

- **Catch-all wildcard:** Block all undefined subdomains (e.g., `*.example.com`)
- **Domain parking:** Domains you own but don't want to serve content on
- **Security:** Prevent scanning of unused subdomains
- **Phishing prevention:** Block domains that could be confused with yours

### Configuration

1. Navigate to **404 Hosts** in the sidebar
2. Click **Add Dead Host**
3. Enter the domain name(s) to block

### Behavior

| Scenario | Result |
| :--- | :--- |
| Request to blocked domain | `404 Not Found` error page |
| Using `INITIAL_DEFAULT_PAGE=444` | Connection immediately closed (no response body) |
| Wildcard `*.example.com` | All undefined subdomains return 404 |

> [!TIP]
> **Security Best Practice:** Create a Dead Host with `*.yourdomain.com` to block all subdomains you haven't explicitly configured. This prevents attackers from discovering services through subdomain enumeration.

### SSL for Dead Hosts

You can also assign an SSL certificate to Dead Hosts. This ensures that even HTTPS requests to blocked domains receive a proper 404 response instead of a certificate error.

---

[🏠 Home](Home) | [🔀 Proxy Hosts](Proxy-Hosts) | [🐞 Report a Bug](https://github.com/shedowe19/ShieldPM/issues)
