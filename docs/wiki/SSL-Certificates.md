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
> Configure the CA, registration email and any External Account Binding (EAB) credentials under **Settings → Certificates / ACME**. Providers that allow it can register without an email; ZeroSSL's automatic registration and EAB require one. Registration happens when a certificate operation needs the account, so a provider failure does not block the administration UI. See [Configuration](Configuration).

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

Use **Settings → Certificates / ACME** to choose the key type (`ecdsa` or `rsa`) and the renewal check interval (1–12 whole hours). The defaults are ECDSA and 12 hours. Saving applies without restarting: the key type is used on the next issuance or renewal, including existing lineages, and the interval replaces the running timer. Neither change immediately issues a new certificate. An automatic renewal batch already in progress keeps its initial key type; a saved change applies to the next batch. Existing `ACME_KEY_TYPE` and `CRT` values are imported once on upgrade when the database setting is created; afterward, use the UI.

The same tab manages the remaining ACME and default-TLS settings:

| Option                        | Behavior                                                                                                                        |
| :---------------------------- | :------------------------------------------------------------------------------------------------------------------------------ |
| **CA directory**              | Let's Encrypt production/staging, ZeroSSL or a custom ACME directory; applies to new certificates                               |
| **Registration email**        | Used for the actual ACME account; required with EAB and ZeroSSL's automatic EAB registration                                    |
| **Account ID**                | Optional Certbot account selection for the chosen CA; required when multiple existing accounts cannot be selected automatically |
| **EAB credentials**           | Keep the saved pair, replace both values, or explicitly clear it; the HMAC key is write-only and stored encrypted               |
| **Terms agreement**           | Required for account registration; upgrades retain the previous agreement                                                       |
| **Verify CA TLS**             | Enabled by default; controls the next ACME connection, including existing-certificate operations                                |
| **Must-Staple**               | Requests the extension on the next issuance or renewal and enables ACME OCSP stapling; unavailable with Let's Encrypt           |
| **ACME/custom OCSP stapling** | Enables stapling for the respective certificate type when the issuer supports OCSP                                              |
| **Default certificate**       | Selects the default TLS certificate; `0` uses ShieldPM's dummy certificate                                                      |

EAB secrets are never returned by GET, audit events or GitOps export. Leaving the replacement fields blank retains the saved credentials; use the explicit clear action to remove them. When changing the CA or EAB identity, replace the matching pair or clear it. ZeroSSL can obtain EAB credentials from the registration email when no pair is supplied.

Changing the CA affects new certificates. Existing certificates retain their original CA and account for renewal and revocation from their Certbot lineage; any saved issuer metadata must match it. To move an existing certificate to another CA, issue a replacement and reassign its hosts. Account registration is performed in the backend when needed, and email changes are applied to the account.

Leave Account ID empty to use a single matching account or register a new one if none exists. Select the desired ID when the CA directory has multiple accounts. Invalid or ambiguous account selection fails the certificate operation while the administration UI remains available.

To delete a certificate selected as the default, first save another default selection (or `0` for the dummy certificate). If an imported selection is unavailable at startup, ShieldPM uses the dummy pair and keeps the saved selection visible for correction in Settings.

OCSP and default-certificate changes regenerate, validate and reload the affected Nginx configuration without a restart. A failed activation restores the previous setting and configuration. Other ACME options apply to subsequent certificate operations; saving alone does not issue or force-renew a certificate or update an account contact. TLS verification and Must-Staple are global policies even for existing lineages: their original CA/account remain unchanged, but enabling verification can cause renewal against an untrusted private CA to fail.

Turning off the Must-Staple request option does not remove the extension from an already issued certificate. ShieldPM rejects disabling the corresponding OCSP setting while an active host, stream or selected default uses a Must-Staple certificate. Keep OCSP enabled, renew or replace those certificates without Must-Staple, then disable OCSP.

Let's Encrypt [stopped accepting Must-Staple requests in 2025](https://letsencrypt.org/2024/12/05/ending-ocsp/) and [closed its OCSP service on August 6, 2025](https://letsencrypt.org/2025/08/06/ocsp-service-has-reached-end-of-life/). Keep both options disabled for Let's Encrypt; ShieldPM rejects Must-Staple with its production and staging directories. Enable these options for another CA only when it supports them.

On upgrade, the ACME-options migration imports the old `ACME_SERVER`, `ACME_EMAIL`, `ACME_EAB_KID`, `ACME_EAB_HMAC_KEY`, `ACME_MUST_STAPLE`, `ACME_OCSP_STAPLING`, `ACME_SERVER_TLS_VERIFY`, `CUSTOM_OCSP_STAPLING` and `DEFAULT_CERT_ID` values once for a missing settings row. Existing saved settings remain authoritative. Invalid old server, email or EAB combinations remain visible for repair rather than silently selecting a different CA. After migration, remove these retired variables and manage the values in the UI.

### Alternative ACME Providers

Choose a preset or enter the ACME directory under **Settings → Certificates / ACME**:

| Provider                    | Server URL                                               |
| :-------------------------- | :------------------------------------------------------- |
| **Let's Encrypt** (default) | `https://acme-v02.api.letsencrypt.org/directory`         |
| **Let's Encrypt Staging**   | `https://acme-staging-v02.api.letsencrypt.org/directory` |
| **ZeroSSL**                 | `https://acme.zerossl.com/v2/DV90`                       |
| **Google Trust Services**   | `https://dv.acme-v02.api.pki.goog/directory`             |

Buypass [discontinued TLS/SSL and ACME certificate issuance](https://www.buypass.com/products/tls-ssl-certificates/discontinues-issuance-of-tls-ssl-certificates) in October 2025. If an existing installation uses that directory, select an issuing provider in Settings and obtain replacement certificates before the existing ones expire.

> [!TIP]
> Use **Let's Encrypt Staging** for testing to avoid hitting rate limits during development.

---

## 🔧 Troubleshooting

### "Failed to obtain certificate"

| Cause                                  | Fix                                                                                         |
| :------------------------------------- | :------------------------------------------------------------------------------------------ |
| Port 80 not reachable                  | Check firewall, router port forwarding                                                      |
| Domain not pointing to server          | Verify DNS A/AAAA records                                                                   |
| ACME provider requires an email or EAB | Configure the registration email and required EAB pair under Settings → Certificates / ACME |
| ACME rate limit exceeded               | Check the provider's retry guidance; use a staging endpoint for future test requests        |

### "Certificate not renewing"

ShieldPM checks its managed Let's Encrypt certificates at startup and then at most every **12 hours**, calling `certbot renew` separately for each certificate with its saved profile. Administrators set the interval from **1 to 12 hours** under **Settings → Certificates / ACME**; the default is 12 hours and changes apply to the running timer. Certbot decides when each certificate is due. A check does not force a new certificate; the check interval does not set the expiry threshold. A failed renewal is logged without preventing checks of the other certificates. Keep HTTP challenge access or DNS credentials working for automatic Short-lived renewal. If renewal fails:

```bash
# Check certificate status
docker exec shieldpm certbot --config /etc/certbot.ini certificates

# Prefer the ShieldPM UI/API's Renew action for a single Let's Encrypt certificate.
# It also updates certificate metadata and reloads Nginx on success.
```

---

[🏠 Home](Home) | [🔑 Internal PKI](Internal-PKI) | [🐞 Report a Bug](https://github.com/shedowe19/ShieldPM/issues)
