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

## Validierung nach dem zweiten Durchgang

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

Nach Übertragung des zweiten Durchgangs meldete CodeQL vier weitere Befunde (`Bad HTML filtering regexp`) in `frontend/src/static/htmlPages.test.ts` und `turboLoader.test.ts`. Die Testhelfer extrahierten beziehungsweise entfernten Script-Tags über reguläre Ausdrücke, die großgeschriebene Tags nicht erfassten. Sie lesen die versionierten HTML-Dateien nun mit `DOMParser` und wählen beziehungsweise entfernen Script-Elemente über DOM-Methoden. Dateispezifische HappyDOM-Einstellungen deaktivieren dabei das Laden externer CSS- und JavaScript-Dateien. Die vorhandenen Verhaltenstests für Verzeichnisfilter, Wartungstimer und Turbo-Downloads bleiben erhalten; CodeQL wird unverändert ausgeführt.

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
| Formulare und API-Client       | Formularfehlermeldungen werden zuverlässig angezeigt; Anubis-Header und domainbasierte Antwortschlüssel behalten ihre Bedeutung. DDNS-, AI-, ChatOps-, GitOps- und Zertifikatsfelder verwenden den tatsächlichen API-Vertrag; ungespeicherte Eingaben und neuere Antworten bleiben erhalten.           |
| Turbo-Downloader               | Ignorierte oder falsche Range-Antworten erzeugen keine mehrfach zusammengesetzten Dateien. Streaming schreibt begrenzt und schrittweise, Wiederholungen enden bei dauerhaften HTTP-/Dateifehlern, Teilabrufe werden korrekt fortgesetzt.                                                               |
| Start und Installation         | Wiederholte Starts setzen Listener, Certbot-, GoAccess- und Nginx-Optionen reproduzierbar. Interne Default-Zertifikate funktionieren; Installer wartet begrenzt auf tatsächliche Betriebsbereitschaft. IPv4/IPv6, Ports und ACME-Profilnamen werden validiert.                                         |
| Werkzeuge und CI               | CrowdSec-Test läuft nur mit ausdrücklichem Ziel und begrenzten Versuchen; Wiki-Graph trennt Daten und HTML. Veralteter wirkungsloser Dependency-Workflow entfernt; parallele Image-Builds konkurrieren nicht mehr um dieselben Veröffentlichungstags.                                                  |

Alle geänderten Sicherheits- und Datenverträge werden mit Regressionen geprüft. Unter anderem reproduzierten sieben ausgewählte neue Auth-Testdateien 38 Fehlschläge auf dem vorherigen PR-Stand; die neuen Migrationsprüfungen reproduzierten einen echten PostgreSQL-Transaktionsabbruch. Diese Nachweise ergänzen die Gesamtsuiten; sie sind keine Aussage, dass jede theoretische Fehlerklasse entdeckt ist.

## Dritter vollständiger Durchgang im bestehenden PR

Ausgangspunkt dieser weiteren Prüfung ist PR #139 bei `08c956611400dbfc005f31543a92d2ed3ca88f4b`. Alle 1.519 dort versionierten Dateien sind erneut inventarisiert. Der [dateibasierte Nachweis](./code-audit-coverage-2026-09.json) enthält einen eigenen dritten Durchgang: 1.225 Dateien wurden vollständig gelesen, einschließlich aller zugewiesenen handgeschriebenen Produktionsquellen, Konfigurationen und Tests. Übersetzungen, Bilder, generierte Metadaten, Dokumentation und die eingebundene Fremdbibliothek sind getrennt klassifiziert. Die 14 Sprach-JSONs wurden auf Struktur, doppelte Schlüssel und die gemeinsamen Übersetzungsschlüssel geprüft; dies ist keine vollständige sprachliche Prüfung aller Übersetzungen.

| Bereich                   | Weitere bestätigte Korrekturen                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentifizierung         | Demo-Kontomutationen einschließlich 2FA/Avatar und kodierter IDs gesperrt; TOTP-Zeitschritte atomar verbraucht; Logout widerruft rotierte Nachfolger; verspäteter fehlgeschlagener Refresh löscht keine neueren Browsercookies. Unveränderte Profilflags überschreiben keinen zwischenzeitlichen Admin-Sperrstatus.                                                               |
| Ressourcenrechte          | Neue Zertifikats-/Access-List-Zuordnungen und Git-Deployment prüfen die jeweilige Eigentümersichtbarkeit. Die KI-Werkzeuge folgen den tatsächlichen Demo-Feld- und Tor-Regeln.                                                                                                                                                                                                    |
| Nginx                     | Veraltete Sicherungen werden nicht als Rollbackziel reaktiviert; statische Custom-Locations erhalten Git-/Symlink-Schutz; Bandbreitenzähler werden nur nach tatsächlicher Zuteilung vermindert. Einzeländerungen benötigen nur einen vollständigen Konfigurationstest beim Reload.                                                                                                |
| Integrationen             | WireGuard-Mutationen teilen dieselbe Queue; DDNS fasst überlappende Abfragen zusammen und erhält notwendige erzwungene Folgeabfragen. Wiederholter Terminal-/Docker-Start erzeugt keine zusätzlichen Listener. Tor meldet echte Startfehler und entfernt private Identitätsschlüssel aus Verwaltungsantworten.                                                                    |
| Daten und Startup         | SQLite-Umzug übernimmt bestätigte WAL-Transaktionen, sichert das vollständige Originalset vor Veröffentlichung und erhält es bei Fehlern. Historische Passwortmigration erkennt vollständige unterstützte Hashes; Terminal-Rollback erhält lange Schlüssel und vermeidet Duplikate beim erneuten Upgrade. Startup wartet auf den Konfigurations-Fingerprint.                      |
| API                       | Setup-Datenbankabfrage nur am relevanten Benutzer-POST; IP-Limit vor kostenintensiver Middleware. Gleichzeitige Schemaaufrufe teilen eine Kompilierung. Health-, Token-, Access-List- und Fehlerantworten sowie Auth-Schemanamen entsprechen dem Laufzeitvertrag.                                                                                                                 |
| Frontend                  | Verspätete Antworten und Cache-Rollbacks überschreiben keine neuere Sitzung; sieben CRUD-Hooks berücksichtigen tatsächliche Cachevarianten. Suchfelder bleiben während Laden/Fehler montiert. Formulare behalten ungespeicherte Eingaben. Keycloak-Issuer, optionale Git-Konfiguration, Clipboardfehler, Setup-/Passwortgrenzen, Passkey-Enter und Notiz-/DDNS-Rechte korrigiert. |
| Laufzeit und Installation | Socketbereinigung auf ShieldPM-Namen begrenzt; Env-Ersetzungen exakt verankert; Module, GeoIP-JSON, HSTS und Logging reversibel konfiguriert. Healthcheck berücksichtigt abgeleitete Loopback-Adressen. LXC-Templates enthalten keine wiederverwendbaren SSH-Hostschlüssel; Installer enthält WireGuard-Laufzeitpakete.                                                           |
| Effizienz                 | Weniger doppelte DB-, Schema-, Nginx-, Timer- und Netzwerkarbeit; Kartenprojektionen werden wiederverwendet und berücksichtigen die SVG-Seitenränder. Besitzanpassungen werden gebündelt und folgen keinen Symlinkzielen.                                                                                                                                                         |

Die Gegenprüfung führte unter anderem die neue Nginx-Testdatei gegen den unveränderten Ausgangsstand aus (sechs erwartete Fehlschläge), führte die Lua-Zählerblöcke tatsächlich aus und reproduzierte den verspäteten Refresh-Cookie-Verlust über HTTP. Datenmigrationen laufen mit SQLite und PGlite; die vollständige Nginx-Basisdatei wurde gegen `shedowe19/shieldpm-nginx` bei `e8cadd2fa66a6d66569d8f7485187fbcda00f294` abgeglichen. Ein zusätzlicher Fehlerpfad beim Sichern des SQLite-Originalsets wurde in der unabhängigen Gegenprüfung erkannt und abgesichert.

Nicht bestätigte Verdachtsfälle wurden verworfen: Die WireGuard-Verwaltung bleibt gemäß bestehender Policy auf Administratoren begrenzt; kein erfundenes Rechtefeld wurde ergänzt. Der PostgreSQL-Testadapter wurde wegen einer nicht produktiv bestätigten Zeitzonenhypothese nicht verändert.

### Validierung des dritten Durchgangs

| Prüfung                | Ergebnis                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------- |
| Backend / Vitest       | 133 Dateien, 903 Tests bestanden                                                                        |
| Frontend / Vitest      | 176 Dateien, 536 Tests bestanden                                                                        |
| Infrastruktur / Python | 37 Tests bestanden, keine Skips                                                                         |
| Frontend               | Locale-Check, TypeScript und Vite-Produktionsbuild erfolgreich                                          |
| Biome                  | Backend 343 und Frontend 579 Dateien, keine Fehler/Warnungen; je zwei bestehende Konfigurationshinweise |
| OpenAPI                | Vollständige Schema-Validierung und neue Antwortvertragstests erfolgreich                               |
| Markdown / Diff        | Geänderte Wiki-Seiten mit Prettier formatiert, `git diff --check` erfolgreich                           |

Insgesamt **1.476 bestandene Tests**, 174 mehr als beim vorherigen Stand. Verwendet wurde Node.js 26.8.1. Die lokalen Gesamtsuiten liefen mit `--maxWorkers=2`; der erste Frontend-Gesamtlauf wurde nach einem nativen Prozessabbruch beendet und vollständig wiederholt. Für die Markdown-Formatierung war ein geprüftes Prettier-2.8.8-Standalone-Bundle verfügbar. ShellCheck, Container-/Installer-/LXC-Builds und aktuelle Dependency-Audits werden in GitHub ausgeführt. Die Ergebnisse sind am aktuellen Commit in [PR #139](https://github.com/shedowe19/ShieldPM/pull/139) einsehbar.

## Betriebsrelevante Grenzen

- Live-Tests gegen das externe `shieldpm-nginx`-Image, echte ACME-/SSO-/DDNS-Anbieter, SSH, Tor und WireGuard benötigen die jeweilige Infrastruktur; die lokalen Tests mocken diese Dienste.
- Echte MySQL-/PostgreSQL-Netzwerkserver waren nicht verfügbar. SQLite-Importe einschließlich Fremdschlüsseln und Rollback werden tatsächlich ausgeführt. Die vollständige PostgreSQL-Migrationskette und Daten-Rollbacks laufen in PGlite mit der tatsächlichen PostgreSQL-Engine; Netzwerk-Treiberbetrieb und Mehrverbindungskonkurrenz deckt dieser Adapter nicht ab.
- Vor einem Enginewechsel muss die SQLite-Quelle einmal mit demselben Anwendungsschema gestartet werden. Bei abweichendem Schema bricht der Import vor Datenänderungen ab.
- GitOps enthält weiterhin keine Gesamttransaktion über Datenbank, Dateisystem und externe Prozesse. Fehler werden gemeldet und anschließendes Bereinigen wird unterbunden; bereits erfolgreiche Schritte können bestehen bleiben.
- Eine Änderung der Serverzeitzone für bereits gespeicherte Wartungstermine benötigt weiterhin eine gezielte Migration.
- Der optionale PUID-Modus passt weiterhin Besitz breit unter `/run`, `/tmp` und `/usr/local` an. Die neuen Aufrufe folgen keinen Symlinkzielen; eine vollständige Eingrenzung benötigt einen koordinierten Umbau der Socketpfade.
- Historische Migrationskorrekturen rekonstruieren keine bereits zuvor verlorenen Metadaten oder doppelt gehashten Passwörter. Der Terminal-Rollback verweigert bei bestehenden Tor-/Analytics-/Domainreferenzen die Änderung vor DDL.
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
