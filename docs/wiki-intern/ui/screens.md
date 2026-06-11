# Screens & Pages

## Zweck

Übersicht aller Frontend-Seiten mit Detail-Informationen.

## Seiten

| Pfad                  | Beschreibung                                   |
| --------------------- | ---------------------------------------------- |
| `pages/Dashboard/`    | Hauptansicht mit Statistiken, Notizen          |
| `pages/Login/`        | Anmeldeseite (inkl. 2FA-Step)                  |
| `pages/Setup/`        | Ersteinrichtungsassistent                      |
| `pages/Nginx/`        | Proxy-Hosts, Redirections, Streams, Dead-Hosts |
| `pages/Certificates/` | SSL-Zertifikatsverwaltung                      |
| `pages/Access/`       | Access-Listen                                  |
| `pages/Users/`        | Benutzerverwaltung                             |
| `pages/Settings/`     | Systemeinstellungen                            |
| `pages/Analytics/`    | Traffic-Analyse mit Weltkarte                  |
| `pages/Monitoring/`   | Uptime-Monitoring mit Status-Tabelle           |
| `pages/AuditLog/`     | Protokoll-Ansicht                              |
| `pages/Profile/`      | Benutzerprofil, Sessions, 2FA                  |
| `pages/ChatOps.tsx`   | Telegram-Verwaltung                            |
| `pages/DuoCallback/`  | Duo 2FA Callback-Handler                       |

## Detail: Nginx-Unterseiten

| Datei                          | Zweck                        |
| ------------------------------ | ---------------------------- |
| `Nginx/ProxyHosts/`            | Proxy-Host-Tabelle mit CRUD  |
| `Nginx/RedirectionHosts/`      | Redirect-Tabelle mit CRUD    |
| `Nginx/Streams/`               | Stream-Tabelle mit CRUD      |
| `Nginx/DeadHosts/`             | Dead-Host-Tabelle mit CRUD   |
| `Nginx/DdnsProviders/`         | DDNS-Provider-Tabelle        |
| `Nginx/CloudflaredTunnels.tsx` | Cloudflare-Tunnel-Verwaltung |
| `Nginx/TorOnionServices.tsx`   | Tor-Service-Verwaltung       |
| `Nginx/WireguardTunnels.tsx`   | WireGuard-Verwaltung         |

## Detail: Settings-Tabs

| Datei                      | Zweck                      |
| -------------------------- | -------------------------- |
| `Settings/DefaultSite.tsx` | Default-Site-Konfiguration |
| `Settings/Ai.tsx`          | AI-Agent Konfiguration     |
| `Settings/GitOps.tsx`      | GitOps-Einstellungen       |
| `Settings/Layout.tsx`      | Settings-Layout            |

## Detail: Dashboard-Widgets

| Datei                                   | Zweck                      |
| --------------------------------------- | -------------------------- |
| `Dashboard/CertificateExpiryWidget.tsx` | Zertifikats-Ablauf-Anzeige |
| `Dashboard/DashboardNotesWidget.tsx`    | Notizen-Widget             |

## Tabellen-Pattern

Viele Seiten folgen einem dreistufigen Pattern:

1. `index.tsx` — Seite mit Layout und Modal-Trigger
2. `Table.tsx` — Tabellen-Definition (Spalten, Aktionen)
3. `TableWrapper.tsx` — Daten-Laden via React Query + Tabelle rendern

## Routing

Datei: `frontend/src/Router.tsx`

Alle Seiten verwenden Lazy-Loading (`React.lazy`).

## Verwandte Seiten

- [Komponenten](./komponenten.md)
- [Frontend-Internas](./frontend-internas.md)
- [Theme & Styling](./theme.md)
