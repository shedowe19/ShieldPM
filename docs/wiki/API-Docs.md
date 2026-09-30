# API Documentation

ShieldPM exposes a JSON API under `/api`. The running instance serves its OpenAPI specification at `/api/schema` and the interactive documentation at `/api/docs` (the backend also serves `/docs` when reached directly). Consult that specification for the endpoints it covers; **some implemented routes, including analytics and several integrations, are not yet included in the OpenAPI paths**.

## Authentication and CSRF

Log in with **POST** `/api/tokens`:

```json
{
  "identity": "admin@example.org",
  "secret": "your-password"
}
```

A successful login returns `token`, `expires`, a minimal `user` object and `csrfToken`. The server also sets HttpOnly `shieldpm_jwt` and `shieldpm_refresh` cookies. If two-factor authentication is enabled, the first response is HTTP 202 with `requires_2fa`, a short-lived `pending_token` and available `methods`; complete the applicable `/api/tokens/2fa/*` challenge before using protected endpoints.

API clients can send the access JWT as `Authorization: Bearer <token>`; the web UI uses the HttpOnly access cookie. **POST** `/api/tokens/refresh` rotates an existing refresh token pair (cookie or `refresh_token` in the body). **POST** `/api/tokens/logout` revokes the refresh-token family and clears the cookies. The older `GET /api/tokens` refresh operation is retained for compatibility; new clients should use POST refresh.

For state-changing requests, retain the `XSRF-TOKEN` cookie and send its matching token in `X-XSRF-TOKEN`, whether authentication uses a Bearer token or an access cookie. An unauthenticated `GET /api` provides an initial `csrfToken`; if using Bearer authentication, call `GET /api` with that token to obtain a matching CSRF cookie and token pair. Login and refresh return a token for the new session. Login, refresh, logout and the initial user setup have specific CSRF exceptions; the Duo browser handoff still requires CSRF. The API applies endpoint permissions in addition to authentication.

## Selected endpoints

| Method     | Endpoint                                         | Purpose                                                         |
| ---------- | ------------------------------------------------ | --------------------------------------------------------------- |
| GET        | `/api`                                           | Health, version, setup state, demo state and initial CSRF token |
| GET / POST | `/api/nginx/proxy-hosts`                         | List or create proxy hosts                                      |
| POST       | `/api/nginx/proxy-hosts/preview`                 | Render a new host configuration preview without saving it       |
| POST       | `/api/nginx/proxy-hosts/:host_id/preview`        | Preview a change to an authorized host                          |
| POST       | `/api/nginx/proxy-hosts/:host_id/diagnostics`    | Run authorized host diagnostics                                 |
| GET        | `/api/nginx/analytics/:hostId?range=24h`         | Host traffic time series                                        |
| GET        | `/api/nginx/analytics/:hostId/summary?range=24h` | Host status codes and top lists                                 |
| GET        | `/api/analytics/top-hosts`                       | Ranked hosts for authorized analytics users                     |
| GET        | `/api/reports/hosts`                             | Counts of proxy, redirection, stream and dead hosts             |

The per-host analytics `range` values are `1h`, `24h`, `7d` and `30d` (invalid values fall back to `24h`). Global analytics additionally offers `/api/analytics/summary`, `/series`, `/status` and `/db-stats` to users with `analytics:list` permission. Many more endpoint groups cover certificates, access lists, users, settings, tunnels, DDNS and integrations.

### Proxy host example

**POST** `/api/nginx/proxy-hosts` with JSON:

```json
{
  "domain_names": ["example.com"],
  "forward_scheme": "http",
  "forward_host": "192.168.1.50",
  "forward_port": 8080
}
```

These four fields are required. Optional fields such as `certificate_id`, `ssl_forced`, `access_list_id`, `block_exploits`, `caching_enabled`, `allow_websocket_upgrade` and `locations` are described in the live OpenAPI schema. `GET /api/nginx/proxy-hosts` returns an array by default, or an `items` plus `pagination` object when `page` or `limit` is provided; `expand` requests permitted relations.

### Certificate profile example

**POST** `/api/nginx/certificates` requests a new HTTP-challenge Short-lived certificate:

```json
{
  "provider": "letsencrypt",
  "domain_names": ["example.com"],
  "meta": {
    "letsencrypt_profile": "shortlived"
  }
}
```

`meta.letsencrypt_profile` accepts `standard` or `shortlived`; omitting it uses the current global default and saves that resolved choice on the new certificate. DNS-challenge requests use the same field together with their DNS-provider metadata. Inline host requests with `certificate_id: "new"` also accept the profile in `meta`; streams require DNS validation. Short-lived requests allow at most 25 domain names. The profile is returned in certificate metadata, retained for renewal, and cannot be changed through the certificate update endpoint. See [SSL Certificates](SSL-Certificates) for lifetime and global ACME configuration behavior.

### Global ACME profile

**GET** `/api/nginx/certificates/acme-profile` requires certificate-list permission and returns the effective new-certificate default:

```json
{
  "profile": "standard"
}
```

An administrator saves the choice with **PUT** `/api/nginx/certificates/acme-profile`:

```json
{
  "profile": "shortlived"
}
```

The response contains only the saved `profile`. Only `standard` and `shortlived` are accepted; Standard is the initial database default. Certbot 4.0 or newer and its profile support are required. Short-lived also requires the ACME server to advertise that profile and rejects active legacy certificates without a saved profile if they have more than 25 domain names. A failed validation preserves the previous value. Saving applies immediately to new requests without an explicit profile and to renewal of legacy certificates without profile metadata. Explicit per-certificate profiles remain unchanged. The generic `/api/settings/acme-profile` update is rejected; use this dedicated endpoint.

### Certificate and Cloudflare update options

Administrators use **GET/PUT** `/api/settings/certificate-options` with this complete body/response:

```json
{
  "key_type": "ecdsa",
  "renewal_interval_hours": 12
}
```

`key_type` accepts `ecdsa` or `rsa`; the renewal check interval is an integer from 1 to 12 hours. The key type applies to the next issuance or renewal, including existing certificates. The interval updates the running timer and does not force renewal.

**GET/PUT** `/api/settings/ip-ranges-options` uses:

```json
{
  "enabled": false,
  "refresh_interval_hours": 6
}
```

The refresh interval is an integer from 6 to 594 hours in six-hour steps. Enabling starts a background fetch and periodic updates; disabling retains the cached ranges and stops automatic updates. Both endpoints require administrative settings permissions (`settings:get` for GET, `settings:update` for PUT). Each PUT sends the complete options object, without a settings `meta` wrapper. Changes apply without restarting; generic updates of these setting IDs are rejected.

Most API errors use an `error` object with a numeric `code` and public `message`. A CSRF rejection before route execution responds with HTTP 403 and `error.reason: "EBADCSRFTOKEN"`. Some analytics routes return a shorter `error` string for host-not-found or forbidden responses; check the endpoint's response contract when handling errors.

---

[🏠 Home](Home) | [🐞 Report a Bug](https://github.com/shedowe19/ShieldPM/issues)
