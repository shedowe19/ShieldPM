# Host-Arbeitsbereich

Der Arbeitsbereich unter `/nginx/workspace` kombiniert Tags, persönliche Ansichten und wiederverwendbare Sicherheits-/Ratenprofile. Die vorhandene Proxy-Host-Liste bleibt der Einstieg für einzelne Hosts und deren vollständige Bearbeitung.

## Daten und Berechtigungen

`proxy_host_tag` speichert höchstens 20 eindeutige Tags je Host. Ein Tag besteht aus bis zu 32 Kleinbuchstaben, Ziffern, Punkten, Unterstrichen oder Bindestrichen. Alle angegebenen Tags müssen beim Filtern zutreffen. Weitere Filter sind Domain, Aktivierung, Monitorzustand und Zertifikatsablauf innerhalb von 0–365 Tagen. Gefiltert wird vor der Datenbank-Paginierung mit höchstens 100 Zeilen.

`host_workspace_item` enthält benutzereigene Ansichten (`view`) und Profile (`profile`); Name und Typ sind pro Benutzer eindeutig. Auch Administratoren sehen über diese API nur ihre eigenen gespeicherten Elemente. Die Host-Sichtbarkeit und jede Schreibberechtigung folgen den vorhandenen `proxy_hosts`-Capabilities. Tags anderer Besitzer lassen sich ohne entsprechende Host-Berechtigung nicht ändern.

`GET /api/nginx/host-workspace/options` liefert für Auswahllisten ausschließlich IDs und Domains. Weder interne Metadaten noch SSH-/Git-/Wasm-Zugangsdaten werden geladen oder ausgegeben. Analytics verwendet diese Projektion.

## Profile prüfen und anwenden

Ein Profil enthält ausschließlich explizite Einstellungen: Exploit-Schutz, CrowdSec, HTTPS-Zwang, HTTP/2, HSTS einschließlich Subdomains, Anfragerate/-intervall/-spitze und Bandbreitenlimit. Ziele, Domains, Zertifikate, Zugangsdaten und freie Nginx-Direktiven gehören nicht zu einem Profil. Ein TLS-Profil, das ein Zertifikat voraussetzt, wird für Hosts ohne Zertifikat abgewiesen.

1. Bis zu 100 Hosts auswählen und ein gespeichertes Profil wählen.
2. Die Vorschau zeigt die alten und neuen Werte sowie Berechtigungsfehler je Host. Sie schreibt noch nichts.
3. Der Server signiert den Plan mit einem HMAC. Er gilt fünf Minuten und bindet Benutzer, Profildefinition und die relevanten aktuellen Host-Felder.
4. Beim Anwenden werden Berechtigungen und Host-Zustand erneut geprüft. Veränderte oder nicht mehr zugängliche Hosts werden mit eigenem Ergebnis übersprungen.
5. Zugelassene Hosts werden in kurzen Datenbanktransaktionen geändert und unter einer gemeinsamen Konfigurationssperre durch einen Nginx-Batch aktiviert. Eine langsame Aktivierung hält keine Datenbanktransaktion offen.

Ein fehlgeschlagener Batch stellt seine Konfigurationsdateien wieder her. Der Arbeitsbereich kompensiert die geschriebenen Felder, ohne zwischenzeitliche unabhängige Änderungen zu überschreiben. Bei konkurrierenden Änderungen derselben Felder meldet er einen Konflikt und rendert den aktuellen Datenbankzustand erneut. Die [Host-Versionen](./host-revisionen.md) erfassen Ausgangs- und erfolgreich aktivierte Zustände. Audit-Einträge verwenden den vorhandenen Typ `proxy-host`.

Eine Änderung der Auswahl, Ansicht oder Profilwahl verwirft eine vorhandene Vorschau. Ein verspätetes Anfrageergebnis darf diese Vorschau nicht wieder einblenden. Der Browser bricht veraltete Listenabfragen über React Query ab.

## Quellstellen und Nachweise

- `backend/internal/host-workspace.js`, `backend/routes/nginx/host_workspace.js`
- `backend/migrations/20261017190600_host_workspace.js`
- `frontend/src/pages/HostWorkspace/`, `frontend/src/hooks/useHostOptions.ts`
- SQLite-/PostgreSQL-Tests: `backend/test/internal/host-workspace.spec.js`
- Bedienabläufe einschließlich verspäteter Vorschau: `frontend/src/pages/HostWorkspace/index.test.tsx`

## Verwandte Seiten

- [Umsetzungsnachweis](../entwicklung/feature-implementation-2026-10-17.md)
- [API-Routen](../api/routen.md)
- [Host-Versionen](./host-revisionen.md)
