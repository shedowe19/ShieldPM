# Docker Auto-Discovery

## Zweck

Automatische Erkennung und Registrierung von Docker-Containern als Proxy-Hosts.

## Kontext

Ähnlich wie Traefik Labels ermöglicht Docker Auto-Discovery das automatische Erstellen von Proxy-Hosts basierend auf laufenden Containern.

## Wichtige Dateien

- `backend/internal/docker.js` — Label-Auswertung, Docker-Ereignisse und Host-Synchronisierung
- `backend/index.js` — Initialisierung bei Backend-Start

## Verhalten

- Verbindet sich über `dockerode` mit der Docker-API; der lokale Socket `/var/run/docker.sock` wird versucht, ist in `compose.yaml` aber standardmäßig nicht gemountet. Für lokale Discovery muss er bewusst bereitgestellt werden.
- Scannt laufende Container und verarbeitet nur solche mit dem Pflichtlabel `shieldpm.hostname` (kommagetrennte Domains)
- Unterstützt mehrere Docker-Hosts über `DOCKER_HOSTS` Umgebungsvariable
- Wertet `shieldpm.scheme` (`http`, `https`, `grpc`, `grpcs`) und `shieldpm.port` aus. Lokal wird die Container-IP und der interne Port verwendet; bei entfernten Docker-Hosts bevorzugt die Portwahl das veröffentlichte Host-Port-Binding. Ein nicht veröffentlichter Remote-Port kann zu einem unerreichbaren Upstream führen.
- Erstellt oder aktualisiert Proxy-Hosts unter dem Systembenutzer; `die`- und `pause`-Ereignisse deaktivieren den zugehörigen Host.

## Abhängigkeiten

- `dockerode` — Docker API Client
- Docker-Socket oder Remote-API Zugriff

### Daten- und Ereigniskonsistenz

Erkannte Domains werden über `host_domains` mit `insertGraphAndFetch()` beziehungsweise `upsertGraphAndFetch()` gespeichert. Lesewege laden die Domain-Relation sowie beim Rendern Zertifikat und Access-List-Kindeinträge. Beim initialen Scan entfernter Docker-Hosts berücksichtigt die Portwahl das `Ports`-Array aus `listContainers()`, während Inspect-Ereignisse die Bindings unter `NetworkSettings.Ports` verwenden.

Der Docker-Ereignisstream ist zeilenweise JSON. Empfangene Daten werden bis zum vollständigen Zeilenende gesammelt; mehrere Ereignisse pro Datenblock und über mehrere Blöcke verteilte Ereignisse werden in ihrer Reihenfolge verarbeitet.

Bei erneuter Discovery bleiben die aktuellen Host-Metadaten erhalten, insbesondere gespeicherte IP-, ASN- und Länder-Firewallregeln sowie andere vom Benutzer gesetzte Werte. Nur `auto_discovered`, `docker_container_id` und die Discovery-Beschreibung werden ersetzt. Der Updatepfad lädt den aktuellen, nicht gelöschten Host nach möglichen Zertifikatsanfragen innerhalb einer kurzen Modelltransaktion mit Rowlock und schreibt den Graph in derselben Transaktion. Er verwendet deshalb keine Metadaten aus dem älteren Discovery-Snapshot. Ein zwischenzeitlich gelöschter Host wird nicht erneut aktiviert. Labelgesteuerte Hostfelder behalten ihre bisherige Aktualisierungslogik.

`docker-metadata-preservation.spec.js` führt die vollständige SQLite-Migrationskette mit den echten Modellen aus und prüft erhaltene Metadaten im gespeicherten und zum Rendern geladenen Host, eine Änderung während einer verzögerten Zertifikatsanfrage, die Transaktionsreihenfolge, eine zwischenzeitliche Löschung und die bisherigen Erstellungsdefaults. SQLite prüft dabei keine wartenden Rowlocks zwischen mehreren Server-Datenbankverbindungen.

Die Direktivenliste für `shieldpm.advanced_config` akzeptiert pro Zeile genau eine erlaubte Direktive mit abschließendem Semikolon. Zusätzliche Direktiven auf derselben Zeile, Blockklammern und `include` werden verworfen.

### Label-Validierung und Domain-Konflikte

Auch der direkte Auto-Discovery-Schreibweg prüft Domains über die gemeinsame Host-Validierung. Scheme, Port, Bandbreite, Rate-Limit und Zeiteinheit werden vor Datenbank- und Nginx-Operationen auf zulässige Werte begrenzt; Query-Labels dürfen keine Zeichen zum Ausbrechen aus der Nginx-Zeichenkette enthalten.

Ungültige Scheme-, Port-, Bandbreiten-, Query- und Rate-Limit-Labels werden als `ConfigurationError` klassifiziert
(HTTP-Statuszuordnung 400). Die Discovery behandelt diese Fehler vor dem Speichern beziehungsweise Rendern;
ein ungültiges Label erzeugt daher keinen teilweise konfigurierten Proxy-Host.

Die Kollisionssuche berücksichtigt alle vorhandenen Hosts. Ein bereits passender Container-Host beendet die Prüfung nicht vorzeitig: Belegt ein manuell angelegter Host eine der angeforderten Domains, wird der automatische Eintrag nicht darübergeschrieben.

Auto-Discovery sammelt geänderte Host-IDs während eines zweisekündlichen Debounce-Fensters. Nach Ablauf lädt es alle noch aktiven Hosts einmal, rendert und validiert sie als gemeinsamen atomaren Nginx-Batch und löst genau einen Reload aus. Erzeugt ein Label trotz zulässiger Direktive ungültige Nginx-Argumente, stellt der Batch jede gestagte Datei wieder her und markiert den fehlerhaften Host. `fourth-integrations-docker-config.spec.js` prüft die Coalescing-Grenze, einen Batch und einen Reload für wiederholte Ereignisse.

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
