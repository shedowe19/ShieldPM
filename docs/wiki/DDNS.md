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
- **Smart Polling**: Checks for IP changes on a fixed 60-second interval, coalesces overlapping passes and only updates changed records.

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

- **Update URL**: An HTTPS URL with one or more of the allow-listed placeholders `{IP}`, `{IPv4}`, `{IPv6}` and `{DOMAIN}`.
  - Example: `https://dyn.example.com/update?hostname=myhome&myip={IP}`

Custom callbacks are subject to an SSRF boundary: credentials embedded in URLs, HTTP, localhost, private/link-local,
reserved and metadata addresses are rejected. ShieldPM resolves and validates every DNS answer, pins the validated
address for the connection, and repeats validation on every redirect. Requests allow at most 3 redirects, 10 seconds,
a 4 KiB URL and a 64 KiB response. TLS certificate verification remains enabled.

## IP Detection

ShieldPM automatically detects your public IP addresses using external echo services:

- **IPv4**: `https://api.ipify.org?format=json`
- **IPv6**: `https://api6.ipify.org?format=json`

Only public unicast results are accepted. Provider errors stored in the database or written to logs are bounded and
redacted so that tokens, URL query strings and configured secret values do not leak.

If you are behind a CGNAT (Carrier Grade NAT), IPv4 detection might return the carrier's shared IP, which is not reachable from the outside. However, IPv6 often works correctly in these scenarios.

## GitOps Backup & Restore

If you have configured **[GitOps Synchronization](GitOps)**, your DDNS providers are automatically:

- **Exported**: Saved as YAML files in the `ddns-providers/` folder of your Git repository.
- **Restored**: Non-secret provider metadata can be re-created during a validated import.

GitOps snapshots deliberately redact credentials. Re-enter provider tokens through ShieldPM's encrypted settings after
a restore; do not commit tokens to the Git repository.
