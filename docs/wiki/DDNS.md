# Dynamic DNS (DDNS)

ShieldPM includes a built-in Dynamic DNS (DDNS) client that can automatically update your DNS records when your public IP address changes. This eliminates the need for running separate containers like `ddclient` or `oznu/cloudflare-ddns`.

---

## 🏗️ Architecture

```
  ┌──────────────┐         ┌──────────────────────────────────┐
  │  ShieldPM     │────────▶│  IP Detection Service            │
  │  DDNS Client  │         │  (ipify.org / icanhazip.com)    │
  └──────┬───────┘         └──────────────────────────────────┘
         │                          │
         │ IP changed?              │ Current Public IP
         │◀─────────────────────────┘
         │
         │ YES → Update DNS
         ▼
  ┌──────────────────────────────────┐
  │  DNS Provider API                │
  │  ┌────────┐ ┌────────┐ ┌──────┐ │
  │  │Cloudfl.│ │DuckDNS │ │Custom│ │
  │  └────────┘ └────────┘ └──────┘ │
  └──────────────────────────────────┘
```

---

## Key Features

- **Dual Stack Support**: Updates both IPv4 (A records) and IPv6 (AAAA records) simultaneously.
- **Multiple Providers**: Support for Cloudflare, DuckDNS, and Custom HTTP endpoints.
- **GitOps Integration**: All DDNS configurations are automatically backed up and versioned if [GitOps](GitOps) is enabled.
- **Smart Polling**: Checks for IP changes every 60 seconds (configurable via code, default) and only triggers updates when necessary.

## Supported Providers

### 1. Cloudflare

Updates DNS records for domains managed by Cloudflare.

**Configuration:**

- **Zone ID**: The Zone ID of your domain (found in the Cloudflare Dashboard overview).
- **API Token**: A Cloudflare API Token (NOT the Global API Key) with the following permissions:
  - `Zone.DNS`: Edit
- **Domains**: Comma-separated list of subdomains to update (e.g., `vpn.example.com, home.example.com`).

### 2. DuckDNS

Updates a `*.duckdns.org` domain.

**Configuration:**

- **Token**: Your DuckDNS account token.
- **Domains**: Comma-separated list of subdomains (e.g., `my-home` for `my-home.duckdns.org`).

### 3. Custom / Webhook

Send a GET request to a custom URL when the IP changes. Useful for other providers that support update-via-URL (like DynDNS, No-IP) or for triggering webhooks.

**Configuration:**

- **Update URL**: The URL to request. You can use `{IP}` as a placeholder which will be replaced by the detected IP address.
  - Example: `https://dyn.example.com/update?hostname=myhome&myip={IP}`

## IP Detection

ShieldPM automatically detects your public IP addresses using external echo services:

- **IPv4**: `https://api.ipify.org`, `https://ipv4.icanhazip.com`
- **IPv6**: `https://api6.ipify.org`, `https://ipv6.icanhazip.com`

If you are behind a CGNAT (Carrier Grade NAT), IPv4 detection might return the carrier's shared IP, which is not reachable from the outside. However, IPv6 often works correctly in these scenarios.

## GitOps Backup & Restore

If you have configured **[GitOps Synchronization](GitOps)**, your DDNS providers are automatically:

- **Exported**: Saved as YAML files in the `ddns-providers/` folder of your Git repository.
- **Restored**: Automatically re-created when you run a "Restore" or "Import from Git" operation.

This ensures you can rebuild your entire stack without re-entering API tokens.
