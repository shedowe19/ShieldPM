# SSL Certificates

ShieldPM makes managing SSL/TLS certificates easy with built-in support for **Let's Encrypt**, **DNS challenges**, **custom certificates**, and an **internal Certificate Authority**.

---

## 🏗️ Certificate Types

| Type | Automation | Best For | Wildcard |
| :--- | :--- | :--- | :---: |
| **Let's Encrypt (HTTP-01)** | ✅ Auto-renew | Public services, port 80 open | ❌ |
| **Let's Encrypt (DNS-01)** | ✅ Auto-renew | Wildcards, port 80 blocked | ✅ |
| **Custom Certificate** | ❌ Manual | Corporate CAs, purchased certs | ✅ |
| **Internal CA (ECDSA)** | ✅ Auto-issue | Private/internal services | ✅ |

---

## 🆕 Let's Encrypt Certificates

### HTTP-01 Challenge (Simplest)

**Requirements:**

- Port 80 must be reachable from the internet
- Domain must point to your ShieldPM server's IP

**Steps:**

1. Create or edit a Proxy Host
2. Go to the **SSL** tab
3. Select **Request a New SSL Certificate**
4. Check **Force SSL** (recommended)
5. Agree to the Let's Encrypt Terms of Service
6. Click Save

> [!IMPORTANT]
> You must set `ACME_EMAIL` in your environment before requesting certificates. See [Configuration](Configuration).

### DNS-01 Challenge (For Wildcards)

**Requirements:**

- API access to your DNS provider
- No port forwarding required

**Steps:**

1. Go to **SSL Certificates** → **Add SSL Certificate**
2. Enter domain names (e.g., `*.example.com`)
3. Check **Use a DNS Challenge**
4. Select your DNS provider from the dropdown
5. Enter the required API credentials

### Supported DNS Providers

| Provider | Credential Format |
| :--- | :--- |
| **Cloudflare** | API Token or Global API Key |
| **DigitalOcean** | API Token |
| **Route53 (AWS)** | Access Key + Secret Key |
| **Google Cloud DNS** | Service Account JSON |
| **Hetzner** | API Token |
| **OVH** | Application Key + Secret + Consumer Key |
| **Namecheap** | API Key + Username |
| **DuckDNS** | Token |
| **Name.com** | API Token + Username |
| **Linode** | API Token |

> [!TIP]
> For Cloudflare, use an **API Token** (not Global API Key) with only the `Zone:DNS:Edit` permission for better security.

---

## 📂 Custom Certificates

Upload your own certificates from a corporate CA or a purchased provider:

1. Go to **SSL Certificates** → **Add SSL Certificate** → **Custom**
2. Upload:
   - **Certificate** (`.pem` or `.crt`)
   - **Certificate Key** (`.key`)
   - **Intermediate Certificate** (optional, for chain)
3. Click Save
4. Assign to a Proxy Host in the SSL tab

> [!WARNING]
> Custom certificates are **not auto-renewed**. Set a reminder to replace them before expiry.

---

## 🔒 SSL Options (Per Host)

| Option | Description | Recommended |
| :--- | :--- | :---: |
| **Force SSL** | Redirect all HTTP → HTTPS (301) | ✅ |
| **HTTP/2** | Enable HTTP/2 protocol | ✅ |
| **HSTS** | Send `Strict-Transport-Security` header | ✅ Production |
| **HSTS Subdomains** | Include subdomains in HSTS | ⚠️ Only if all subdomains use HTTPS |

---

## ⚙️ ACME Configuration

Fine-tune certificate behavior via environment variables:

| Variable | Description | Default |
| :--- | :--- | :--- |
| `ACME_EMAIL` | Registration email (required) | — |
| `ACME_SERVER` | Custom ACME server URL | Let's Encrypt Production |
| `ACME_KEY_TYPE` | `ec` (ECDSA) or `rsa` | `ec` |
| `ACME_MUST_STAPLE` | Request OCSP Must-Staple extension | `false` |
| `ACME_OCSP_STAPLING` | Enable OCSP Stapling | `true` |
| `CRT` | Renewal threshold in hours | `72` |
| `DEFAULT_CERT_ID` | Default cert ID for unconfigured hosts | — |

### Alternative ACME Providers

You can use any ACME-compatible provider by setting `ACME_SERVER`:

| Provider | Server URL |
| :--- | :--- |
| **Let's Encrypt** (default) | `https://acme-v02.api.letsencrypt.org/directory` |
| **Let's Encrypt Staging** | `https://acme-staging-v02.api.letsencrypt.org/directory` |
| **ZeroSSL** | `https://acme.zerossl.com/v2/DV90` |
| **Buypass** | `https://api.buypass.com/acme/directory` |
| **Google Trust Services** | `https://dv.acme-v02.api.pki.goog/directory` |

> [!TIP]
> Use **Let's Encrypt Staging** for testing to avoid hitting rate limits during development.

---

## 🔧 Troubleshooting

### "Failed to obtain certificate"

| Cause | Fix |
| :--- | :--- |
| Port 80 not reachable | Check firewall, router port forwarding |
| Domain not pointing to server | Verify DNS A/AAAA records |
| `ACME_EMAIL` not set | Set it in environment |
| Rate limit exceeded | Wait 1 hour or use Staging |

### "Certificate not renewing"

Certificates auto-renew when less than `CRT` hours remain (default: 72h). If renewal fails:

```bash
# Check certificate status
docker exec shieldpm certbot certificates

# Force renewal attempt
docker exec shieldpm certbot renew --force-renewal
```

---

[🏠 Home](Home) | [🔑 Internal PKI](Internal-PKI) | [🐞 Report a Bug](https://github.com/shedowe19/ShieldPM/issues)
