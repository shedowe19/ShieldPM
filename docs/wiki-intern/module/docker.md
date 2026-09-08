# Docker Auto-Discovery

## Zweck

Automatische Erkennung und Registrierung von Docker-Containern als Proxy-Hosts.

## Kontext

Ähnlich wie Traefik Labels ermöglicht Docker Auto-Discovery das automatische Erstellen von Proxy-Hosts basierend auf laufenden Containern.

## Wichtige Dateien

- `backend/internal/docker.js` (15 KB) — Business-Logik
- `backend/routes/services.js` (1 KB) — API-Routen

## Verhalten

- Verbindet sich über `dockerode` mit der Docker-API
- Scannt laufende Container
- Unterstützt mehrere Docker-Hosts über `DOCKER_HOSTS` Umgebungsvariable
- Erkennt exponierte Ports und erstellt Proxy-Einträge

## Abhängigkeiten

- `dockerode` — Docker API Client
- Docker-Socket oder Remote-API Zugriff

### Daten- und Ereigniskonsistenz

Erkannte Domains werden über `host_domains` mit `insertGraphAndFetch()` beziehungsweise `upsertGraphAndFetch()` gespeichert. Lesewege laden die Domain-Relation sowie beim Rendern Zertifikat und Access-List-Kindeinträge. Beim initialen Scan entfernter Docker-Hosts berücksichtigt die Portwahl das `Ports`-Array aus `listContainers()`, während Inspect-Ereignisse die Bindings unter `NetworkSettings.Ports` verwenden.

Der Docker-Ereignisstream ist zeilenweise JSON. Empfangene Daten werden bis zum vollständigen Zeilenende gesammelt; mehrere Ereignisse pro Datenblock und über mehrere Blöcke verteilte Ereignisse werden in ihrer Reihenfolge verarbeitet.

Die Direktivenliste für `shieldpm.advanced_config` akzeptiert pro Zeile genau eine erlaubte Direktive mit abschließendem Semikolon. Zusätzliche Direktiven auf derselben Zeile, Blockklammern und `include` werden verworfen.

### Label-Validierung und Domain-Konflikte

Auch der direkte Auto-Discovery-Schreibweg prüft Domains über die gemeinsame Host-Validierung. Scheme, Port, Bandbreite, Rate-Limit und Zeiteinheit werden vor Datenbank- und Nginx-Operationen auf zulässige Werte begrenzt; Query-Labels dürfen keine Zeichen zum Ausbrechen aus der Nginx-Zeichenkette enthalten.

Die Kollisionssuche berücksichtigt alle vorhandenen Hosts. Ein bereits passender Container-Host beendet die Prüfung nicht vorzeitig: Belegt ein manuell angelegter Host eine der angeforderten Domains, wird der automatische Eintrag nicht darübergeschrieben.

Auch Auto-Discovery verwendet den gesperrten Nginx-Konfigurationsweg mit Sicherung und `nginx -t`. Erzeugt ein Label trotz zulässiger Direktive ungültige Nginx-Argumente, wird die vorherige Datei wiederhergestellt und der Fehler im Host-Status gespeichert. Erfolgreiche Änderungen behalten den verzögerten gemeinsamen Reload. `fourth-integrations-docker-config.spec.js` prüft Rücknahme und erfolgreichen Statuswechsel.

### Wiederholte Initialisierung

Gleichzeitige Initialisierungsaufrufe teilen dieselbe Verbindungserstellung. Nach erfolgreichem Verbinden und Einrichten der Ereignisüberwachung bleibt eine erneute Backend-Startsequenz ohne weitere Docker-Listener. Ist kein Docker-Client erreichbar, bleibt eine spätere Initialisierung möglich.

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

## Verwandte Seiten

- [Proxy-Host](./proxy-host.md)
- [Host (gemeinsame Logik)](./host.md)
- [Zertifikate](./zertifikate.md)
- [Modulübersicht](./README.md)
- [Umgebungsvariablen](../konfiguration/umgebungsvariablen.md)
