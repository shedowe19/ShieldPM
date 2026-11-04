# Module: Übersicht

Status: active
Last verified: 2026-11-04
Confidence: high

## Zweck

Diese Seite ist die Landkarte der Backend-Module. Sie nennt für jedes Modul die
Dateien, den Zweck in einem Satz und die ausführliche Seite in
`llm-wiki/wiki/reference/`. Die Tiefe wird hier bewusst nicht dupliziert.

## Hosts und Konfiguration

| Modul                 | Dateien                                                                                              | Zweck                                                            | Tiefe                                                                                                      |
| --------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Nginx-Engine          | `internal/nginx.js`                                                                                  | rendert, validiert und lädt Nginx-Konfiguration                  | [nginx-engine](../reference/module/nginx-engine.md)                                                        |
| Nginx-Templates       | `templates/*.conf`                                                                                   | Liquid-Vorlagen der vhosts                                       | [nginx-templates](../reference/module/nginx-templates.md)                                                  |
| Proxy-Host            | `internal/proxy-host.js`, `proxy-host-options.js`, `proxy-host-policies.js`, `proxy-host-preview.js` | CRUD, Optionen, Policies, Vorschau                               | [proxy-host](../reference/module/proxy-host.md)                                                            |
| Redirection           | `internal/redirection-host.js`                                                                       | HTTP-Redirects                                                   | [redirection-host](../reference/module/redirection-host.md)                                                |
| Dead Host             | `internal/dead-host.js`                                                                              | 404-/Standardseiten                                              | [dead-host](../reference/module/dead-host.md)                                                              |
| Stream                | `internal/stream.js`                                                                                 | TCP/UDP-Weiterleitung                                            | [stream](../reference/module/stream.md)                                                                    |
| Gemeinsame Host-Logik | `internal/host.js`                                                                                   | Basis für alle Hosttypen                                         | [host](../reference/module/host.md)                                                                        |
| Host-Revisionen       | `internal/host-revisions.js`                                                                         | verschlüsselte Versionen und Rollback                            | [host-revisionen](../reference/features/host-revisionen.md)                                                |
| Upstream-Pools        | `internal/proxy-host-policies.js`, `lib/upstream-pool-observations.js`                               | gewichtete Upstreams                                             | [upstream-pools](../reference/module/upstream-pools.md)                                                    |
| Proxy-Cache           | Templates + Host-Optionen                                                                            | Cache-Schalter je Host                                           | [proxy-cache](../reference/module/proxy-cache.md)                                                          |
| Traffic-Policy        | `internal/host-traffic-policy.js`                                                                    | Upstream-Pool-Status, Cache-Status und Cache-Purge je Host       | [proxy-cache](../reference/module/proxy-cache.md), [upstream-pools](../reference/module/upstream-pools.md) |
| IP-Firewall-Regeln    | `internal/firewall-policy.js`, `lib/firewall-policy.js`, `lib/firewall-render.js`                    | Normalisierung, Prüfung und Rendering der Sperrregeln            | [ip-firewall](../reference/module/ip-firewall.md)                                                          |
| Host-Vorschau         | `internal/proxy-host-preview.js`, `lib/nginx-preview.js`                                             | Draft rendern und mit aktiver Config vergleichen, ohne Schreiben | [proxy-host](../reference/module/proxy-host.md)                                                            |
| Upload-Relay          | `internal/upload-relay.js`                                                                           | wiederaufnehmbare Uploads                                        | [upload-relay](../reference/module/upload-relay.md)                                                        |

## TLS und Zugriff

| Modul        | Dateien                                                  | Zweck                              | Tiefe                                               |
| ------------ | -------------------------------------------------------- | ---------------------------------- | --------------------------------------------------- |
| Zertifikate  | `internal/certificate.js`                                | Verwaltung und Zuordnung           | [zertifikate](../reference/module/zertifikate.md)   |
| Certbot      | `internal/certbot.js`, `lib/certbot.js`                  | ACME-Ausstellung, DNS-Challenges   | [certbot](../reference/module/certbot.md)           |
| Interne PKI  | `internal/pki.js`                                        | interne CA und Host-Zertifikate    | [pki](../reference/module/pki.md)                   |
| Access-Lists | `internal/access-list.js`, `lib/access-list-files.js`    | Basic Auth und mTLS                | [access-lists](../reference/module/access-lists.md) |
| IP-Firewall  | `internal/firewall-list.js`, `lib/firewall-*.js`         | IP-/ASN-/Länderfilter je Host      | [ip-firewall](../reference/module/ip-firewall.md)   |
| OAuth2-Proxy | `internal/oauth2-proxy.js`                               | SSO vor Hosts                      | [oauth2-proxy](../reference/module/oauth2-proxy.md) |
| Anubis       | `internal/anubis.js`                                     | Proof-of-Work-Gate                 | [anubis](../reference/module/anubis.md)             |
| OpenAppSec   | `rootfs/usr/local/bin/runtime-config.sh`, externer Agent | AI-WAF über Nginx-Attachment-Modul | [openappsec](../reference/module/openappsec.md)     |

## Identität und Verwaltung

| Modul              | Dateien                                                                | Zweck                                     | Tiefe                                                               |
| ------------------ | ---------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------- |
| Benutzer und Auth  | `internal/user.js`, `lib/access.js`                                    | Benutzer, Rollen, Rechte                  | [benutzer-auth](../reference/module/benutzer-auth.md)               |
| Tokens             | `internal/token.js`, `models/token.js`                                 | JWT-Ausstellung; Prüfung im Modell        | [token](../reference/module/token.md)                               |
| 2FA                | `internal/2fa-service.js`                                              | TOTP, Passkey, Duo, Backup-Codes          | [2fa-service](../reference/module/2fa-service.md)                   |
| Sitzungen          | `internal/auth-session-service.js`, `internal/auth-session-cleanup.js` | widerrufbare Browser-Sitzungen            | [auth-session-service](../reference/module/auth-session-service.md) |
| Sitzungsverwaltung | `internal/sessions.js`                                                 | eigene Sitzungen auflisten und widerrufen | [auth-session-service](../reference/module/auth-session-service.md) |
| Einstellungen      | `internal/setting.js`                                                  | globale Einstellungen                     | [einstellungen](../reference/verwaltung/einstellungen.md)           |
| Audit-Log          | `internal/audit-log.js`                                                | revisionsfähige Protokolle                | [audit-log](../reference/verwaltung/audit-log.md)                   |
| Reports            | `internal/report.js`                                                   | Host-Bestandsbericht (`getHostsReport`)   | [report](../reference/verwaltung/report.md)                         |
| Remote-Version     | `internal/remote-version.js`                                           | Update-Prüfung                            | [remote-version](../reference/module/remote-version.md)             |
| Dashboard-Notizen  | `internal/dashboard_note.js`                                           | Notizen auf dem Dashboard                 | [dashboard-notes](../reference/module/dashboard-notes.md)           |
| Terminal           | `internal/terminal.js`                                                 | Web-SSH über WebSocket                    | [terminal](../reference/module/terminal.md)                         |

## Betrieb

| Modul              | Dateien                                                     | Zweck                                                     | Tiefe                                                           |
| ------------------ | ----------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------- |
| Analytics          | `internal/analytics.js`, `lib/analytics-*.js`               | Zugriffsauswertung                                        | [analytics](../reference/module/analytics.md)                   |
| Wartung            | `internal/maintenance.js`                                   | geplante Wartungsfenster                                  | [maintenance](../reference/module/maintenance.md)               |
| Störungszentrale   | `internal/incidents.js`                                     | Vorfälle, Benachrichtigungen, Mutes                       | [incident-center](../reference/module/incident-center.md)       |
| Instanzbackups     | `internal/instance-backups.js`, `lib/instance-backup.js`    | verschlüsselte Vollbackups                                | [instance-backups](../reference/module/instance-backups.md)     |
| Proxy-Host-Monitor | `internal/proxy-host-monitor.js`                            | aktive Checks und Historie                                | [proxy-host-monitor](../reference/module/proxy-host-monitor.md) |
| Diagnose           | `internal/proxy-host-diagnostics.js`                        | DNS-, TLS-, Route-, Upstream-Checks                       | [diagnostics](../reference/features/proxy-host-diagnostics.md)  |
| Turbo-Loader       | `rootfs/html/turbo_loader.html`, Migration `20260409000000` | Download-Beschleuniger mit parallelen HTTP-Range-Requests | [turbo-loader](../reference/module/turbo-loader.md)             |

## Integrationen

| Modul              | Dateien                                            | Zweck                         | Tiefe                                             |
| ------------------ | -------------------------------------------------- | ----------------------------- | ------------------------------------------------- |
| AI-Agent           | `internal/ai.js`, `internal/ai/*`                  | Chat-Assistent mit Tools      | [ai-agent](../reference/module/ai-agent.md)       |
| ChatOps            | `internal/chat.js`                                 | Telegram-Bot                  | [chatops](../reference/module/chatops.md)         |
| GitOps             | `internal/gitops.js`                               | Konfigurations-Export/-Import | [gitops](../reference/module/gitops.md)           |
| Git-Deploy         | `internal/git-deploy.js`                           | Hosts aus Git aktualisieren   | [git-deploy](../reference/module/git-deploy.md)   |
| Tor                | `internal/tor.js`                                  | Onion Services                | [tor](../reference/module/tor.md)                 |
| Cloudflare Tunnels | `internal/cloudflared.js`                          | Zero-Trust-Tunnel             | [cloudflared](../reference/module/cloudflared.md) |
| WireGuard          | `internal/wireguard.js`, `lib/wireguard-status.js` | VPN-Peers                     | [wireguard](../reference/module/wireguard.md)     |
| IP-Ranges          | `internal/ip_ranges.js`                            | Cloudflare-IP-Listen          | [ip-ranges](../reference/module/ip-ranges.md)     |
| DDNS               | `internal/ddns.js`, `internal/ddns-provider.js`    | dynamische DNS-Updates        | [ddns](../reference/module/ddns.md)               |
| Docker-Discovery   | `internal/docker.js`                               | Container über Labels         | [docker](../reference/module/docker.md)           |

## Risiken und Stolperfallen

- **Namensgleichheit:** `internal/ddns.js` und `internal/ddns-provider.js` sind
  getrennte Dienste; `internal/ddns-provider.js` verwaltet Provider, nicht Einträge.
- **Template-Kopplung:** Fast jedes Host-Modul hängt an `templates/`. Eine
  Änderung dort wirkt auf alle Hosttypen.
- **`openappsec`** hat kein Backend-Modul; das Nginx-Attachment wird über
  `rootfs/usr/local/bin/runtime-config.sh` und
  `NGINX_LOAD_OPENAPPSEC_ATTACHMENT_MODULE` geladen, den Rest macht der externe
  Agent. `backend/templates/` enthält keinen OpenAppSec-Bezug.
- **Neue Module** brauchen fast immer einen Eintrag in `lib/access/` und in dieser
  Tabelle.

## Offene Fragen

- Unklar: Ob `host-traffic-policy` ein eigenständiges Modul werden soll; derzeit
  hängt es als Unterroute am Proxy-Host. `confidence: medium`.

## Verwandte Seiten

- [Architektur](../architecture/overview.md)
- [Backend](../backend/overview.md)
- [API-Endpunkte](../api/endpoints.md)
- [Modulübersicht (Tiefe)](../reference/module/README.md)
