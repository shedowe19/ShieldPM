# API-Überblick

## Zweck

Dokumentation der REST-API-Struktur.

## Kontext

Die API wird durch Express.js bereitgestellt. Schema-Validierung erfolgt über AJV gegen OpenAPI-Schemas in `backend/schema/`.

## Endpunkt-Gruppen

| Gruppe            | Basis-Pfad                       | Beschreibung                                                                                                               |
| ----------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Proxy-Hosts       | `/api/nginx/proxy-hosts`         | Reverse-Proxy CRUD                                                                                                         |
| Redirection-Hosts | `/api/nginx/redirection-hosts`   | Umleitungen                                                                                                                |
| Dead-Hosts        | `/api/nginx/dead-hosts`          | 404-Hosts                                                                                                                  |
| Streams           | `/api/nginx/streams`             | TCP/UDP-Streams                                                                                                            |
| Certificates      | `/api/nginx/certificates`        | SSL-Zertifikate                                                                                                            |
| Access-Lists      | `/api/nginx/access-lists`        | Zugriffslisten                                                                                                             |
| Firewall-Listen   | `/api/nginx/firewall-lists`      | [TXT-/HTTPS-Listen, Vorschau, Refresh und GeoIP-Readiness](../module/ip-firewall.md#api)                                   |
| Cloudflared       | `/api/nginx/cloudflared-tunnels` | CF-Tunnels                                                                                                                 |
| Tor Onion         | `/api/nginx/tor-onion`           | Tor-Services                                                                                                               |
| WireGuard         | `/api/nginx/wireguard`           | VPN-Tunnels                                                                                                                |
| DDNS              | `/api/nginx/ddns-providers`      | Dynamic DNS                                                                                                                |
| Analytics         | `/api/nginx/analytics`           | Traffic-Daten                                                                                                              |
| Globale Analytics | `/api/analytics`                 | Systemstatus sowie Top-Proxy-Hosts nach Requests, übertragenen Bytes, 4xx- oder 5xx-Antworten (erfordert `analytics:list`) |
| Users             | `/api/users`                     | Benutzerverwaltung                                                                                                         |
| Tokens            | `/api/tokens`                    | Authentifizierung                                                                                                          |
| Settings          | `/api/settings`                  | Einstellungen                                                                                                              |
| AI                | `/api/ai`                        | AI-Agent                                                                                                                   |
| Chat              | `/api/chat`                      | Telegram ChatOps                                                                                                           |
| GitOps            | `/api/gitops`                    | Git-Synchronisierung                                                                                                       |
| 2FA               | `/api/users/:user_id/2fa`        | Zwei-Faktor                                                                                                                |
| OIDC              | `/api/oidc`                      | OpenID Connect                                                                                                             |
| Audit-Log         | `/api/audit-log`                 | Protokolle                                                                                                                 |
| Dashboard         | `/api/dashboard`                 | Dashboard-Daten                                                                                                            |
| Reports           | `/api/reports`                   | System-Reports                                                                                                             |
| Services          | `/api/services`                  | Docker-Services                                                                                                            |

## Authentifizierung

Der öffentliche Health-Endpunkt `GET /api` liefert Setup-, Demo- und Versionsstatus sowie einen anfänglichen CSRF-Token. Anmeldung über `POST /api/tokens`, Refresh und zweiter Faktor sind ohne gültiges Access-JWT erreichbar; die Ersteinrichtung besitzt eine eigene Ausnahme. Geschützte Routen akzeptieren ein JWT im `Authorization: Bearer`-Header oder das HttpOnly-Cookie `shieldpm_jwt`. Aktionen erfordern zusätzlich Ressourcenberechtigungen. Schreibanfragen benötigen unabhängig von Bearer- oder Cookie-Authentifizierung das `XSRF-TOKEN`-Cookie und den dazu passenden Wert im Header `X-XSRF-TOKEN`; bei Bedarf liefert `GET /api` mit Bearer-Token ein passendes Paar. Für Login, Refresh, Logout und bestimmte Erst-Setup-/2FA-Schritte gelten im Backend gezielte Ausnahmen. Die Duo-Browserübergabe bleibt CSRF-geschützt.

Die [Proxy-Host-Diagnose](../features/proxy-host-diagnostics.md) ist als `POST /api/nginx/proxy-hosts/:host_id/diagnostics` nur für sichtbare Hosts zugänglich. Ihr einziger optionaler Body-Wert `websocket_path` legt einen relativen Pfad desselben Hosts fest.

## Swagger/OpenAPI

Schema-Dateien unter `backend/schema/`:

- `swagger.json` — Hauptdatei
- `common.json` — Gemeinsame Definitionen
- `components/` — Wiederverwendbare Schemas
- `paths/` — Endpunkt-Definitionen

## Verwandte Seiten

- [Routen](./routen.md)
- [Schemas](./schemas.md)
- [Architektur-Module](../architektur/module.md)
