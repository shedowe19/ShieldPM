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

| Datei                                   | Zweck                                                                                                                   |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `Dashboard/CertificateExpiryWidget.tsx` | Zertifikats-Ablauf-Anzeige                                                                                              |
| `Dashboard/DashboardNotesWidget.tsx`    | Notizen-Widget                                                                                                          |
| `Dashboard/TopHostsWidget.tsx`          | Top-Proxy-Hosts sowie Hosts mit den meisten 4xx- oder 5xx-Antworten der letzten 24 Stunden, jeweils mit Analytics-Links |

## Tabellen-Pattern

Viele Seiten folgen einem dreistufigen Pattern:

1. `index.tsx` — Seite mit Layout und Modal-Trigger
2. `Table.tsx` — Tabellen-Definition (Spalten, Aktionen)
3. `TableWrapper.tsx` — Daten-Laden via React Query + Tabelle rendern

## Routing

Datei: `frontend/src/Router.tsx`

Alle Seiten verwenden Lazy-Loading (`React.lazy`).

`components/RouteErrorBoundary.tsx` fängt Render- und fehlgeschlagene Lazy-Importe sowohl für öffentliche als auch
authentifizierte Routen ab. Die zugängliche, in allen 13 Locales übersetzte Fehleransicht bietet ausschließlich einen
Seiten-Reload an; damit werden abgelehnte Lazy-Promises nicht fälschlich nur erneut gerendert. Nach einem Fehler setzt
sie den Tastaturfokus auf ihre Überschrift. Bei der Navigation auf eine andere authentifizierte Route setzt `resetKey`
den Boundary-Zustand zurück. `RouteErrorBoundary.test.tsx` deckt Renderfehler, abgelehnte Route-Chunks und den Fokus
der Fehleransicht ab.

## Verwandte Seiten

- [Komponenten](./komponenten.md)
- [Frontend-Internas](./frontend-internas.md)
- [Theme & Styling](./theme.md)
