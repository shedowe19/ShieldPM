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

| Datei                                   | Zweck                                                                                                                                                                                   |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Dashboard/CertificateExpiryWidget.tsx` | Zertifikats-Ablauf-Anzeige                                                                                                                                                              |
| `Dashboard/DashboardNotesWidget.tsx`    | Notizen-Widget                                                                                                                                                                          |
| `Dashboard/TopHostsWidget.tsx`          | Top-Proxy-Hosts sowie Hosts mit den meisten übertragenen Bytes, 4xx-/5xx-Antworten oder der höchsten durchschnittlichen Antwortzeit der letzten 24 Stunden, jeweils mit Analytics-Links |

## Tabellen-Pattern

Viele Seiten folgen einem dreistufigen Pattern:

1. `index.tsx` — Seite mit Layout und Modal-Trigger
2. `Table.tsx` — Tabellen-Definition (Spalten, Aktionen)
3. `TableWrapper.tsx` — Daten-Laden via React Query + Tabelle rendern

## Fehlerzustände und konsistente Bedienung

- Proxy-, Redirect-, Dead-Host- und Stream-Tabellen berücksichtigen neben `enabled` den tatsächlichen
  Aktivierungsstatus `meta.nginxOnline`. Ein fehlgeschlagener Nginx-Ladevorgang wird als offline angezeigt;
  die Fehlerdetails stehen am Status. Fehlgeschlagene Aktivierungsaktionen zeigen eine Fehlermeldung.
  Nach dem Löschen eines Dead-Hosts wird die Liste neu geladen. Leere, inzwischen ungültige Ergebnisseiten
  bei Proxy-Hosts und Audit-Logs werden auf die letzte verfügbare Seite zurückgesetzt.
- Die Zertifikatstabelle bietet ACME-Erneuerung nur für Let's-Encrypt-Zertifikate mit Verwaltungsrecht an.
  Fehler beim Root-CA-Download werden angezeigt. Das Ablauf-Widget erkennt auch Zertifikate, die erst
  innerhalb des aktuellen Tages abgelaufen sind. Fehlgeschlagene Notizlöschungen werden gemeldet.
- Analytics lädt Übersicht und Zeitreihe gleichzeitig und übernimmt erst ein vollständiges Wertepaar.
  Beim Wechsel von Host oder Zeitraum werden bisherige Daten gelöscht, damit Fehler keine Kennzahlen
  des vorherigen Hosts unter einer neuen Auswahl anzeigen. Ladefehler sind sichtbar; Offline-Wechsel
  beenden den Ladeindikator und verwerfen verspätete Antworten. Diagramme bleiben auf kleinen Bildschirmen
  innerhalb ihrer Rasterspalte.
- Sicherheitsaktionen besitzen explizit `type="button"`, damit sie in eingebetteten Profilformularen
  keine Profilspeicherung auslösen. TOTP-Einrichtung löst auch unter React StrictMode nur eine Anfrage aus.
  Ausstehende Prüfungen blockieren doppelte Eingaben, konkurrierende Wiederherstellungscode-Aktionen und
  das Schließen der Einrichtung. YubiKey- und Duo-Einrichtung zeigen neu erzeugte Wiederherstellungscodes
  wie TOTP und Passkeys an. Fehler beim Laden aktiver Faktoren erscheinen als Fehleransicht.
- WireGuard-Einstellungen lassen sich erst nach erfolgreichem Laden bearbeiten. Hintergrundabfragen
  überschreiben keine begonnenen Eingaben; ungültige Ports und Änderungen während des Speicherns sind
  gesperrt. Speicherfehler bleiben sichtbar. Tunnel-Seiten zeigen Ladefehler; Tor unterscheidet dabei
  API-Fehler vom Zustand des Daemons. Kopierbestätigungen erscheinen erst nach erfolgreichem Zugriff
  auf die Zwischenablage, und laufende Tunnel-Aktionen sperren konkurrierende Änderungen.

## Formularzustand, Rechte und Kartenbedienung

- Proxy-Host-, Access-List- und DDNS-Dialoge initialisieren ihre Formulare erst nach erfolgreichem Laden.
  Hintergrundaktualisierungen setzen laufende Änderungen nicht mehr zurück. Bei OAuth2-Proxy zeigt auch
  `keycloak-oidc` das erforderliche Issuer-Feld; ein deaktivierter Authentik-Eintrag zählt nicht als
  Zugriffsschutz einer ansonsten leeren Access List.
- Proxy-Host- und Audit-Log-Suchfelder bleiben während neuer Anfragen sowie nach Fehlern verfügbar und
  behalten den Fokus. Leerzeichen bleiben beim Tippen erhalten; erst die Anfrage normalisiert den Suchtext.
  Die Filter können dadurch auch nach einer abgelehnten Anfrage korrigiert oder zurückgesetzt werden.
- ChatOps bewahrt ungespeicherte Eingaben bei Hintergrundaktualisierungen, zeigt eingegebene Bot-Tokens
  verdeckt an und sperrt konkurrierende Änderungen während des Speicherns oder Löschens. Löschfehler
  erscheinen als Fehlermeldung.
- Das Notizen-Widget lädt Daten nur mit Leserecht. Hinzufügen, Bearbeiten und Löschen benötigen
  Verwaltungsrecht; fehlgeschlagene Leseanfragen erscheinen nicht als leere Notizliste. Auch der
  Hinzufügen-Knopf einer leeren DDNS-Tabelle berücksichtigt das Verwaltungsrecht.
- Die Ersteinrichtung sowie Passwortdialoge prüfen neue Passwörter mit 8 bis 72 Zeichen vor. Die
  serverseitige Grenze von 72 UTF-8-Bytes bleibt zusätzlich maßgeblich. Nach erfolgreicher Benutzeranlage
  wird der Einrichtungsstatus auch dann aktualisiert, wenn die automatische Anmeldung fehlschlägt.
  Enter im Passkey-Namen startet dessen Registrierung, ohne das umgebende Profilformular abzusenden.
- Die Weltkarte berechnet Länderpfade und Mittelpunkte einmal pro Projektion. Zoomen am Mauszeiger und
  Verschieben berücksichtigen die freien Ränder des SVG-Viewports auch bei abweichendem Seitenverhältnis.

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
