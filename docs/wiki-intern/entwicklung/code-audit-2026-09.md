# Codeprüfung September 2026

## Zweck und Prüfstand

Repositoryweite Fehler- und Optimierungsprüfung von ShieldPM, Ausgangspunkt `develop` bei Commit `c86ab74951ef331a907afd3e193d3a19cd5e45eb`. Die Korrekturen sind auf einem separaten Branch zusammengefasst; eine Versionsanhebung oder Veröffentlichung des laufenden Systems ist nicht Teil dieser Änderung.

Das Repository wurde vollständig inventarisiert (1.414 versionierte Dateien am Ausgangsstand; davon 821 Code-/Konfigurationsdateien der geprüften Quelltypen außerhalb der Dokumentation und eingebundener Fremdbibliotheken). Backend, Frontend, Datenbank, Nginx-/Zertifikatslogik, Integrationen und Installationsskripte wurden in getrennten Prüfbereichen untersucht. Automatische Tests und Syntax-/Lint-Prüfungen ergänzen die manuelle Prüfung. Dies ist keine formale Verifikation jeder möglichen Laufzeitkonfiguration und keine Zusicherung vollständiger Fehlerfreiheit.

## Wesentliche behobene Fehler

| Bereich                         | Korrektur und Wirkung                                                                                                                                                                                           |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Benutzerrechte                  | Eigene Profiländerungen erlauben keine Rechteausweitung; deaktivierte Konten und ausstehende 2FA gelten nicht als vollständig authentifiziert.                                                                  |
| Sitzungen / 2FA / OIDC          | Widerrufe bleiben nach erkanntem Refresh-Replay erhalten; Wiederherstellungscodes und Passkey-/Duo-Challenges werden einmalig verwendet; OIDC erhält geprüften State und reguläre Sitzungen.                    |
| Terminal / Zugriffslisten       | WebSockets benötigen den vertrauenswürdigen hostgebundenen Nginx-Nachweis; Basic-/SSO-Schutz gilt auch dort. Zugangsdaten, Pfade und Konfigurationsfelder werden überprüft.                                     |
| Domainnormalisierung            | Konfliktprüfung, Analytics, Anubis, Docker, Tor und GitOps verwenden die aktuelle Domainrelation.                                                                                                               |
| Nginx                           | Konfigurationsänderungen werden serialisiert und geprüft; eigene Root-Locations werden korrekt erkannt; interne Dateipfade bleiben intern verfügbar.                                                            |
| Zertifikate / PKI               | Erneuerung und Upload laden Nginx neu; Geheimnisse werden aus regulären Antworten entfernt; Certbot ist gegen parallele Prozesse abgesichert; Root-CA-Erstellung und Seriennummern sind nebenläufigkeitssicher. |
| Streams                         | Teiländerungen, neue Zertifikatsdomains, interne TLS-Zertifikate und überlappende Portbereiche werden korrekt behandelt.                                                                                        |
| Analytics                       | Fehlerhafte Eingaben werden verworfen; Batch-Transaktionen verhindern Doppelzählungen nach Teilfehlern; Folgepuffer bleiben bei langsamer Datenbank begrenzt.                                                   |
| Wartung                         | Browserzeit und API-Zeitpunkte sind eindeutig; Startgrenzen, End-only-Zeitpläne, entfernte Termine und deaktivierte Hosts werden korrekt behandelt.                                                             |
| Datenbankwechsel                | Alle Anwendungstabellen werden mit Fremdschlüsseln und einer Gesamttransaktion übernommen; Fehler erhalten Quelle und Zielbestand.                                                                              |
| DDNS / Cloudflare-IP-Netze      | DDNS meldet tatsächliche Fehler und überprüft öffentliche Zieladressen auch bei DNS-Auflösung. IPv6-Netzlisten werden vollständig validiert statt verworfen.                                                    |
| GitOps / Git Deploy             | Importfeldlisten, Domainbeziehungen, fehlende Exporte und Fehlerberichte korrigiert; fehlende Verzeichnisse lösen kein ungewolltes Löschen aus; Symlinks werden nicht verfolgt.                                 |
| Docker / Tor / WireGuard / Chat | Ereignisverarbeitung, Prozessstatus, Eigentümerprüfungen und Konfigurationsvalidierung korrigiert.                                                                                                              |
| OAuth2 / Cloudflared            | Veraltete Kindprozesse und Wiederholungen dürfen neuere Instanzen nicht überschreiben; Redirect-Domains stammen aus zugeordneten Hosts.                                                                         |
| Frontend                        | Abmeldung ohne Antwortkörper, gleichzeitige Token-Erneuerung, Benutzer-/Avatar-Speicherung, PHP-INI, Rate-Limits und Zertifikatsformulare korrigiert.                                                           |
| Installation / Update           | Datenmigration, Zertifikatsarchive, bestehende Konfiguration, Sonderzeichen in Zugangsdaten, Demo-Reset und Update-Recovery abgesichert.                                                                        |
| Effizienz                       | Liquid-Templatecache wird wiederverwendet; Domainabgleiche verwenden Sets; unnötige Refresh-Anfragen und doppelte Prozess-/Konfigurationsarbeit werden vermieden.                                               |

Die einzelnen Änderungen und ihre Verträge stehen auf den bestehenden Modulseiten. Die Regressionstests prüfen unter anderem echte Transaktionen mit temporären SQLite-Datenbanken, konkurrierende Aufrufe, Fehlerpfade und Formularaktionen.

## Validierung

| Prüfung                   | Ergebnis                                                                                                       |
| ------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Backend / Vitest          | 115 Dateien, 793 Tests bestanden                                                                               |
| Frontend / Vitest         | 172 Dateien, 485 Tests bestanden                                                                               |
| Infrastruktur / Python    | 24 Tests bestanden                                                                                             |
| Frontend-Produktionsbuild | TypeScript und Vite erfolgreich                                                                                |
| Biome                     | Backend 325 und Frontend 574 Dateien; jeweils 0 Fehler und 0 Warnungen, je 2 bestehende Konfigurationshinweise |
| Shell                     | ShellCheck und Syntaxprüfung bestanden                                                                         |
| Abhängigkeiten            | Backend und Frontend jeweils 0 gemeldete Audit-Befunde                                                         |
| Änderungen                | `git diff --check` ohne Befunde                                                                                |

Insgesamt bestanden nach dem zweiten vollständigen Durchgang 1.302 Tests (793 Backend, 485 Frontend, 24 Infrastruktur). Die Befehle sind unter [Tests](./tests.md) dokumentiert. Verwendete Laufzeit: Node.js 26.8.1. Abhängigkeiten bleiben über Yarn-Lockfiles reproduzierbar; PGlite 0.5.8 wurde ausschließlich für Backend-Tests ergänzt. Die aktuelle GitHub-Ausführung ist über [PR 139](https://github.com/shedowe19/ShieldPM/pull/139) nachvollziehbar.

## Nachprüfung von Pull Request 139

Die erste GitHub-Ausführung zeigte drei zusätzliche Probleme, die durch die lokale Prüfung nicht vollständig abgedeckt waren:

- **ShellCheck 0.9.0:** Das Migrationsskript verwendete eine verkettete `&&`-/`||`-Bedingung, die diese Runner-Version als SC2015 meldete. Eine ausdrückliche `if`-Bedingung erhält das Verhalten und besteht den vollständigen Workflow-Aufruf auch mit Version 0.9.0. Die neun Infrastrukturtests bleiben erfolgreich.
- **Duo / CodeQL:** State und vorläufiger Anmeldetoken wurden für den Anbieter-Redirect im Browser-Speicher abgelegt. Jetzt erhält der Browser ausschließlich ein kurzlebiges, mit AES-256-GCM verschlüsseltes HttpOnly-Cookie als unabhängige Bindung; serverseitig werden zweckgetrennte HMAC-Prüfwerte für Browserbindung und State sowie die Ablaufgrenze gespeichert. Die HTTP-Route erzeugt die zufällige Browserbindung; der Service erhält sie als Kontext und gibt ausschließlich die Anbieter-URL zurück. Die Challenge wird vor dem Duo-Austausch atomar verbraucht. Beide Duo-Endpunkte unterliegen CSRF-Schutz. Der Callback entfernt seine Parameter aus dem sichtbaren Verlauf; beim Rücksprung startet keine konkurrierende Session-Wiederherstellung.
- **Docker / GHCR:** Der PR-Workflow übersprang den Registry-Login und konnte das Nginx-Basisimage nicht anonym laden (HTTP 401). PRs aus demselben Repository melden sich nun für den Abruf an. PR-Images bleiben lokal auf dem Runner; Push, Multiarch-Veröffentlichung und Releases sind weiterhin für PR-Ereignisse gesperrt. Details und die Einschränkung für Fork-PRs stehen unter [Build](./build.md).

## Zweiter vollständiger Durchgang

Ausgangspunkt der erneuten Prüfung ist PR 139 bei `1822202d76751454ed7fe869417587e01c4f8724`, einschließlich unveränderter Dateien. Die dateibasierte [Prüfliste](./code-audit-coverage-2026-09.json) erfasst alle 1.462 damals versionierten Dateien: Alle 895 eigenen Code-/Konfigurationsdateien der inventarisierten Quelltypen wurden vollständig gelesen und den ausführbaren Tests, API-Schemas, Templates und Aufrufern gegenübergestellt. Weitere Konfigurationen und Hilfsdateien sind separat erfasst. Das eingebundene, minimierte `vis-network` ist als Fremdbibliothek ausgewiesen; Bilder, generierte Installationsdaten, Übersetzungen und Dokumentation sind ausdrücklich keine behauptete Zeile-für-Zeile-Sicherheitsprüfung fremden Codes oder vollständige sprachliche Revision.

Die Prüfung hat weitere Fehler außerhalb des ersten Diffs gefunden. Wesentliche zusätzliche Korrekturen:

| Bereich                        | Neuer Befund und Korrektur                                                                                                                                                                                                                                                                             |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| API, Demo, Rechte              | Ratenbegrenzung an den tatsächlich verwendeten Upstream-Pfad gehängt; Demo-Sperren für PUT und `me`; Berechtigungsänderungen erhalten die richtige Zeilen-ID.                                                                                                                                          |
| Benutzer und Wiederherstellung | Kontoanlage und Passwort-/Sitzungsänderungen atomar; konkurrierende anonyme Ersteinrichtungen serialisiert; nur Passwort-Auth-Typ und sichere bcrypt-Länge erlaubt. SQLite-CLI verändert nur aktive Passwortdatensätze des Zielkontos.                                                                 |
| OIDC und 2FA                   | Deaktivierte OIDC-Anmeldung serverseitig gesperrt; mehrere TOTP-Methoden berücksichtigt; Wiederherstellungscodes bei fehlgeschlagenen Änderungen erhalten und nach YubiKey-/Duo-Einrichtung tatsächlich angezeigt. YubiKey-Antworten werden an OTP/Nonce gebunden und mit konfiguriertem HMAC geprüft. |
| Datenbank                      | Alle Migrationen laufen in einer Transaktion auch auf PostgreSQL. Duplicate-Column-DDL und nicht portable JSON-Manipulation beseitigt; Domain-/mTLS-Rollback erhält aktuelle Werte; Schema-Callbacks warten Datenänderungen korrekt ab. Native PostgreSQL-Booleans bleiben aktiviert.                  |
| Analytics und Audit            | Hostzugriff verlangt aktuelle Berechtigungen statt alter JWT-Rollen; SQLite-Datumsfilter vergleichen tatsächliche UTC-Zeitpunkte. Fehlgeschlagene Teilabfragen mischen keine Daten verschiedener Hosts.                                                                                                |
| Nginx und Domains              | Aktuelle Domainrelation über den richtigen Objection-Hook geladen; gemeinsame Sperre und Wiederherstellung auch bei Reload-/Metadatenfehlern. IDN-, Wildcard-, TLS-, Authentik-, OIDC- und Rate-Limit-Verträge korrigiert.                                                                             |
| Zertifikate und PKI            | Unveränderlicher Providertyp, passende Request-Schemas, sichere Dateistufen und Sperren für Upload/Erneuerung/Löschung; DNS-Provider-Aliasse und Null-Sekunden-Propagation; fehlender CA-Schlüssel zerstört bestehende Vertrauensbasis nicht.                                                          |
| GitOps und Git Deploy          | Löschungen werden exportiert; fehlgeschlagene Pushes erneut übertragen; zwischenzeitliche Zugangsdatenrotation bleibt erhalten. Laufende Deployments dürfen nach Hostlöschung oder Konfigurationswechsel keine veralteten Dateien aktivieren.                                                          |
| Terminal und Tunnel            | WebSocket-Fehler abgefangen und abgebrochene Verbindungen erzeugen keine verwaisten SSH-Sitzungen. Tor-Neuzuordnung prüft beide Hosts und verschiebt Domains atomar. Cloudflared-Starts werden serialisiert.                                                                                           |
| WireGuard, Docker, Chat        | Peeranlage und Subnetzänderungen teilen sich eine Sperre; deaktivierte Peers bleiben deaktiviert. Docker-Labels werden vor Konfigurationserzeugung validiert. Gestoppte Telegram-Starts brechen ihre laufenden HTTP-Anfragen ab.                                                                       |
| KI                             | Beschreibender Fließtext führt keine Werkzeuge aus; Benutzeranlage verwendet echte Passwort-Auth-Verträge. Werkzeuge ohne nutzbare Token-Rückgabe werden nicht mehr als erfolgreiche Anmeldung ausgegeben.                                                                                             |
| Formulare und API-Client       | Formularfehlermeldungen werden zuverlässig angezeigt; Anubis-Header und domainbasierte Antwortschlüssel behalten ihre Bedeutung. DDNS-, AI-, ChatOps-, GitOps- und Zertifikatsfelder verwenden den tatsächlichen API-Vertrag; ungespeicherte Eingaben und neuere Antworten bleiben erhalten.              |
| Turbo-Downloader               | Ignorierte oder falsche Range-Antworten erzeugen keine mehrfach zusammengesetzten Dateien. Streaming schreibt begrenzt und schrittweise, Wiederholungen enden bei dauerhaften HTTP-/Dateifehlern, Teilabrufe werden korrekt fortgesetzt.                                                               |
| Start und Installation         | Wiederholte Starts setzen Listener, Certbot-, GoAccess- und Nginx-Optionen reproduzierbar. Interne Default-Zertifikate funktionieren; Installer wartet begrenzt auf tatsächliche Betriebsbereitschaft. IPv4/IPv6, Ports und ACME-Profilnamen werden validiert.                                         |
| Werkzeuge und CI               | CrowdSec-Test läuft nur mit ausdrücklichem Ziel und begrenzten Versuchen; Wiki-Graph trennt Daten und HTML. Veralteter wirkungsloser Dependency-Workflow entfernt; parallele Image-Builds konkurrieren nicht mehr um dieselben Veröffentlichungstags.                                                  |

Alle geänderten Sicherheits- und Datenverträge werden mit Regressionen geprüft. Unter anderem reproduzierten sieben ausgewählte neue Auth-Testdateien 38 Fehlschläge auf dem vorherigen PR-Stand; die neuen Migrationsprüfungen reproduzierten einen echten PostgreSQL-Transaktionsabbruch. Diese Nachweise ergänzen die Gesamtsuiten; sie sind keine Aussage, dass jede theoretische Fehlerklasse entdeckt ist.

## Betriebsrelevante Grenzen

- Live-Tests gegen das externe `shieldpm-nginx`-Image, echte ACME-/SSO-/DDNS-Anbieter, SSH, Tor und WireGuard benötigen die jeweilige Infrastruktur; die lokalen Tests mocken diese Dienste.
- Echte MySQL-/PostgreSQL-Netzwerkserver waren nicht verfügbar. SQLite-Importe einschließlich Fremdschlüsseln und Rollback werden tatsächlich ausgeführt. Die vollständige PostgreSQL-Migrationskette und Daten-Rollbacks laufen in PGlite mit der tatsächlichen PostgreSQL-Engine; Netzwerk-Treiberbetrieb und Mehrverbindungskonkurrenz deckt dieser Adapter nicht ab.
- Vor einem Enginewechsel muss die SQLite-Quelle einmal mit demselben Anwendungsschema gestartet werden. Bei abweichendem Schema bricht der Import vor Datenänderungen ab.
- GitOps enthält weiterhin keine Gesamttransaktion über Datenbank, Dateisystem und externe Prozesse. Fehler werden gemeldet und anschließendes Bereinigen wird unterbunden; bereits erfolgreiche Schritte können bestehen bleiben.
- Eine Änderung der Serverzeitzone für bereits gespeicherte Wartungstermine benötigt weiterhin eine gezielte Migration.
- Optimierungen sind funktional geprüft; ein Lastvergleich unter Produktionsverkehr wurde nicht durchgeführt.
- Der Widerruf von Refresh-Sitzungen macht bereits ausgegebene Access-JWTs nicht sofort ungültig. Die bestehende Speicherung von TOTP-Secrets wurde nicht durch eine neue Verschlüsselungsmigration ersetzt.
- Browser-E2E war lokal nicht ausführbar: Der benötigte Chromium-Download vom Playwright-CDN scheiterte an wiederholten Netzwerk-Zeitüberschreitungen. DOM-Tests und der Produktionsbuild sind separat ausgewiesen.

## Wiki-Prüfung

Die vorhandenen Modul-, Datenbank-, Frontend-, Sicherheits- und Betriebsseiten wurden geprüft und im selben Branch angepasst. Diese Seite bündelt Prüfbereich und Grenzen; sie ersetzt die Modulbeschreibungen nicht. Der Index verlinkt den Prüfbericht. Nicht ausgeführte Live-Integrationsprüfungen sind ausdrücklich oben dokumentiert.

## Verwandte Seiten

- [Tests](./tests.md)
- [Build](./build.md)
- [Datenbank](../daten/datenbank.md)
- [Modulübersicht](../module/README.md)
- [Sicherheit](../konfiguration/secrets-und-sicherheit.md)
