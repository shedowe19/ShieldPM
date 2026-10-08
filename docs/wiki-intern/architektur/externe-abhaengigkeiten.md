# Externe Abhängigkeiten

## Zweck

Dokumentation aller wesentlichen externen Abhängigkeiten und deren Zweck.

## Backend-Abhängigkeiten

### Kern

| Paket            | Version | Zweck                             |
| ---------------- | ------- | --------------------------------- |
| `express`        | 5.2.1   | Web-Framework                     |
| `objection`      | 3.1.5   | ORM                               |
| `knex`           | 3.3.0   | SQL-Query-Builder und Migrationen |
| `better-sqlite3` | ^13.0.3 | SQLite-Treiber                    |
| `mysql2`         | ^3.24.5 | MySQL/MariaDB-Treiber             |
| `pg`             | ^8.23.1 | PostgreSQL-Treiber                |

### Sicherheit

| Paket                        | Version | Zweck                          |
| ---------------------------- | ------- | ------------------------------ |
| `jsonwebtoken`               | 9.0.3   | JWT-Erzeugung und -Validierung |
| `bcryptjs`                   | 3.0.3   | Passwort-Hashing               |
| `helmet`                     | 8.3.0   | HTTP-Security-Header           |
| `csrf-csrf`                  | ^4.0.3  | CSRF-Schutz                    |
| `express-rate-limit`         | 8.7.1   | Rate-Limiting                  |
| `otplib`                     | ^13.5.0 | TOTP (2FA)                     |
| `@simplewebauthn/server`     | ^14.0.3 | WebAuthn/Passkey               |
| `@duosecurity/duo_universal` | ^3.1.0  | Duo Security 2FA               |
| `openid-client`              | ^6.8.8  | OIDC-Authentifizierung         |

### Integrationen

| Paket                   | Version  | Zweck                        |
| ----------------------- | -------- | ---------------------------- |
| `@google/generative-ai` | ^0.24.1  | Google Gemini AI             |
| `telegraf`              | ^4.16.3  | Telegram Bot                 |
| `dockerode`             | ^5.0.1   | Docker API                   |
| `isomorphic-git`        | ^1.43.1  | Git-Operationen              |
| `ssh2`                  | ^1.17.0  | SSH-Verbindungen (Terminal)  |
| `ws`                    | ^8.22.0  | WebSocket-Server             |
| `systeminformation`     | ^5.33.15 | System-Info (CPU, RAM, etc.) |

### Hilfsbibliotheken

| Paket           | Version | Zweck                                       |
| --------------- | ------- | ------------------------------------------- |
| `ajv`           | ^8.20.0 | JSON-Schema-Validierung                     |
| `lodash`        | ^4.18.1 | Utility-Funktionen                          |
| `dayjs`         | 1.11.23 | Datums-Verarbeitung                         |
| `liquidjs`      | 10.30.0 | Template-Engine (Nginx-Configs)             |
| `archiver`      | ^8.0.0  | ZIP-Archivierung (GitOps Export)            |
| `js-yaml`       | ^5.4.3  | YAML-Verarbeitung                           |
| `cookie-parser` | ^1.4.7  | Cookie-Parsing                              |
| `proxy-agent`   | 8.0.2   | Umgebungsbasierte ausgehende Proxys und PAC |
| `get-uri`       | 8.0.1   | PAC-Quellen und Protokoll-Registry          |
| `basic-ftp`     | 6.2.2   | FTP-PAC mit eigenem Stream-Handler          |
| `punycode.js`   | 2.3.1   | Internationalisierte Domainnamen            |
| `signale`       | 1.4.0   | Logger                                      |

## Frontend-Abhängigkeiten (Auswahl)

| Paket                       | Version            | Zweck                                            |
| --------------------------- | ------------------ | ------------------------------------------------ |
| `react` / `react-dom`       | ^19.3.0            | UI-Framework                                     |
| `react-router-dom`          | ^7.18.4            | Routing                                          |
| `@tanstack/react-query`     | ^5.104.1           | Server-State                                     |
| `@tanstack/react-table`     | 9.2.6              | Tabellen                                         |
| `tailwindcss`               | ^4.3.3             | CSS-Framework                                    |
| `@radix-ui/*`               | diverse            | Accessible UI-Primitives                         |
| `i18next` / `react-i18next` | ^26.4.2 / ^17.0.16 | i18n                                             |
| `react-intl`                | ^12.1.4            | ICU-Formatierung für Oberflächentexte            |
| `@simplewebauthn/browser`   | ^14.0.0            | WebAuthn/Passkey im Browser                      |
| `framer-motion`             | ^14.0.0            | Animationen                                      |
| `recharts`                  | ^3.10.1            | Charts (Analytics)                               |
| `@xterm/xterm`              | ^6.0.0             | Terminal-Emulator                                |
| `lucide-react`              | ^1.52.0            | Icons                                            |
| `zod`                       | ^4.6.5             | Schema-Validierung                               |
| `react-hook-form`           | ^7.89.0            | Formulare                                        |
| `react-markdown`            | ^10.1.0            | Markdown-Rendering (AI Chat)                     |
| `d3-geo`                    | ^3.1.1             | Projektion und SVG-Pfade der Analytics-Weltkarte |
| `topojson-client`           | ^3.1.0             | TopoJSON-Umwandlung für die Analytics-Weltkarte  |
| `world-atlas`               | ^2.0.2             | Lokal gebündelte Länder-Topologie für Analytics  |

## Entwicklungsabhängigkeiten (Auswahl)

| Paket                    | Version / Einsatz                                            |
| ------------------------ | ------------------------------------------------------------ |
| `@biomejs/biome`         | ^2.5.15, JS/TS-Lint und Formatierung                         |
| `vitest`                 | Backend ^5.0.3, Frontend 5.0.3; Tests                        |
| `@testing-library/react` | ^16.3.3 im Frontend; Komponententests                        |
| `typescript`             | ^7.0.2 im Backend, 7.0.2 im Frontend; Typsicherheit          |
| `@electric-sql/pglite`   | 0.5.8; Backend-Tests mit eingebetteter PostgreSQL-Engine     |
| `vite`                   | ^8.3.3 im Backend, 8.3.3 im Frontend; Build und Testumgebung |

## Sicherheitsprüfung September 2026

Der dokumentierte `yarn audit --json`-Lauf meldete nach der damaligen Korrektur keine bekannten Befunde: Backend 0 bei 536 erfassten Abhängigkeiten, Frontend 0 bei 610. Zuvor wurden im Backend 13 hohe und 4 mittlere Befunde gemeldet; mehrere davon betreffen dieselben Pakete über unterschiedliche Pfade. Diese Zahlen sind ein historischer Snapshot vor späteren Dependency-Updates und keine aktuelle Sicherheitszusage.

Gezielt aktualisiert wurden `fast-uri` von 3.1.5 auf 3.1.6, `qs` von 6.15.3 auf 6.16.0, `nanoid` von 3.3.16 auf 3.3.18 und die transitive `@apidevtools/swagger-parser`-Kette für `js-yaml` auf 4.3.2. Die Resolutions bleiben auf die betroffenen Abhängigkeitspfade begrenzt; die Sicherheitstests kontrollieren die korrigierten Lockfile-Versionen.

## Sicherheitsprüfung Oktober 2026

Die erneute Prüfung von PR #149 beginnt mit 39 Backend-Meldungen zu 25 unterschiedlichen Advisories (17 hoch, 21 mittel, eine niedrig). Dieselbe betroffene Version kann dabei über mehrere Abhängigkeitspfade gezählt werden. Die folgenden Korrekturen bleiben auf die tatsächlichen Herstellerabhängigkeiten begrenzt:

| Abhängigkeit      | Korrigierte Version | Begrenzter Pfad                                  |
| ----------------- | ------------------- | ------------------------------------------------ |
| `axios`           | 1.20.0              | Duo Universal                                    |
| `fast-uri`        | 3.1.8               | Ajv, einschließlich dessen Schema-/ORM-Aufrufern |
| `brace-expansion` | 5.0.12              | Archiver                                         |
| `@grpc/grpc-js`   | 1.14.5              | Dockerode                                        |
| `ip-address`      | 10.7.3              | Express Rate Limit und Proxy Agent               |

Die Axios-Version bringt zugleich ihre reguläre `form-data`-Abhängigkeit 4.0.6 mit. Lockfile-Untergrenzen und tatsächliche URI-/IP-/FTP-Kompatibilitätsproben ergänzen die Anwendungssuiten. [Fast URI 3.1.8](https://github.com/fastify/fast-uri/releases/tag/v3.1.8) korrigiert zusätzlich zur vorherigen 3.1.7 die Hostnormalisierung; die ältere Empfehlung 3.1.7 reicht daher für die aktuelle Prüfung nicht. Die [gRPC-Herstellerwarnung](https://github.com/grpc/grpc-node/security/advisories/GHSA-m9gg-hp2v-232j) nennt 1.14.5 als korrigierte Version der vorhandenen 1.14-Linie. Ein Paketbefund beweist für sich allein keinen über ShieldPM erreichbaren Angriffspfad.

Beim damaligen Prüflauf blieb `basic-ftp` bei 5.3.1 im transitiven Pfad `proxy-agent → pac-proxy-agent → get-uri`. Die [Hersteller-Releases](https://github.com/patrickjuchli/basic-ftp/releases) korrigieren die bekannte Listing-Schwachstelle in 6.2.1; 6.2.2 enthält weitere Listing-/PASV-Korrekturen. Die Splitserver-Gegenprobe zeigte ein Hindernis für einen bloßen Major-Override: `get-uri` 8.0.1 behandelt eine Ablehnung von `downloadTo(...).then(...)` nicht, während FTP v6 passive Datenverbindungen standardmäßig an die Adresse der Kontrollverbindung bindet. Nach Rückgabe des Streams beendet die unbehandelte Promise-Ablehnung den isolierten Node-Prozess ohne anwendungseigenen Handler. ShieldPMs `backend/index.js` registriert dagegen einen Handler, der solche Ablehnungen loggt. Das ist eine Kombination aus strengerem Sicherheitsstandard und vorhandener Fehlerbehandlungslücke im Aufrufer; die Gegenprobe belegt weder einen allgemeinen Bruch der öffentlichen FTP-API noch einen garantierten Produktionsabbruch. Die vertiefte Nachprüfung und die anschließende Korrektur stehen unten. Eingebundener Vendorcode wird nicht gepatcht und die Warnung nicht unterdrückt.

Der frische lokale Audit nach den Korrekturen meldet bei 522 Backend-Abhängigkeiten nur noch den genannten einen hohen FTP-Befund (keine niedrigen, mittleren oder kritischen Meldungen); das Frontend meldet bei 629 Abhängigkeiten keine bekannten Befunde. Zuvor waren es 39 Backend-Meldungen.

Der jeweilige Paket-Audit-Snapshot und die abschließenden CI-Ergebnisse stehen im [Oktober-Prüfnachweis](../entwicklung/code-audit-coverage-2026-10.json) und in [PR #149](https://github.com/shedowe19/ShieldPM/pull/149). Diese Zahlen beschreiben den geprüften Zeitpunkt und sind keine dauerhafte Sicherheitszusage.

## Nachprüfung des Dependency-Updates in PR #150

Der frische Backend-Audit vom 7. Oktober 2026 meldete zusätzlich zum bekannten FTP-Befund zwei weitere Advisories:
`proxy-addr` 2.0.7 (kritisch) und `source-map-js` 1.2.1 (hoch). Die gezielten Auflösungen
`express/proxy-addr` auf 2.0.8 und `vite/postcss/source-map-js` auf 1.2.2 halten die Korrekturen auf den betroffenen
Backend-Abhängigkeitspfaden. Das Frontend verwendet bereits `source-map-js` 1.2.2.

Die [Proxy-Addr-Herstellerwarnung](https://github.com/jshttp/proxy-addr/security/advisories/GHSA-jqcg-44mw-7w3h)
betrifft die Zuordnung von IPv4-Adressen zu IPv6-Subnetzen bei vertrauenswürdigen Proxys. Das
[Source-Map-JS-Release 1.2.2](https://github.com/7rulnik/source-map-js/releases/tag/v1.2.2) korrigiert die
Offset-Verarbeitung indizierter Source Maps. Die bestehenden Lockfile-Untergrenzen werden um beide Pakete ergänzt;
Laufzeitproben prüfen zusätzlich die tatsächliche Proxy-Vertrauensprüfung und Source-Map-Verarbeitung.

Der Frontend-Audit meldete außerdem zwei Advisories für `seroval` 1.5.6 in den React-Query-Entwicklerwerkzeugen
(ein kritischer und ein hoher Befund). Die Auflösung `@tanstack/react-query-devtools/**/seroval` auf 1.6.3
korrigiert beide. Sie überschreibt bewusst Solids Versionsbereich `~1.5.4`; die verwendeten Exporte und die
JSON-Verarbeitung einschließlich des URL-Plugins werden gegen die tatsächlich aufgelöste Bibliothek geprüft.
`seroval-plugins` 1.5.6 bleibt kompatibel, da dessen Peer-Abhängigkeit `seroval` mit `^1.0` zulässt.

Die anschließenden Audits melden bei 522 Backend-Abhängigkeiten nur noch den bekannten hohen FTP-Befund
(keine kritischen, mittleren oder niedrigen Meldungen) und bei 629 Frontend-Abhängigkeiten keine bekannten Befunde.
Diese Zahlen sind ein Snapshot vom 7. Oktober 2026; die historischen Prüfungen oben bleiben unverändert.

## FTP-Nachprüfung vom 8. Oktober 2026

Der erneute Backend-Audit auf PR #150 vor der FTP-Korrektur meldete einen hohen Befund bei 522 Abhängigkeiten:
[GHSA-c475-qrg2-pj4r](https://github.com/patrickjuchli/basic-ftp/security/advisories/GHSA-c475-qrg2-pj4r)
(CVE-2026-102990). Eine manipulierte Unix-Verzeichniszeile verursacht quadratische CPU-Arbeit und kann den
Node.js-Eventloop blockieren. Die Herstellerkorrektur beginnt bei 6.2.1.

Die aktuelle Herstellerfassung 6.2.2 korrigiert außerdem
[GHSA-5rfr-xx34-2xxv](https://github.com/patrickjuchli/basic-ftp/security/advisories/GHSA-5rfr-xx34-2xxv)
(mittel, MLSD-Erkennung und PASV-Antwortparser). Dieser Befund erschien im damaligen Yarn-Audit noch nicht.
Die betroffenen regulären Ausdrücke sind auch in der damals installierten 5.3.1 vorhanden; für eine vollständige
Korrektur ist daher 6.2.2 maßgeblich. Die 40-MiB-Grenze für Listings begrenzt deren Größe, verhindert aber
keine übermäßige CPU-Arbeit beim Parsen.

Isolierte Parser-Gegenproben unter Node 26.10.0 bestätigen die Korrektur mit den tatsächlichen npm-Paketen:
Eine ungültige Unix-Zeile mit 32.782 Bytes benötigt in 5.3.1 rund 1,2 Sekunden, in 6.2.2 rund 1,3 Millisekunden.
MLSD- und PASV-Eingaben überschreiten mit 5.3.1 die jeweilige 2,5-Sekunden-Prozessgrenze, während 6.2.2 in
weniger als einer Millisekunde zurückkehrt. Das sind lokale Parser-Messungen, keine garantierten Laufzeiten;
die PASV-Probe bleibt mit 60.004 Bytes unter der Kontrollantwortgrenze.

Der tatsächliche Anwendungspfad ist an die Betriebskonfiguration gebunden:

- `backend/internal/remote-version.js`, `ip_ranges.js` und `certbot.js` erzeugen jeweils `new ProxyAgent()`.
- `HTTPS_PROXY`/`https_proxy` oder ersatzweise `ALL_PROXY`/`all_proxy` mit `pac+ftp://…` lässt diesen Agenten
  eine PAC-Datei per FTP laden; `NO_PROXY`/`no_proxy` kann den jeweiligen HTTPS-Aufruf ausnehmen.
- `pac-proxy-agent` lädt die Datei über `get-uri`. Wenn `MDTM` keine Änderungszeit liefert und nicht mit
  550 antwortet, ruft `get-uri` tatsächlich `Client.list()` auf. Eine lokale Gegenprobe mit regulärer
  Unix-Verzeichniszeile und `MDTM 500` bestätigt diesen Aufruf über die installierte Kette.
- Ohne FTP-PAC-Konfiguration wird dieser FTP-Pfad von den drei Aufrufern nicht verwendet. Die mitgelieferten
  Compose-/Umgebungsvorlagen setzen keine FTP-PAC-Konfiguration. Ein gewöhnlicher Proxy-Host oder eine
  HTTP(S)-PAC-Datei aktiviert diesen Pfad nicht.

Der Befund ist damit kein Fehlalarm; der nachgewiesene Angriffspfad erfordert einen konfigurierten FTP-PAC-Server,
der manipulierte Antworten liefert. Über die geprüften Aufrufer wurde kein davon unabhängiger Angriffspfad
eines gewöhnlichen Webbesuchers festgestellt. Das ist eine Aussage zur Code-Erreichbarkeit, keine Prüfung
der tatsächlichen Umgebung einer installierten Instanz.

Der Versionscheck (`/api/version/check`) benötigt keinen Login und kann bei ungefülltem oder abgelaufenem
Cache die bereits konfigurierte PAC-Quelle laden. Ein Aufrufer dieser Route kann die FTP-PAC-Adresse
jedoch nicht setzen. Auch der Cloudflare-Start-/Timer-Abruf kann dieselbe Betriebskonfiguration verwenden.

Die veröffentlichten Consumer bleiben `proxy-agent` 8.0.2 → `pac-proxy-agent` 9.1.0 → `get-uri` 8.0.1
mit `basic-ftp ^5.3.1`; eine reguläre Aktualisierung wählt deshalb noch keine korrigierte FTP-Version.
Die damalige Laufzeitsuite bestand erneut mit 17 Tests, prüfte aber keinen `MDTM`-zu-`LIST`-Fallback und
keine abgebrochene Übertragung. Für einen sicheren Versionswechsel mussten die Fehler der asynchronen
Übertragung an den zurückgegebenen Stream weitergeleitet und der Client zuverlässig geschlossen werden.
Frische isolierte FTP-Gegenproben bestätigen: reguläre Downloads funktionieren mit beiden Versionen;
eine mit 450 abgebrochene Übertragung beendet den isolierten Node-Prozess ohne anwendungseigenen Handler
wegen der unbehandelten Ablehnung bereits mit 5.3.1 und auch mit 6.2.2. ShieldPMs globaler Handler loggt
diese Ablehnung; der zurückgegebene Stream erhält dennoch keinen verlässlichen Transferfehler.
Ein getrennt auf `127.0.0.2` lauschender passiver Datenserver funktioniert mit 5.3.1,
während 6.2.2 die Kontrolladresse `127.0.0.1` verwendet und dadurch ebenfalls diese Fehlerbehandlungslücke
auslöst. `allowSeparateTransferHost` an `getUri()` durchzureichen konfiguriert den Client-Konstruktor nicht.
Der strengere Transferhost-Schutz darf dafür nicht pauschal abgeschaltet werden.

## FTP-Korrektur in PR #150

Das Backend bindet `basic-ftp` 6.2.2 direkt und exakt ein. Die begrenzte Resolution
`**/get-uri/basic-ftp` setzt auch den FTP-Consumer in der PAC-Kette auf diese Version;
`get-uri` 8.0.1 ist für die verwendete öffentliche Protokoll-Registry ebenfalls direkt deklariert.
Damit werden sowohl die Unix-Listing-Korrektur als auch die MLSD-/PASV-Korrekturen verwendet.

`backend/lib/ftp-uri.js` implementiert `getFtpUri()` mit dem Cache-/Stream-Vertrag von `get-uri`:
URL-Zugangsdaten und Pfad werden dekodiert, die Änderungszeit kommt von `MDTM` oder dem
Verzeichnis-Fallback, und unveränderte beziehungsweise fehlende Dateien behalten `ENOTMODIFIED`
beziehungsweise `ENOTFOUND`. Nach der Stream-Rückgabe besitzt der Handler die Übertragung selbst.
Er beendet den Stream erst nach erfolgreicher abschließender FTP-Antwort, leitet Transferfehler
an den Stream weiter und schließt den FTP-Client auch bei Fehlern oder vorzeitig geschlossenem Stream.
Der separate Schreibstream verhindert, dass `basic-ftp` den an den PAC-Consumer zurückgegebenen
Stream vor der endgültigen FTP-Antwort beendet. `new Client()` behält den standardmäßigen Schutz,
der passive Datenverbindungen an die Adresse der Kontrollverbindung bindet.

`backend/lib/proxy-agent.js` setzt bei der Modulinitialisierung dauerhaft `protocols.ftp = getFtpUri`
und exportiert denselben `ProxyAgent` wie das Herstellerpaket. Die drei produktiven Aufrufer
`remote-version.js`, `ip_ranges.js` und `certbot.js` importieren diesen Wrapper. Die anderen
PAC-Protokolle behalten ihre Hersteller-Handler; FTP-PAC bleibt verfügbar.

Die Registry wird einmal initialisiert und nicht für einzelne Requests vorübergehend umgeschaltet.
`get-uri` liest den Handler bei jedem Abruf aus seinem exportierten Registry-Objekt; auch ein bereits
importierter `PacProxyAgent` verwendet deshalb den neuen Handler. Eine eigene `PacProxyAgent`-Subklasse
würde dessen als privat deklarierte Methode `loadPacFile()` und zusätzlich das Routing von `ProxyAgent`
berühren. Das verbleibende Integrationsrisiko ist eine künftig separat installierte `get-uri`-Kopie
unter `pac-proxy-agent`; eine Prüfung des vollständigen Wrapper-zu-FTP-PAC-Pfades muss deshalb nach
Dependency-Änderungen erhalten bleiben.
Die neue Suite prüft diesen Pfad auch im strikten Unterprozess: Nach vollständigen PAC-Daten lehnt eine
abschließende FTP-Antwort 450 den ProxyAgent-Aufruf ab, ohne den HTTP-Zielserver aufzurufen oder eine
unbehandelte Promise-Ablehnung zu erzeugen.

Der anschließende lokale Backend-Audit meldet bei 522 erfassten Abhängigkeiten keine bekannten Befunde
in allen Schweregraden. Das ist der Snapshot nach der FTP-Korrektur vom 8. Oktober 2026; die Audit-Zahlen
vor der Korrektur bleiben als historische Nachweise erhalten. Die gezielten FTP-Tests und ihre Grenzen
stehen unter [Tests](../entwicklung/tests.md).

## Verwandte Seiten

- [Architektur-Überblick](./ueberblick.md)
- [Build](../entwicklung/build.md)
