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
4. Choose the **Certificate profile**: **Standard** or **Short-lived**
5. Check **Force SSL** (recommended)
6. Click Save

> [!IMPORTANT]
> `ACME_EMAIL` is recommended so your ACME provider can contact you. ShieldPM can register without an email for providers that allow it; ZeroSSL's automatic registration and any EAB configuration require an email. See [Configuration](Configuration).

### DNS-01 Challenge (For Wildcards)

**Requirements:**

- API access to your DNS provider
- No port forwarding required

**Steps:**

1. Go to **SSL Certificates** → **Add SSL Certificate** → **Let's Encrypt via DNS**
2. Enter domain names (e.g., `*.example.com`)
3. Choose the **Certificate profile**: **Standard** or **Short-lived**
4. Select your DNS provider from the dropdown
5. Enter the required API credentials, then save

### Standard or Short-lived

Administrators choose the global default under **Settings → Certificates / ACME**: select **Standard** or **Short-lived**, then save. The choice is stored in ShieldPM's database and applies to subsequent certificate operations immediately, without editing environment files or restarting the instance. Saving requires Certbot 4.0 or newer and validates its profile support; Short-lived also requires the configured ACME server to advertise `shortlived`. If validation fails, the previous setting remains active.

Saving Short-lived is also rejected if an active legacy Let's Encrypt certificate has no saved profile and contains more than 25 domain names, protecting its future renewal. Keep the global choice on Standard, or replace the affected certificates and remove the superseded legacy records after reassigning their hosts. Replacements can explicitly use Standard or split the names across Short-lived certificates with at most 25 names each. Certificates with an explicitly saved Standard profile do not block the change.

The global choice preselects the profile for new HTTP and DNS certificates, including **Request a New SSL Certificate** in host dialogs. You can override it for each new certificate. Once issued, that certificate keeps its saved profile even if the global default changes. The certificate list displays explicitly saved profiles for Let's Encrypt certificates; older records without profile metadata have no profile badge.

| Selection       | Behavior                                                                                                                 |
| :-------------- | :----------------------------------------------------------------------------------------------------------------------- |
| **Standard**    | Requests the CA's default profile and lifetime, clearing any previous Certbot profile options for this certificate.      |
| **Short-lived** | Requires the ACME profile `shortlived`. Let's Encrypt issues certificates valid for **160 hours (6 days and 16 hours)**. |

See the [Let's Encrypt profile documentation](https://letsencrypt.org/docs/profiles/) for the CA's current profile rules. Both choices require **Certbot 4.0 or newer**. Short-lived certificates are limited to **25 domain names** per certificate and require an ACME server offering `shortlived`. If the client or CA does not support the requested profile, issuance fails; ShieldPM does not silently obtain a Standard certificate instead.

The selection is saved with the certificate and reapplied during automatic and manual renewal. New API requests that omit the selection use the global default and save the resolved profile on the new certificate. To change an existing certificate with an explicit profile, request a new certificate with the other profile and assign it to the host.

The database default is Standard. Older certificates without profile metadata use the current global choice on renewal; saving the setting does not replace their current files or immediately issue new certificates. Upgrades preserve an explicitly saved global Standard or Short-lived choice and convert the obsolete internal `inherit` value to Standard.

Standard and Short-lived certificates can coexist on the same instance. This selection does not add support for requesting IP-address certificates in ShieldPM.

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

| Variable             | Description                                                                                    | Default                                                    |
| :------------------- | :--------------------------------------------------------------------------------------------- | :--------------------------------------------------------- |
| `ACME_EMAIL`         | Registration email (recommended; required for ZeroSSL's email registration and when using EAB) | —                                                          |
| `ACME_SERVER`        | Custom ACME server URL                                                                         | Let's Encrypt Production                                   |
| `ACME_KEY_TYPE`      | `ecdsa` or `rsa`                                                                               | `ecdsa`                                                    |
| `ACME_MUST_STAPLE`   | Request OCSP Must-Staple extension                                                             | `false`                                                    |
| `ACME_OCSP_STAPLING` | Enable OCSP Stapling                                                                           | `false` (automatically enabled if `ACME_MUST_STAPLE=true`) |
| `CRT`                | Configured hours between renewal checks; effective interval is capped at **12 hours**          | `23` configured; **12 hours** effective                    |
| `DEFAULT_CERT_ID`    | Default cert ID for unconfigured hosts                                                         | `0` (none)                                                 |

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

ShieldPM checks its managed Let's Encrypt certificates at startup and then at most every **12 hours**, calling `certbot renew` separately for each certificate with its saved profile. A valid `CRT` below 12 shortens that interval; a larger or invalid value still results in a 12-hour interval. Certbot decides when each certificate is due. A check does not force a new certificate; `CRT` does not set the expiry threshold. A failed renewal is logged without preventing checks of the other certificates. Keep HTTP challenge access or DNS credentials working for automatic Short-lived renewal. If renewal fails:

```bash
# Check certificate status
docker exec shieldpm certbot --config /etc/certbot.ini certificates

# Prefer the ShieldPM UI/API's Renew action for a single Let's Encrypt certificate.
# It also updates certificate metadata and reloads Nginx on success.
```

---

[🏠 Home](Home) | [🔑 Internal PKI](Internal-PKI) | [🐞 Report a Bug](https://github.com/shedowe19/ShieldPM/issues)
