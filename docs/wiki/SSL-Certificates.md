# SSL Certificates

ShieldPM makes managing SSL/TLS certificates easy with built-in support for **Let's Encrypt**, **DNS challenges**, **custom certificates**, and an **internal Certificate Authority**.

---

## 🏗️ Certificate Types

| Type                        | Automation    | Best For                       | Wildcard |
| :-------------------------- | :------------ | :----------------------------- | :------: |
| **Let's Encrypt (HTTP-01)** | ✅ Auto-renew | Public services, port 80 open  |    ❌    |
| **Let's Encrypt (DNS-01)**  | ✅ Auto-renew | Wildcards, port 80 blocked     |    ✅    |
| **Custom Certificate**      | ❌ Manual     | Corporate CAs, purchased certs |    ✅    |
| **Internal CA (ECDSA)**     | ✅ Auto-issue | Private/internal services      |    ✅    |

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
5. Click Save

> [!IMPORTANT]
> `ACME_EMAIL` is recommended so your ACME provider can contact you. ShieldPM can register without an email for providers that allow it; ZeroSSL's automatic registration and any EAB configuration require an email. See [Configuration](Configuration).

### DNS-01 Challenge (For Wildcards)

**Requirements:**

- API access to your DNS provider
- No port forwarding required

**Steps:**

1. Go to **SSL Certificates** → **Add SSL Certificate** → **Let's Encrypt via DNS**
2. Enter domain names (e.g., `*.example.com`)
3. Select your DNS provider from the dropdown
4. Enter the required API credentials, then save

### DNS Provider Examples

The dropdown is populated from `backend/certbot/dns-plugins.json`; check the current list in your deployment before configuring a provider. Examples present in this repository include:

| Provider             | Credential Format                       |
| :------------------- | :-------------------------------------- |
| **Cloudflare**       | API Token or Global API Key             |
| **DigitalOcean**     | API Token                               |
| **Google Cloud DNS** | Service Account JSON                    |
| **Hetzner**          | API Token                               |
| **OVH**              | Application Key + Secret + Consumer Key |
| **Namecheap**        | API Key + Username                      |
| **DuckDNS**          | Token                                   |
| **Linode**           | API Token                               |

> [!TIP]
> For Cloudflare, use an **API Token** (not Global API Key) with only the `Zone:DNS:Edit` permission for better security.

---

## 📂 Custom Certificates

Upload your own certificates from a corporate CA or a purchased provider:

1. Go to **SSL Certificates** → **Add SSL Certificate** → **Custom**
2. Choose **File Upload** (or **Paste Input**) and provide:
   - **Certificate** (`.pem` or `.crt`)
   - **Certificate Key** (`.key`)
   - **Intermediate Certificate** (optional, for chain)
3. Click Save
4. Assign to a Proxy Host in the SSL tab

ShieldPM validates the PEM data and checks that the certificate matches the private key before activating the uploaded files.

> [!WARNING]
> Custom certificates are **not auto-renewed**. Set a reminder to replace them before expiry.

---

## 🔒 SSL Options (Per Host)

| Option              | Description                             |             Recommended             |
| :------------------ | :-------------------------------------- | :---------------------------------: |
| **Force SSL**       | Redirect HTTP → HTTPS (308)             |                 ✅                  |
| **HTTP/2**          | Enable HTTP/2 protocol                  |                 ✅                  |
| **HSTS**            | Send `Strict-Transport-Security` header |            ✅ Production            |
| **HSTS Subdomains** | Include subdomains in HSTS              | ⚠️ Only if all subdomains use HTTPS |

---

## ⚙️ ACME Configuration

Fine-tune certificate behavior via environment variables:

| Variable             | Description                                                                                    | Default                                                                         |
| :------------------- | :--------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------ |
| `ACME_EMAIL`         | Registration email (recommended; required for ZeroSSL's email registration and when using EAB) | —                                                                               |
| `ACME_SERVER`        | Custom ACME server URL                                                                         | Let's Encrypt Production                                                        |
| `ACME_KEY_TYPE`      | `ecdsa` or `rsa`                                                                               | `ecdsa`                                                                         |
| `ACME_MUST_STAPLE`   | Request OCSP Must-Staple extension                                                             | `false`                                                                         |
| `ACME_OCSP_STAPLING` | Enable OCSP Stapling                                                                           | `false` (automatically enabled if `ACME_MUST_STAPLE=true`)                      |
| `CRT`                | Interval in hours between renewal checks                                                       | `23` after environment validation; internal fallback `72` if missing or invalid |
| `DEFAULT_CERT_ID`    | Default cert ID for unconfigured hosts                                                         | `0` (none)                                                                      |

### Alternative ACME Providers

You can use any ACME-compatible provider by setting `ACME_SERVER`:

| Provider                    | Server URL                                               |
| :-------------------------- | :------------------------------------------------------- |
| **Let's Encrypt** (default) | `https://acme-v02.api.letsencrypt.org/directory`         |
| **Let's Encrypt Staging**   | `https://acme-staging-v02.api.letsencrypt.org/directory` |
| **ZeroSSL**                 | `https://acme.zerossl.com/v2/DV90`                       |
| **Google Trust Services**   | `https://dv.acme-v02.api.pki.goog/directory`             |

Buypass [discontinued TLS/SSL and ACME certificate issuance](https://www.buypass.com/products/tls-ssl-certificates/discontinues-issuance-of-tls-ssl-certificates) in October 2025. If an existing installation uses its ACME directory in `ACME_SERVER`, switch to an issuing provider and obtain a replacement certificate before the existing one expires.

> [!TIP]
> Use **Let's Encrypt Staging** for testing to avoid hitting rate limits during development.

---

## 🔧 Troubleshooting

### "Failed to obtain certificate"

| Cause                                  | Fix                                                                                                          |
| :------------------------------------- | :----------------------------------------------------------------------------------------------------------- |
| Port 80 not reachable                  | Check firewall, router port forwarding                                                                       |
| Domain not pointing to server          | Verify DNS A/AAAA records                                                                                    |
| ACME provider requires an email or EAB | Configure the provider's required `ACME_EMAIL` and, where applicable, `ACME_EAB_KID` and `ACME_EAB_HMAC_KEY` |
| ACME rate limit exceeded               | Check the provider's retry guidance; use a staging endpoint for future test requests                         |

### "Certificate not renewing"

ShieldPM invokes `certbot renew` at startup and then every `CRT` hours (normally 23). Certbot decides which certificate is due for renewal; `CRT` does not set the expiry threshold. If renewal fails:

```bash
# Check certificate status
docker exec shieldpm certbot --config /etc/certbot.ini certificates

# Prefer the ShieldPM UI/API's Renew action for a single Let's Encrypt certificate.
# It also updates certificate metadata and reloads Nginx on success.
```

---

[🏠 Home](Home) | [🔑 Internal PKI](Internal-PKI) | [🐞 Report a Bug](https://github.com/shedowe19/ShieldPM/issues)
