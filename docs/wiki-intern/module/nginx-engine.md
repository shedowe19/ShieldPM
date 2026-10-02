# Nginx-Engine

## Zweck

Dokumentation der zentralen Nginx-Konfigurationsengine.

## Kontext

Die Nginx-Engine ist das "Gehirn" von ShieldPM. Sie liest den Datenbankzustand, rendert Liquid-Templates und schreibt `.conf`-Dateien.

## Wichtige Dateien

- `backend/internal/nginx.js` — Hauptlogik
- `backend/internal/acme-tls.js` — Standard-TLS-Include und live angewendete OCSP-/Zertifikatswahl
- `backend/templates/proxy_host.conf` — Proxy-Host-Template
- `backend/templates/_proxy_logic.conf` — Gemeinsame Proxy-Logik
- `backend/templates/_upload_relay.conf` — Spezielle Upload-Locations für Proxy-Hosts mit aktiviertem Relay
- `backend/templates/_proxy_host_custom_location.conf` — Partial für `custom_locations` (Liquid-Syntax, eingebettet in `proxy_host.conf`)
- `backend/templates/_common.conf` — Gemeinsame Konfiguration
- `backend/templates/stream.conf` — Stream-Template
- `backend/templates/redirection_host.conf` — Redirect-Template
- `backend/templates/dead_host.conf` — 404-Template
- `backend/templates/default.conf` — Default-Server
- `backend/templates/ip_ranges.conf` — IP-Ranges

## TLS-Optionen aus der Datenbank

Die Engine liest die öffentlichen `acme-options` für OCSP und Standard-TLS; weder EAB-Kennung noch Secret werden als vollständiger Einstellungsdatensatz an Templates gereicht. Der Template-Kontext `acme_options` enthält nur die beiden Stapling-Schalter. ACME-/Custom-OCSP-Abrufe beim Reload stammen ebenfalls aus der Datenbankwahl. Sie verwenden weiterhin den installierten OCSP-Fetcher; interne Zertifikate erhalten keinen OCSP-Block.

`acme-tls.js` erzeugt `/data/nginx/include/default-tls.conf` für Verwaltungsoberfläche, GoAccess und Default-Site. Es wählt nur verwaltete Zertifikat-/Schlüsselpaare; `0` verwendet das Dummy-Paar. Beim Start bleibt eine nicht mehr verfügbare importierte Auswahl in den Settings erhalten, während das Include auf Dummy zurückfällt, damit die UI zur Korrektur erreichbar bleibt. Neue gespeicherte TLS-Auswahlen werden dagegen vor der Aktivierung geprüft.

OCSP-/Standardzertifikat-Änderungen sichern das Include und die aktiven TLS-Hostdateien unter der gemeinsamen Nginx-Sperre, regenerieren mit einem Optionssnapshot und führen `nginx -tq` aus. Datenbankpersistenz und Reload folgen im validierten Aktivierungspfad. Fehler stellen die gesicherten Dateien und vorherige Einstellung wieder her; ein Fehler des Wiederherstellungs-Reloads wird zusätzlich protokolliert. Ein als Standard ausgewähltes Zertifikat muss vor dem Löschen durch eine andere Auswahl ersetzt werden. Details stehen unter [ACME-Einstellungen](../verwaltung/einstellungen.md#acme-konto-und-tls-optionen).

## Verhalten

1. `nginx.js` wird getriggert bei CRUD-Operationen auf Hosts
2. Liest aktuelle Daten aus der Datenbank
3. Rendert Liquid-Templates mit Host-Daten
4. Schreibt `.conf`-Dateien nach `/data/nginx/`
5. Prüft die gesamte Konfiguration mit `nginx -tq` und signalisiert danach unmittelbar `nginx -s reload`

## Wichtige Hinweise

- `nginx -t` wird **aktiv** vor dem Reload ausgeführt via `test()` Methode (`nginx -tq`)
- Der normale Reload in `nginx.js` ist **nicht** verzögert. Nur bestimmte Aufrufer, etwa Docker Auto-Discovery in `docker.js`, sammeln Änderungen vor einem gemeinsamen Reload.
- Templates verwenden ausschließlich Liquid-Syntax (LiquidJS)
- Eigene Unix-Sockets liegen unter `/run/shieldpm/`: Backend, PHP, GoAccess, Anubis, OAuth2 und HTTP-Ersatzlistener. Die Startskripte vergeben nur diesem Laufzeitverzeichnis Schreibrechte; fremde Host-Sockets unter `/run` bleiben unverändert. Templateänderungen erzwingen die Neuerzeugung gespeicherter Hosts beim Start.
- Die editierbare Default-Konfiguration einschließlich Sicherungen liegt unter `/data/nginx/default.conf`. Ein festes Include unter `/usr/local/nginx/conf/conf.d/default.conf` bindet sie ein; der Backendprozess benötigt dort keine Schreibrechte mehr.

## Erweiterte Methoden

### Gleichzeitige Änderungen

- `configure()` stellt Host-Änderungen in eine gemeinsame Promise-Warteschlange. Schreiben, Testen und Zurückrollen überlappen dadurch nicht zwischen gleichzeitigen API-Anfragen.
- `backupConfig()` und `restoreConfig()` ignorieren nur fehlende Dateien. Andere Dateisystemfehler brechen die Operation ab, statt einen erfolgreichen Wechsel vorzutäuschen.
- Fehlgeschlagene Generierung legt auch bei neuen Hosts eine `.conf.err` ab, bevor eine vorhandene Sicherung wiederhergestellt wird.
- Fehler beim Löschen einer aktiven Konfiguration werden an den Aufrufer weitergegeben.

### Config-Backup/Restore

- `backupConfig(host_type, host)` — Erstellt eine `.conf.bak` Sicherungskopie der aktuellen Config vor Änderungen
- `restoreConfig(host_type, host)` — Stellt die `.conf.bak` Sicherung wieder her (z.B. nach fehlgeschlagenem `nginx -t`)
- `deleteBackupConfig(host_type, host)` — Löscht die Backup-Datei nach erfolgreichem Configure (Commit)

### Fehlerbehandlung

- `renameConfigAsError(host_type, host)` — Benennt eine fehlerhafte Config als `.conf.err` um, bevor die Backup wiederhergestellt wird

### Bulk-Operationen

- `bulkGenerateConfigs(model, host_type, hosts)` delegiert an `bulkGenerateConfigGroups(groups)`. Alle Hosts und Hosttypen eines Gruppenlaufs werden zunächst mit Sicherungen geschrieben und dann genau einmal mit `nginx -tq` geprüft. Bei einem Fehler werden die bereits geschriebenen Dateien als `.err` gesichert und auf den vorherigen Zustand zurückgesetzt; nach erfolgreicher Prüfung werden Status und Sicherungen abgeschlossen. Ein gemeinsamer Reload liegt beim Aufrufer. Die Dateiverarbeitung ist serialisiert, aber die einzelnen Schreibvorgänge sind kein atomarer Dateisystem-Commit.

### Config-Parsing

- `advancedConfigHasDefaultLocation(advanced_config)` — Parst das `advanced_config`-Feld und prüft, ob ein `location /` Block definiert ist. Gibt `true` zurück, wenn vorhanden. Beeinflusst, ob der Default-Location-Block hinzugefügt wird.
- `renderConfig(host_type, host_row, options)` — Gemeinsamer reiner Liquid-Renderpfad für
  `generateConfig()` und die Proxy-Host-Vorschau. Bei `{ preview: true }` wird der Terminal-Token
  vor dem Rendern durch einen Platzhalter ersetzt; damit muss eine Vorschau keinen Signierschlüssel
  lesen. `generateConfig()` schreibt das Ergebnis und startet danach optional `nginxbeautifier`.
  Der Vorschau-Diff normalisiert nur Einrückung und Leerzeilen; erst das Speichern führt `nginx -tq` aus.

### Datenbankgesteuerte Formatierung

`nginx-options.meta.beautifier_enabled` steuert `nginxbeautifier` (Standard `true`). `generateConfig()` liest und validiert die gespeicherte Option vor Rendern und Schreiben. Fehlende oder ungültige gespeicherte Optionen sowie Datenbankfehler brechen damit vor Dateiveränderungen ab. Bei Aktivierung folgt der Formatter auf das Schreiben; Fehler des Formatter-Kommandos werden weiterhin ignoriert.

Die UI unter Einstellungen → Nginx speichert die Wahl ohne Neustart. Das Speichern allein erzeugt keine Dateien neu und lädt Nginx nicht neu; die nächste Konfigurationsgenerierung verwendet den Wert. Die Migration übernimmt `DISABLE_NGINX_BEAUTIFIER` einmalig für einen fehlenden Datensatz und setzt die Option nur bei einem alten Wert von exakt `true` auf `false`. Anschließend gibt es keine Umgebungsrückfallebene. Siehe [Einstellungen](../verwaltung/einstellungen.md#analytics--und-nginx-optionen).

### Anubis-Integration

Nach einem erfolgreichen `configure()` wird `internalAnubis.generatePolicy()` **asynchron** aufgerufen (non-blocking). Dies aktualisiert die Anubis-Sicherheitspolicy basierend auf der neuen Nginx-Konfiguration, ohne den Configure-Flow zu blockieren. Fehler werden separat protokolliert und rollen eine bereits akzeptierte Nginx-Konfiguration nicht zurück.

## Abhängigkeiten

- `lib/utils.js` — Render-Engine (`getRenderEngine()`, Liquid-basiert)
- `internal/proxy-host.js`, `internal/redirection-host.js`, `internal/dead-host.js`, `internal/stream.js` — rufen die Engine bei CRUD auf
- `internal/certificate.js` — wird beim Generieren der Host-Configs gelesen
- `internal/access-list.js` — wird in den Templates referenziert
- `internal/anubis.js` — `generatePolicy()` wird nach erfolgreichem Configure asynchron aufgerufen
- Externes Binary `nginx` (für `nginx -s reload`)

## Regressionstests

- `backend/test/internal/nginx-render-regressions.spec.js`: echte Liquid-Ausgabe für Custom-Root, Alias und interne Stream-Zertifikate; Warteschlange und Dateisystemfehler mit gemockten Systemoperationen.

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

## Aktivierung und gemeinsame Dateisperre

Die Sicherung bleibt bis zum erfolgreichen Reload erhalten. Scheitert die Aktivierung, wird die vorige Konfiguration wiederhergestellt und neu geladen; die Antwort enthält `nginx_online: false`. Der Rollback-Reload erfolgt vor dem Schreiben der Fehlermetadaten, damit ein Datenbankausfall ihn nicht überspringen kann. `withConfigurationLock(callback)` stellt auch Zertifikatsaktivierungen, Default-Site-Wechsel sowie Löschen/Deaktivieren von Hosts in dieselbe Warteschlange. Der Callback darf `test()` und `reload()`, aber nicht erneut `configure()` aufrufen.

Vor der Verarbeitung eines gespeicherten Hostzustands lädt `configureHost()` innerhalb der Konfigurationssperre den vollständigen aktuellen Datensatz einschließlich Zertifikat erneut; bei Proxy-Hosts auch Domains und die vollständige Access-List. Vorab geladene Sammelaufträge können dadurch keine inzwischen geänderten Upstreams, Domains oder neu aktivierte Authentifizierung/TLS durch ihre alten Snapshots ersetzen. Inzwischen deaktivierte, gelöschte oder entfernte Hosts erhalten weiterhin keine aktiven Listener. Die zurückgegebenen und gespeicherten Nginx-Metadaten entfernen auch dabei alte DNS-Zugangsdaten.

Auch während eines langsamen Tests oder Reloads können andere Aufrufe Host-Metadaten speichern. Die Statusaktualisierung liest deshalb erst danach die aktuellen Metadaten in einer kurzen Datenbanktransaktion mit `forUpdate()` und ergänzt ausschließlich die Nginx-Statusfelder. PostgreSQL/MySQL sperren dabei die Hostzeile; SQLite verwendet seine Transaktionsserialisierung. Kein Datenbanklock wird über den Nginx-Prozessaufruf gehalten. Das gilt auch für den Fehlerstatus nach dem Rollback-Reload. `sixth-nginx-current-state.spec.js` prüft beide Rennen und die Geheimnisbereinigung mit echten SQLite- und PostgreSQL/PGlite-Modellen, Liquid-Rendering und temporären Dateien; die Prozessaufrufe sind simuliert.

Das Lesen interner Nginx-Logs prüft die vorhandene Berechtigung `settings:get`. Die Regressionstests prüfen außerdem den Reload-Fehlerpfad und die Reihenfolge der Warteschlange.

Auch die abschließenden Reloads von Access-List-, Wartungs- und Tor-Sammelläufen sowie Zertifikatserneuerungen werden eingereiht. Der IP-Range-Abruf lädt externe Daten vorab und schützt anschließend Schreiben und Reload gemeinsam. So lädt kein Hintergrundauftrag eine gerade teilweise erzeugte Hostkonfiguration.

## Dritte Nachprüfung: Sicherungen und Validierungsaufwand

Fehlt vor einer Konfigurationsänderung die aktive Datei, entfernt `backupConfig()` eine eventuell veraltete `.bak`-Datei. Ein späterer Generierungsfehler kann damit keinen zuvor inaktiven Listener wiederherstellen. Deaktivierte oder inzwischen gelöschte Hosts erhalten auch nach erfolgreichem Rendern `nginx_online: false`.

Ein Einzelwechsel prüft die Gesamtkonfiguration einmal innerhalb von `reload()`, bevor das Reloadsignal gesendet wird. Die zuvor unmittelbar davor ausgeführte identische Prüfung entfällt. Ein Sammellauf validiert alle gestagten Dateien genau einmal vor ihrem Commit; der abschließende Sammel-Reload validiert unverändert erneut. `third-proxy-nginx.spec.js` und `sixth-nginx-current-state.spec.js` decken den Einzel-, Batch- und Rollback-Pfad mit temporären Dateien und gemockten Prozessaufrufen ab.

## Verwandte Seiten

- [Datenfluss](../architektur/datenfluss.md)
- [Proxy-Host](./proxy-host.md)
- [Redirection-Host](./redirection-host.md)
- [Dead-Host](./dead-host.md)
- [Stream](./stream.md)
- [Host (gemeinsame Logik)](./host.md)
- [IP-Ranges](./ip-ranges.md)
- [Modulübersicht](./README.md)
