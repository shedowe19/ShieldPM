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

Die JWT-Middleware übernimmt ein Bearer-Token oder das Cookie `shieldpm_jwt` zunächst nur nach
`res.locals.token`. Öffentliche Bootstrap-, Dokumentations-, Login- und OIDC-Flows bleiben bewusst ohne vollständige
Sitzung erreichbar. Fachliche Routen erzwingen die aktuelle Anmeldung und Berechtigung über ihren Access-Layer; die
exakte Ausnahme oder Methode steht deshalb im jeweiligen Handler und im
[Laufzeit-Endpunkt-Katalog](./endpunkt-katalog.md).

## Swagger/OpenAPI

Schema-Dateien unter `backend/schema/`:

- `swagger.json` — Hauptdatei
- `common.json` — Gemeinsame Definitionen
- `components/` — Wiederverwendbare Schemas
- `paths/` — Endpunkt-Definitionen

Die OpenAPI-Spezifikation ist nicht für jeden Express-Handler vollständig. Der verbindliche Abgleich aller aktuell
gemounteten Pfade steht im [Laufzeit-Endpunkt-Katalog](./endpunkt-katalog.md).

## Verwandte Seiten

- [Routen](./routen.md)
- [Schemas](./schemas.md)
- [Laufzeit-Endpunkt-Katalog](./endpunkt-katalog.md)
- [Architektur-Module](../architektur/module.md)
