# Codeprüfung Oktober 2026

## Zweck und Prüfbereich

Am 4. Oktober wurde [PR #149](https://github.com/shedowe19/ShieldPM/pull/149) ausgehend von `1838bf5d6c8428843eb777c1534aa66fa8469251` erneut geprüft. Das Inventar umfasst 1.752 versionierte Dateien. Backend, Frontend, Nginx, GeoIP-Start, Installer, CI und Wiki-Werkzeuge wurden in getrennten Bereichen untersucht. Der [Prüfnachweis](./code-audit-coverage-2026-10.json) hält Umfang, Methoden und Grenzen fest.

Die Prüfung verbindet Quelllektüre, Abgleich zwischen Berechtigungen und aufrufenden Modulen, repositoryweite Mustersuchen und ausführbare Regressionen. Inventarisierung bedeutet keine vollständige Lektüre jeder Datei. Übersetzungen, Assets und eingebundene Fremdbibliotheken wurden nicht sprachlich beziehungsweise manuell Zeile für Zeile geprüft. Die Ergebnisse sind keine Zusicherung vollständiger Fehlerfreiheit.

## Bestätigte Korrekturen

| Bereich                  | Auslöser und korrigiertes Verhalten                                                                                                                                                                                                                                                                                              |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Host-Monitor             | Die Capability-Prüfung allein beschränkt keine Host-ID auf ihren Eigentümer. Konfiguration, Verlauf und manuelle Prüfungen berücksichtigen nun `permission_visibility` und den aktuellen Eigentümer.                                                                                                                             |
| Upload-Relay             | Dieselbe fehlende Besitzprüfung erlaubte eingeschränkten Benutzern Sitzungszugriffe für fremde Hosts. Die API prüft nun vor jedem Relayaufruf den aktiven Host einschließlich Sichtbarkeit und Eigentümer.                                                                                                                       |
| Benutzer und Anmeldung   | Gleichzeitige Benutzererstellungen oder E-Mail-Änderungen konnten dieselbe normalisierte Adresse beanspruchen. Verfügbarkeit und Schreibvorgang laufen nun nach dem gemeinsamen Singleton-Rowlock in derselben Transaktion. Bei bereits vorhandenen mehrdeutigen Adressen verweigern Passwort- und OIDC-Anmeldung die Zuordnung. |
| Host-Report              | Der Report verwendete ein nicht vorhandenes `visibility`-Feld. Alle vier Hostzähler erhalten nun das tatsächliche `permission_visibility`; gelöschte Hosts bleiben ausgeschlossen.                                                                                                                                               |
| GitOps / PostgreSQL      | Explizit wiederhergestellte IDs ließen die Sequenz unverändert und verursachten beim nächsten regulären Anlegen einen Primärschlüsselkonflikt. Die gesperrte Importtabelle und ihre Sequenz werden nun im selben PostgreSQL-Schreibvorgang abgeglichen; eine bereits höhere Sequenz wird nicht zurückgesetzt.                    |
| Firewall-Texte           | Gültige lange Unicode- oder Escape-Texte konnten das Lua-Limit des Nginx-Konfigurationsparsers überschreiten. Öffentliche Gründe, Quellen, Nachricht und Kontaktlink verwenden nun ebenfalls begrenzte Unicode-sichere Literale.                                                                                                 |
| ACME / Authentifizierung | Die statische HTTP-01-Challenge erbte `auth_request` beziehungsweise Lua-Authentifizierung. Nur die bestehende Challenge-Location deaktiviert diese Access-Phase; normale Pfade behalten ihre Zugriffskontrollen.                                                                                                                |
| Zertifikatsbereinigung   | Nach einem verzögerten Reload konnte ein alter Host-Snapshot gleichzeitig geänderte Metadaten überschreiben. Erfolg und Statusrollback aktualisieren nur die Nginx-Statusfelder anhand der aktuellen Metadaten.                                                                                                                  |
| IPv6-Upstreams           | Rohe IPv6-Literale bestanden nginx -t, lieferten bei echten Anfragen jedoch HTTP 500. Default- und Custom-Proxy-Locations formatieren sie für HTTP(S) nun mit Klammern; gespeicherte Eingaben sowie Domain-, IPv4- und Socketziele bleiben erhalten.                                                                             |
| WireGuard-Peers          | Die Oberfläche verwendete auch nach Änderung des Servernetzes `10.8.0.0/24`. Neue Peers warten nun auf die aktuelle Serverkonfiguration und übernehmen deren Subnetz; manuelle Eingaben und gespeicherte Peerwerte bleiben erhalten.                                                                                             |
| WireGuard-Hilfe          | Der Hilfeaufruf verwies auf eine nicht vorhandene Dokumentsektion. Deutsche und englische Hilfe sind nun im tatsächlichen Help-Loader registriert; andere Sprachen verwenden dessen englischen Fallback.                                                                                                                         |
| SQLite-Installer         | Ein Providerwechsel aktivierte die nicht unterstützte Altvariable `DB_SQLITE_FILE` und brach anschließend an der Umgebungsvalidierung ab. Die Auswahl hält diese Variable bei jedem Provider auskommentiert.                                                                                                                     |
| Wiki-Graph               | Relative Markdown-Links mit Abschnittsankern fehlten im Graph; am Ausgangsstand waren 24 Verweise betroffen. Sie werden nun auf die jeweilige Seite aufgelöst und einzeln gezählt.                                                                                                                                               |
| Relay-Bereinigung        | Gleichzeitiges Löschen und Bereinigen einer Sitzung konnte eine unbehandelte Promise-Ablehnung und Prozessabbruch verursachen. Verschwundene Sitzungen werden idempotent behandelt; Init-/Timerfehler werden ausdrücklich protokolliert.                                                                                         |
| Auth-Formulargrenze      | Login und Token-Erneuerung akzeptierten seitenübergreifende Formular-POSTs und stellten Auth-Cookies aus. Token-POSTs und erste Benutzeranlage akzeptieren nun JSON oder tatsächlich bodylose Cookie-Anfragen; andere Medientypen erhalten vor Cookie-Erzeugung HTTP 415.                                                        |

## Validierung

Die neuen Regressionen verwenden echte Access-Capabilities und SQLite für Sichtbarkeit, die PostgreSQL-Engine in PGlite für GitOps und Benutzertransaktionen sowie die tatsächlichen React-Formulare und Help-Loader. Der Installertest führt die echte Providerauswahl und anschließend den Umgebungsvalidator aus. Nginx wird mit den tatsächlichen Templates geprüft; die Challenge-Regression verwendet statische Dateien und lokale Auth-Upstreams statt einer vorzeitig antwortenden `return 200`-Location.

TypeScript, Biome, Frontend-Produktionsbuild und das komprimierte Bundle-Budget ergänzen die Funktionsprüfungen. Die geänderten Wiki-Seiten wurden mit Prettier formatiert, relative Links kontrolliert und der Offline-Graph neu erzeugt. Aktuelle Ergebnisse der vollständigen CI, der beiden Containerarchitekturen und der Reviewprüfung stehen am veröffentlichten Commit in PR #149.

Lokale Gesamtläufe nach dem Sourcefreeze: **1.882 Backendtests** bestanden (vier ausgewiesene Skips), **830 Frontendtests** bestanden. Infrastruktur: 127 Fälle, davon 125 bestanden und zwei wegen lokaler OS-Grenzen übersprungen. Der native Vollmodul-Nginx-Smoke besteht **256 Prüfungen mit neun protokollierten Hauptsperren**. Der Build liegt mit 1.280.851 / 1.285.000 JavaScript-gzip-Bytes und 16.325 / 16.600 CSS-Bytes im Budget. Der aktualisierte Wiki-Graph enthält 91 Knoten und 612 Kanten; 650 relative Dateiverweise sind gültig.

## Grenzen und verbleibende Hinweise

- Lokale JavaScript-Prüfungen verwenden Node.js 24.19.0; die unterstützte Node.js-26-Laufzeit wird zusätzlich in CI geprüft.
- PGlite führt echtes PostgreSQL aus, verwendet im Testadapter jedoch eine einzelne Verbindung. Wartende Rowlocks zwischen mehreren Netzwerkverbindungen sind damit nicht dynamisch geprüft.
- E-Mail-Claims verwenden unter PostgreSQL ausdrücklich `READ COMMITTED`; eine abweichende Server-Standardisolation übernimmt der Claim nicht. SQLite und MySQL behalten ihren bisherigen Transaktionsvertrag.
- Der Auth-Formularfall wird mit echten HTTP-Anfragen gegen die App und dem dokumentierten Cookie-Verarbeitungsmodell geprüft; ein vollständiger Browser-Exploit wird nicht behauptet.
- Echte externe ACME-/SSO-Anbieter, eine vollständige Native-/LXC-Installation und ein Produktionsdeployment werden nicht ausgeführt. Die lokalen Nginx-Prüfungen verwenden kontrollierte Upstreams.
- GitOps besitzt weiterhin keine Gesamttransaktion über Datenbank, Dateisystem und externe Prozesse. Diese bereits dokumentierte Betriebsgrenze bleibt bestehen.
- Bereits gespeicherte doppelte Benutzeradressen werden nicht automatisch geändert oder gelöscht; ihre Anmeldung scheitert kontrolliert, bis ein Administrator die Adressen korrigiert.
- Die vorherige CI meldet zwei bekannte CodeQL-Befunde im eingebetteten minimierten Wiki-Graph-Vendorcode und 39 beratende Backend-Abhängigkeitsmeldungen. Sie werden getrennt von bestätigten Produktfehlern behandelt; der aktuelle Stand ist in PR #149 ausgewiesen. Es werden keine Befunde unterdrückt.

## Wiki-Prüfung

Die betroffenen Modul-, Datenbank-, Deployment-, Report- und Werkzeugseiten wurden im selben Branch angepasst. Diese neue Seite dokumentiert den Durchgang, der Index verweist darauf. Neue funktionale Wiki-TODOs sind nicht erforderlich; die oben genannten Test- und Betriebsgrenzen bleiben ausdrücklich sichtbar.

## Verwandte Seiten

- [Tests](./tests.md)
- [Codeprüfung September 2026](./code-audit-2026-09.md)
- [IP-Firewall](../module/ip-firewall.md)
- [Benutzer und Authentifizierung](../module/benutzer-auth.md)
- [GitOps](../module/gitops.md)
- [WireGuard](../module/wireguard.md)
- [Deployment](./deployment.md)
- [Wiki-Pflege](../wiki-pflege.md)
