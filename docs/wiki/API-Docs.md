# API Documentation

ShieldPM exposes a REST API under `/api` and serves interactive OpenAPI documentation directly from the running application.

## Live Documentation

| Endpoint             | Purpose                                                                    |
| :------------------- | :------------------------------------------------------------------------- |
| `/docs`              | Swagger UI for the compiled OpenAPI schema                                 |
| `/docs/swagger.json` | Raw OpenAPI document used by Swagger UI                                    |
| `/api/schema`        | API schema endpoint with server URL adjusted to the current request origin |
| `/api`               | Health/setup/version response                                              |

The source of truth for machine-readable API docs is `backend/schema/swagger.json` plus the files under `backend/schema/paths/` and `backend/schema/components/`.

## Authentication

Most API endpoints require a Bearer JWT:

```http
Authorization: Bearer <token>
```

Login uses `POST /api/tokens`. If 2FA is required, the token response can include a short-lived pending token for the `/api/tokens/2fa/*` verification flow. Do not hardcode example passwords; create the first admin through the setup wizard or via `INITIAL_ADMIN_EMAIL`/`INITIAL_ADMIN_PASSWORD` in a controlled deployment.

## Mounted API Modules

| Mount                            | Source                                      |
| :------------------------------- | :------------------------------------------ |
| `/api/schema`                    | `backend/routes/schema.js`                  |
| `/api/tokens`                    | `backend/routes/tokens.js`                  |
| `/api/oidc`                      | `backend/routes/oidc.js`                    |
| `/api/users`                     | `backend/routes/users.js`                   |
| `/api/users/:user_id/2fa`        | `backend/routes/2fa.js`                     |
| `/api/audit-log`                 | `backend/routes/audit-log.js`               |
| `/api/reports`                   | `backend/routes/reports.js`                 |
| `/api/settings`                  | `backend/routes/settings.js`                |
| `/api/version`                   | `backend/routes/version.js`                 |
| `/api/analytics`                 | `backend/routes/analytics.js`               |
| `/api/ai`                        | `backend/routes/ai.js`                      |
| `/api/dashboard`                 | `backend/routes/dashboard.js`               |
| `/api/chat`                      | `backend/routes/chat.js`                    |
| `/api/nginx/proxy-hosts`         | `backend/routes/nginx/proxy_hosts.js`       |
| `/api/nginx/ddns-providers`      | `backend/routes/nginx/ddns_providers.js`    |
| `/api/nginx/redirection-hosts`   | `backend/routes/nginx/redirection_hosts.js` |
| `/api/nginx/dead-hosts`          | `backend/routes/nginx/dead_hosts.js`        |
| `/api/nginx/streams`             | `backend/routes/nginx/streams.js`           |
| `/api/nginx/access-lists`        | `backend/routes/nginx/access_lists.js`      |
| `/api/nginx/certificates`        | `backend/routes/nginx/certificates.js`      |
| `/api/nginx/analytics`           | `backend/routes/nginx/analytics.js`         |
| `/api/nginx/cloudflared-tunnels` | `backend/routes/nginx/cloudflared.js`       |
| `/api/nginx/tor-onion`           | `backend/routes/nginx/tor_onion.js`         |
| `/api/nginx/wireguard`           | `backend/routes/nginx/wireguard.js`         |
| `/api/gitops`                    | `backend/routes/gitops.js`                  |
| `/api/services`                  | `backend/routes/services.js`                |

## OpenAPI Path Index

The current OpenAPI schema exposes **63** documented path entries:

| Methods          | Path                                            |
| :--------------- | :---------------------------------------------- |
| GET              | `/api/`                                         |
| POST             | `/api/ai/chat`                                  |
| GET, PUT         | `/api/ai/config`                                |
| POST             | `/api/ai/models`                                |
| GET              | `/api/audit-log`                                |
| GET              | `/api/audit-log/{id}`                           |
| GET, POST        | `/api/chat`                                     |
| PUT, DELETE      | `/api/chat/{integrationID}`                     |
| GET, POST        | `/api/dashboard/notes`                          |
| PUT, DELETE      | `/api/dashboard/notes/{noteID}`                 |
| GET, POST        | `/api/nginx/access-lists`                       |
| GET, PUT, DELETE | `/api/nginx/access-lists/{listID}`              |
| GET, POST        | `/api/nginx/certificates`                       |
| GET              | `/api/nginx/certificates/dns-providers`         |
| POST             | `/api/nginx/certificates/download`              |
| POST             | `/api/nginx/certificates/test-http`             |
| POST             | `/api/nginx/certificates/validate`              |
| GET, PUT, DELETE | `/api/nginx/certificates/{certID}`              |
| POST             | `/api/nginx/certificates/{certID}/renew`        |
| POST             | `/api/nginx/certificates/{certID}/upload`       |
| GET, POST        | `/api/nginx/cloudflared-tunnels`                |
| GET, PUT, DELETE | `/api/nginx/cloudflared-tunnels/{id}`           |
| GET, POST        | `/api/nginx/ddns-providers`                     |
| GET, PUT, DELETE | `/api/nginx/ddns-providers/{id}`                |
| POST             | `/api/nginx/ddns-providers/{id}/test`           |
| GET, POST        | `/api/nginx/dead-hosts`                         |
| GET, PUT, DELETE | `/api/nginx/dead-hosts/{hostID}`                |
| POST             | `/api/nginx/dead-hosts/{hostID}/disable`        |
| POST             | `/api/nginx/dead-hosts/{hostID}/enable`         |
| GET, POST        | `/api/nginx/proxy-hosts`                        |
| GET, PUT, DELETE | `/api/nginx/proxy-hosts/{hostID}`               |
| POST             | `/api/nginx/proxy-hosts/{hostID}/disable`       |
| POST             | `/api/nginx/proxy-hosts/{hostID}/enable`        |
| GET, PUT         | `/api/nginx/proxy-hosts/{hostID}/git-status`    |
| POST             | `/api/nginx/proxy-hosts/{hostID}/git-sync`      |
| GET, POST        | `/api/nginx/redirection-hosts`                  |
| GET, PUT, DELETE | `/api/nginx/redirection-hosts/{hostID}`         |
| POST             | `/api/nginx/redirection-hosts/{hostID}/disable` |
| POST             | `/api/nginx/redirection-hosts/{hostID}/enable`  |
| GET, POST        | `/api/nginx/streams`                            |
| GET, PUT, DELETE | `/api/nginx/streams/{streamID}`                 |
| POST             | `/api/nginx/streams/{streamID}/disable`         |
| POST             | `/api/nginx/streams/{streamID}/enable`          |
| GET, POST        | `/api/nginx/tor-onion`                          |
| GET, PUT, DELETE | `/api/nginx/tor-onion/{id}`                     |
| GET, POST        | `/api/nginx/wireguard`                          |
| GET, PUT, DELETE | `/api/nginx/wireguard/{id}`                     |
| GET              | `/api/reports/hosts`                            |
| GET              | `/api/schema`                                   |
| GET              | `/api/settings`                                 |
| GET, PUT         | `/api/settings/{settingID}`                     |
| GET, POST        | `/api/tokens`                                   |
| POST             | `/api/tokens/2fa/passkey/begin`                 |
| POST             | `/api/tokens/2fa/passkey/complete`              |
| POST             | `/api/tokens/2fa/verify`                        |
| POST             | `/api/tokens/logout`                            |
| POST             | `/api/tokens/refresh`                           |
| GET, POST        | `/api/users`                                    |
| GET, PUT, DELETE | `/api/users/{userID}`                           |
| PUT              | `/api/users/{userID}/auth`                      |
| POST             | `/api/users/{userID}/login`                     |
| PUT              | `/api/users/{userID}/permissions`               |
| GET              | `/api/version/check`                            |

## Express Route Index

The current backend route tree contains **123** extracted handlers/chained routes. Some `.route()` entries share one path with multiple methods.

| Method | Path                                                | Source                                      |
| :----- | :-------------------------------------------------- | :------------------------------------------ |
| POST   | `/api/ai/chat`                                      | `backend/routes/ai.js`                      |
| GET    | `/api/ai/config`                                    | `backend/routes/ai.js`                      |
| PUT    | `/api/ai/config`                                    | `backend/routes/ai.js`                      |
| POST   | `/api/ai/models`                                    | `backend/routes/ai.js`                      |
| GET    | `/api/analytics/db-stats`                           | `backend/routes/analytics.js`               |
| GET    | `/api/analytics/series`                             | `backend/routes/analytics.js`               |
| GET    | `/api/analytics/status`                             | `backend/routes/analytics.js`               |
| GET    | `/api/analytics/summary`                            | `backend/routes/analytics.js`               |
| GET    | `/api/analytics/top-hosts`                          | `backend/routes/analytics.js`               |
| ROUTE  | `/api/audit-log`                                    | `backend/routes/audit-log.js`               |
| ROUTE  | `/api/audit-log/:event_id`                          | `backend/routes/audit-log.js`               |
| GET    | `/api/chat`                                         | `backend/routes/chat.js`                    |
| POST   | `/api/chat`                                         | `backend/routes/chat.js`                    |
| DELETE | `/api/chat/:id`                                     | `backend/routes/chat.js`                    |
| PUT    | `/api/chat/:id`                                     | `backend/routes/chat.js`                    |
| ROUTE  | `/api/dashboard/notes`                              | `backend/routes/dashboard.js`               |
| ROUTE  | `/api/dashboard/notes/:id`                          | `backend/routes/dashboard.js`               |
| GET    | `/api/gitops/config`                                | `backend/routes/gitops.js`                  |
| PUT    | `/api/gitops/config`                                | `backend/routes/gitops.js`                  |
| POST   | `/api/gitops/export`                                | `backend/routes/gitops.js`                  |
| GET    | `/api/gitops/history`                               | `backend/routes/gitops.js`                  |
| POST   | `/api/gitops/import`                                | `backend/routes/gitops.js`                  |
| POST   | `/api/gitops/pull`                                  | `backend/routes/gitops.js`                  |
| POST   | `/api/gitops/push`                                  | `backend/routes/gitops.js`                  |
| POST   | `/api/gitops/revert`                                | `backend/routes/gitops.js`                  |
| POST   | `/api/gitops/test`                                  | `backend/routes/gitops.js`                  |
| ROUTE  | `/api/nginx/access-lists`                           | `backend/routes/nginx/access_lists.js`      |
| ROUTE  | `/api/nginx/access-lists/:list_id`                  | `backend/routes/nginx/access_lists.js`      |
| GET    | `/api/nginx/analytics/:hostId`                      | `backend/routes/nginx/analytics.js`         |
| GET    | `/api/nginx/analytics/:hostId/summary`              | `backend/routes/nginx/analytics.js`         |
| ROUTE  | `/api/nginx/certificates`                           | `backend/routes/nginx/certificates.js`      |
| ROUTE  | `/api/nginx/certificates/:certificate_id`           | `backend/routes/nginx/certificates.js`      |
| ROUTE  | `/api/nginx/certificates/:certificate_id/renew`     | `backend/routes/nginx/certificates.js`      |
| ROUTE  | `/api/nginx/certificates/:certificate_id/upload`    | `backend/routes/nginx/certificates.js`      |
| ROUTE  | `/api/nginx/certificates/dns-providers`             | `backend/routes/nginx/certificates.js`      |
| ROUTE  | `/api/nginx/certificates/download`                  | `backend/routes/nginx/certificates.js`      |
| ROUTE  | `/api/nginx/certificates/internal/client`           | `backend/routes/nginx/certificates.js`      |
| POST   | `/api/nginx/certificates/retrieve`                  | `backend/routes/nginx/certificates.js`      |
| GET    | `/api/nginx/certificates/root-ca`                   | `backend/routes/nginx/certificates.js`      |
| ROUTE  | `/api/nginx/certificates/test-http`                 | `backend/routes/nginx/certificates.js`      |
| ROUTE  | `/api/nginx/certificates/validate`                  | `backend/routes/nginx/certificates.js`      |
| GET    | `/api/nginx/cloudflared-tunnels`                    | `backend/routes/nginx/cloudflared.js`       |
| POST   | `/api/nginx/cloudflared-tunnels`                    | `backend/routes/nginx/cloudflared.js`       |
| DELETE | `/api/nginx/cloudflared-tunnels/:id`                | `backend/routes/nginx/cloudflared.js`       |
| GET    | `/api/nginx/cloudflared-tunnels/:id`                | `backend/routes/nginx/cloudflared.js`       |
| PUT    | `/api/nginx/cloudflared-tunnels/:id`                | `backend/routes/nginx/cloudflared.js`       |
| ROUTE  | `/api/nginx/ddns-providers`                         | `backend/routes/nginx/ddns_providers.js`    |
| ROUTE  | `/api/nginx/ddns-providers/:id`                     | `backend/routes/nginx/ddns_providers.js`    |
| ROUTE  | `/api/nginx/ddns-providers/:id/test`                | `backend/routes/nginx/ddns_providers.js`    |
| ROUTE  | `/api/nginx/dead-hosts`                             | `backend/routes/nginx/dead_hosts.js`        |
| ROUTE  | `/api/nginx/dead-hosts/:host_id`                    | `backend/routes/nginx/dead_hosts.js`        |
| ROUTE  | `/api/nginx/dead-hosts/:host_id/disable`            | `backend/routes/nginx/dead_hosts.js`        |
| ROUTE  | `/api/nginx/dead-hosts/:host_id/enable`             | `backend/routes/nginx/dead_hosts.js`        |
| ROUTE  | `/api/nginx/proxy-hosts`                            | `backend/routes/nginx/proxy_hosts.js`       |
| ROUTE  | `/api/nginx/proxy-hosts/:host_id`                   | `backend/routes/nginx/proxy_hosts.js`       |
| ROUTE  | `/api/nginx/proxy-hosts/:host_id/disable`           | `backend/routes/nginx/proxy_hosts.js`       |
| ROUTE  | `/api/nginx/proxy-hosts/:host_id/enable`            | `backend/routes/nginx/proxy_hosts.js`       |
| ROUTE  | `/api/nginx/proxy-hosts/:host_id/git-status`        | `backend/routes/nginx/proxy_hosts.js`       |
| ROUTE  | `/api/nginx/proxy-hosts/:host_id/git-sync`          | `backend/routes/nginx/proxy_hosts.js`       |
| ROUTE  | `/api/nginx/redirection-hosts`                      | `backend/routes/nginx/redirection_hosts.js` |
| ROUTE  | `/api/nginx/redirection-hosts/:host_id`             | `backend/routes/nginx/redirection_hosts.js` |
| ROUTE  | `/api/nginx/redirection-hosts/:host_id/disable`     | `backend/routes/nginx/redirection_hosts.js` |
| ROUTE  | `/api/nginx/redirection-hosts/:host_id/enable`      | `backend/routes/nginx/redirection_hosts.js` |
| ROUTE  | `/api/nginx/streams`                                | `backend/routes/nginx/streams.js`           |
| ROUTE  | `/api/nginx/streams/:host_id/disable`               | `backend/routes/nginx/streams.js`           |
| ROUTE  | `/api/nginx/streams/:host_id/enable`                | `backend/routes/nginx/streams.js`           |
| ROUTE  | `/api/nginx/streams/:stream_id`                     | `backend/routes/nginx/streams.js`           |
| GET    | `/api/nginx/tor-onion`                              | `backend/routes/nginx/tor_onion.js`         |
| POST   | `/api/nginx/tor-onion`                              | `backend/routes/nginx/tor_onion.js`         |
| DELETE | `/api/nginx/tor-onion/:id`                          | `backend/routes/nginx/tor_onion.js`         |
| GET    | `/api/nginx/tor-onion/:id`                          | `backend/routes/nginx/tor_onion.js`         |
| PUT    | `/api/nginx/tor-onion/:id`                          | `backend/routes/nginx/tor_onion.js`         |
| POST   | `/api/nginx/tor-onion/:id/start`                    | `backend/routes/nginx/tor_onion.js`         |
| POST   | `/api/nginx/tor-onion/:id/stop`                     | `backend/routes/nginx/tor_onion.js`         |
| GET    | `/api/nginx/wireguard`                              | `backend/routes/nginx/wireguard.js`         |
| POST   | `/api/nginx/wireguard`                              | `backend/routes/nginx/wireguard.js`         |
| DELETE | `/api/nginx/wireguard/:id`                          | `backend/routes/nginx/wireguard.js`         |
| GET    | `/api/nginx/wireguard/:id`                          | `backend/routes/nginx/wireguard.js`         |
| PUT    | `/api/nginx/wireguard/:id`                          | `backend/routes/nginx/wireguard.js`         |
| GET    | `/api/nginx/wireguard/:id/config`                   | `backend/routes/nginx/wireguard.js`         |
| POST   | `/api/nginx/wireguard/:id/disable`                  | `backend/routes/nginx/wireguard.js`         |
| POST   | `/api/nginx/wireguard/:id/enable`                   | `backend/routes/nginx/wireguard.js`         |
| GET    | `/api/nginx/wireguard/:id/qrcode`                   | `backend/routes/nginx/wireguard.js`         |
| GET    | `/api/nginx/wireguard/settings`                     | `backend/routes/nginx/wireguard.js`         |
| PUT    | `/api/nginx/wireguard/settings`                     | `backend/routes/nginx/wireguard.js`         |
| GET    | `/api/nginx/wireguard/status`                       | `backend/routes/nginx/wireguard.js`         |
| ROUTE  | `/api/oidc`                                         | `backend/routes/oidc.js`                    |
| ROUTE  | `/api/oidc/callback`                                | `backend/routes/oidc.js`                    |
| ROUTE  | `/api/oidc/claim`                                   | `backend/routes/oidc.js`                    |
| ROUTE  | `/api/reports/hosts`                                | `backend/routes/reports.js`                 |
| ROUTE  | `/api/schema`                                       | `backend/routes/schema.js`                  |
| GET    | `/api/services/detect`                              | `backend/routes/services.js`                |
| GET    | `/api/services/icons`                               | `backend/routes/services.js`                |
| ROUTE  | `/api/settings`                                     | `backend/routes/settings.js`                |
| ROUTE  | `/api/settings/:setting_id`                         | `backend/routes/settings.js`                |
| ROUTE  | `/api/tokens`                                       | `backend/routes/tokens.js`                  |
| POST   | `/api/tokens/2fa/duo/begin`                         | `backend/routes/tokens.js`                  |
| POST   | `/api/tokens/2fa/duo/complete`                      | `backend/routes/tokens.js`                  |
| POST   | `/api/tokens/2fa/passkey/begin`                     | `backend/routes/tokens.js`                  |
| POST   | `/api/tokens/2fa/passkey/complete`                  | `backend/routes/tokens.js`                  |
| POST   | `/api/tokens/2fa/verify`                            | `backend/routes/tokens.js`                  |
| POST   | `/api/tokens/logout`                                | `backend/routes/tokens.js`                  |
| POST   | `/api/tokens/refresh`                               | `backend/routes/tokens.js`                  |
| ROUTE  | `/api/tokens/restore`                               | `backend/routes/tokens.js`                  |
| ROUTE  | `/api/users`                                        | `backend/routes/users.js`                   |
| ROUTE  | `/api/users/:user_id`                               | `backend/routes/users.js`                   |
| ROUTE  | `/api/users/:user_id`                               | `backend/routes/users.js`                   |
| ROUTE  | `/api/users/:user_id/auth`                          | `backend/routes/users.js`                   |
| ROUTE  | `/api/users/:user_id/avatar`                        | `backend/routes/users.js`                   |
| ROUTE  | `/api/users/:user_id/avatar/image`                  | `backend/routes/users.js`                   |
| ROUTE  | `/api/users/:user_id/login`                         | `backend/routes/users.js`                   |
| ROUTE  | `/api/users/:user_id/permissions`                   | `backend/routes/users.js`                   |
| GET    | `/api/users/:user_id/2fa`                           | `backend/routes/2fa.js`                     |
| DELETE | `/api/users/:user_id/2fa/:methodId`                 | `backend/routes/2fa.js`                     |
| GET    | `/api/users/:user_id/2fa/backup-codes/count`        | `backend/routes/2fa.js`                     |
| POST   | `/api/users/:user_id/2fa/backup-codes/regenerate`   | `backend/routes/2fa.js`                     |
| POST   | `/api/users/:user_id/2fa/duo/setup`                 | `backend/routes/2fa.js`                     |
| POST   | `/api/users/:user_id/2fa/passkey/register/begin`    | `backend/routes/2fa.js`                     |
| POST   | `/api/users/:user_id/2fa/passkey/register/complete` | `backend/routes/2fa.js`                     |
| POST   | `/api/users/:user_id/2fa/totp/enable`               | `backend/routes/2fa.js`                     |
| POST   | `/api/users/:user_id/2fa/totp/setup`                | `backend/routes/2fa.js`                     |
| POST   | `/api/users/:user_id/2fa/yubikey/add`               | `backend/routes/2fa.js`                     |
| ROUTE  | `/api/version/check`                                | `backend/routes/version.js`                 |

## Development Notes

- Add or update OpenAPI files in `backend/schema/paths/` when adding API endpoints.
- `GET /api/schema` compiles/dereferences the schema and injects the correct server URL.
- `GET /docs/swagger.json` serves the raw schema for tooling.
- Keep examples free of real tokens, passwords, or deployment-specific secrets.

---

[🏠 Home](Home) | [Development](Development) | [🐞 Report a Bug](https://github.com/shedowe19/ShieldPM/issues)
