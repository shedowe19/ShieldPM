# API: Endpunkte

Status: active
Last verified: 2026-11-04
Confidence: high

## Zweck

Zuordnung der Mount-Punkte und ihrer Themen. Unterrouten sind nur dort genannt, wo
sie für das Verständnis nötig sind; die vollständige Wahrheit ist `routes/main.js`.

## Mount-Punkte

Aus `backend/routes/main.js:61-91`:

| Route-Datei                  | API-Pfad                                      | Thema                                     |
| ---------------------------- | --------------------------------------------- | ----------------------------------------- |
| `main.js`                    | `/api/`                                       | Health, Setup-Status, Version, CSRF-Token |
| `schema.js`                  | `/api/schema`                                 | OpenAPI-Spezifikation                     |
| `sessions.js`                | `/api/tokens/sessions`                        | Browser-Sitzungen                         |
| `tokens.js`                  | `/api/tokens`                                 | Login, Refresh, Logout, 2FA-Login         |
| `oidc.js`                    | `/api/oidc`                                   | OpenID Connect                            |
| `users.js`                   | `/api/users`                                  | Benutzerverwaltung                        |
| `2fa.js`                     | `/api/users/:user_id/2fa`                     | TOTP, Passkey, Duo, Backup-Codes          |
| `audit-log.js`               | `/api/audit-log`                              | Audit-Log                                 |
| `reports.js`                 | `/api/reports`                                | System-Reports                            |
| `settings.js`                | `/api/settings`                               | globale Einstellungen                     |
| `version.js`                 | `/api/version`                                | Versionsabfrage                           |
| `analytics.js`               | `/api/analytics`                              | Frontend-Analytics                        |
| `incidents.js`               | `/api/incidents`                              | Störungszentrale                          |
| `backups.js`                 | `/api/backups`                                | Instanzbackups                            |
| `ai.js`                      | `/api/ai`                                     | AI-Agent                                  |
| `dashboard.js`               | `/api/dashboard`                              | Dashboard-Statistiken                     |
| `chat.js`                    | `/api/chat`                                   | ChatOps/Telegram                          |
| `nginx/proxy_hosts.js`       | `/api/nginx/proxy-hosts`                      | Proxy-Hosts                               |
| `nginx/redirection_hosts.js` | `/api/nginx/redirection-hosts`                | Redirections                              |
| `nginx/dead_hosts.js`        | `/api/nginx/dead-hosts`                       | 404-Hosts                                 |
| `nginx/streams.js`           | `/api/nginx/streams`                          | TCP/UDP-Streams                           |
| `nginx/access_lists.js`      | `/api/nginx/access-lists`                     | Access-Lists                              |
| `nginx/firewall_lists.js`    | `/api/nginx/firewall-lists`                   | IP-Firewall-Listen                        |
| `nginx/certificates.js`      | `/api/nginx/certificates`                     | Zertifikate                               |
| `nginx/analytics.js`         | `/api/nginx/analytics`                        | Nginx-Analytics                           |
| `nginx/cloudflared.js`       | `/api/nginx/cloudflared-tunnels`              | Cloudflare Tunnels                        |
| `nginx/tor_onion.js`         | `/api/nginx/tor-onion`                        | Tor Onion Services                        |
| `nginx/wireguard.js`         | `/api/nginx/wireguard`                        | WireGuard                                 |
| `nginx/ddns_providers.js`    | `/api/nginx/ddns-providers`                   | DDNS-Provider                             |
| `nginx/upload-relay.js`      | `/api/nginx/proxy-hosts/:hostId/upload-relay` | Upload-Relay                              |
| `gitops.js`                  | `/api/gitops`                                 | GitOps Pull/Push                          |
| `services.js`                | `/api/services`                               | Diensterkennung                           |

## Verschachtelte Proxy-Host-Routen

`backend/routes/nginx/proxy_hosts.js:35-36` hängt zwei weitere Router ein:

| Pfad                                        | Thema                                        |
| ------------------------------------------- | -------------------------------------------- |
| `/api/nginx/proxy-hosts/:host_id/revisions` | Host-Versionen, Rollback                     |
| `/api/nginx/proxy-hosts/:host_id`           | Cache- und Upstream-Pool-Unterrouten je Host |

## Zusätzliche Nginx-Pfade in der internen Doku

Die interne Doku nennt zusätzlich `/api/nginx/firewall-lists/geoip` und
Firewall-Vorschau/Refresh-Endpunkte unterhalb von `/api/nginx/firewall-lists`.
Quelle: [IP-Firewall (Tiefe)](../reference/module/ip-firewall.md).

## Pfade ohne Route-Datei

- `backend/password-reset.js` ist ein CLI-Werkzeug, kein API-Endpunkt.
- `backend/migrate.js` und `backend/backup-restore.js` laufen beim Start.

## Risiken und Stolperfallen

- Routen-Dateien können weitere Router einhängen; die Tabelle oben ist deshalb
  nicht vollständig bis zur letzten Unterroute.
- Ein Pfad in dieser Tabelle ohne passenden `router.use`-Eintrag ist ein Fehler —
  die Prüfung erfolgt über `backend/routes/main.js`.

## Offene Fragen

- Unklar: Ob die Route `host_traffic_policy.js` bewusst unter dem Proxy-Host-Pfad
  statt unter einem eigenen `/api/nginx/host-traffic` liegt. `confidence: high`
  für den Code, offen für die Absicht.

## Verwandte Seiten

- [API-Überblick](./overview.md)
- [Schemas](./schemas.md)
- [Module](../modules/overview.md)
- [Routen (Tiefe)](../reference/api/routen.md)
