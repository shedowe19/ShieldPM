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
| Backend / Vitest          | 84 Dateien, 451 Tests bestanden                                                                                |
| Frontend / Vitest         | 147 Dateien, 382 Tests bestanden                                                                               |
| Infrastruktur / Python    | 9 Tests bestanden                                                                                              |
| Frontend-Produktionsbuild | TypeScript und Vite erfolgreich                                                                                |
| Biome                     | Backend 292 und Frontend 548 Dateien; jeweils 0 Fehler und 0 Warnungen, je 2 bestehende Konfigurationshinweise |
| Shell                     | ShellCheck und Syntaxprüfung bestanden                                                                         |
| Abhängigkeiten            | Backend und Frontend jeweils 0 gemeldete Audit-Befunde                                                         |
| Änderungen                | `git diff --check` ohne Befunde                                                                                |

Insgesamt bestanden 842 Tests. Die Befehle sind unter [Tests](./tests.md) dokumentiert. Verwendete Laufzeit: Node.js 26.8.1. Abhängigkeiten bleiben über Yarn-Lockfiles reproduzierbar; ausschließlich gezielt betroffene transitive Sicherheitspakete werden angepasst.

## Betriebsrelevante Grenzen

- Live-Tests gegen das externe `shieldpm-nginx`-Image, echte ACME-/SSO-/DDNS-Anbieter, SSH, Tor und WireGuard benötigen die jeweilige Infrastruktur; die lokalen Tests mocken diese Dienste.
- Echte MySQL-/PostgreSQL-Server waren nicht verfügbar. Der Import wird mit SQLite inklusive Fremdschlüsseln und Rollback geprüft; PostgreSQL-Schemaerzeugung und Typkonvertierungen sind gesondert getestet.
- Vor einem Enginewechsel muss die SQLite-Quelle einmal mit demselben Anwendungsschema gestartet werden. Bei abweichendem Schema bricht der Import vor Datenänderungen ab.
- GitOps enthält weiterhin keine Gesamttransaktion über Datenbank, Dateisystem und externe Prozesse. Fehler werden gemeldet und anschließendes Bereinigen wird unterbunden; bereits erfolgreiche Schritte können bestehen bleiben.
- Eine Änderung der Serverzeitzone für bereits gespeicherte Wartungstermine benötigt weiterhin eine gezielte Migration.
- Optimierungen sind funktional geprüft; ein Lastvergleich unter Produktionsverkehr wurde nicht durchgeführt.

## Wiki-Prüfung

Die vorhandenen Modul-, Datenbank-, Frontend-, Sicherheits- und Betriebsseiten wurden geprüft und im selben Branch angepasst. Diese Seite bündelt Prüfbereich und Grenzen; sie ersetzt die Modulbeschreibungen nicht. Der Index verlinkt den Prüfbericht. Nicht ausgeführte Live-Integrationsprüfungen sind ausdrücklich oben dokumentiert.

## Verwandte Seiten

- [Tests](./tests.md)
- [Build](./build.md)
- [Datenbank](../daten/datenbank.md)
- [Modulübersicht](../module/README.md)
- [Sicherheit](../konfiguration/secrets-und-sicherheit.md)
