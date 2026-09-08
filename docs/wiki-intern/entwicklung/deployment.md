# Deployment

## Zweck

Dokumentation der Deployment-Optionen.

## Docker (Standard)

```bash
# compose.yaml herunterladen
curl -o compose.yaml https://raw.githubusercontent.com/shedowe19/ShieldPM/refs/heads/develop/compose.yaml

# Anpassen: TZ, ACME_EMAIL, etc.
# Starten
docker compose up -d
```

**Port**: UI auf `:81`, HTTP auf `:80`, HTTPS auf `:443`, GoAccess auf `:91`

**Image**: `ghcr.io/shedowe19/shieldpm:develop`

**Persistente Daten**: `/opt/shieldpm` → gemountet nach `/data` im Container.

## Native / LXC (Proxmox)

```bash
tar -xzf shieldpm-install-linux-amd64.tar.gz
sudo bash install.sh
```

Der Installer:

1. Prüft Abhängigkeiten (Node, npm, Nginx, sqlite3, certbot)
2. Erstellt systemd-Unit-Files
3. Lädt CrowdSec-Parser/Collections herunter
4. Installiert Frontend und Backend

Der Aufruf erfolgt im entpackten Release-Paket (für ARM64 entsprechend `shieldpm-install-linux-arm64.tar.gz`). Bei einer erneuten Installation wird die vorhandene `/data/.env` nicht durch die mitgelieferte Vorlage überschrieben. Datenbankwerte werden atomar und für das Laden durch die Shell korrekt maskiert geschrieben; auch Passwörter mit Leerzeichen, Anführungszeichen oder Sonderzeichen bleiben unverändert. PostgreSQL-Aufrufe verwenden `runuser`, sodass kein zusätzliches `sudo`-Paket vorausgesetzt wird. HTTP-Download- und Pipelinefehler führen zum Abbruch.

Der Installer sucht seine Paketdateien neben `install.sh`, unabhängig vom aktuellen Arbeitsverzeichnis. Fehlende Anwendungsdateien, Nginx-Binaries oder Rootfs-Helfer werden vor Paketinstallationen erkannt. Vor dem Austausch vorhandener Binär- und Anwendungsdateien stoppt er einen aktiven ShieldPM-Dienst; der abschließende Start lädt dadurch den neuen Code. Ein späterer Installationsfehler lässt den Dienst angehalten, bis die Installation repariert oder erneut ausgeführt wird.

Die Datenbankauswahl berücksichtigt auch eingerückte Zuweisungen und `export DB_…` in `/data/.env`. Nicht ausgewählte Provider werden deaktiviert; beim Zurückschalten auf SQLite wird ein vorhandener eigener `DB_SQLITE_FILE` wieder aktiviert. Die Umschaltung kopiert keine Daten zwischen Datenbankservern. Scheitern sowohl automatische als auch manuelle OpenAppSec-Installation, bricht der Installer ab, bevor er das Nginx-Modul aktiviert oder Erfolg meldet.

Nach dem ersten Dienststart wartet der Installer bis zu 180 Sekunden auf `status: "OK"` über den Backend-Unix-Socket. Ein pauschaler Neustart nach 20 Sekunden entfällt, damit laufende Migrationen nicht unterbrochen werden. Die nativen Laufzeitpakete enthalten außerdem `sqlite3`, `netcat-openbsd` und `libfcgi-bin` für Wartung, Socket-Helfer und FastCGI sowie `wireguard-tools`, `wireguard-go`, `iproute2`, `iptables` und `procps` für WireGuard.

LXC-Templates enthalten keine gemeinsam verwendeten SSH-Hostkeys oder Maschinen-ID. Der Build entfernt diese Identitäten ausschließlich im temporären Template-Container. Beim Start eines daraus erzeugten LXC erstellt `shieldpm-ssh-hostkeys.service` fehlende Schlüssel vor `ssh.service`; vorhandene Schlüssel bleiben bei späteren Neustarts erhalten.

Die Compose-Beispiele verwenden `network_mode: host`. Deshalb werden `net.ipv4.ip_forward` und `net.ipv4.conf.all.src_valid_mark` für WireGuard auf dem Docker-Host gesetzt; Docker erlaubt diese Netzwerk-Sysctls bei Host-Netzwerkbetrieb nicht im Service-Block. Die erforderlichen Fähigkeiten und das TUN-Gerät bleiben im Compose-Service konfigurierbar.

Die lokale Datenbankauswahl verwendet weiterhin die im Installer angebotenen Standardzugangsdaten, sofern keine manuellen Werte gewählt werden. Die Maskierung ersetzt keine individuelle Passwortwahl.

## Demo-Reset

`docker-compose.demo.yaml` erstellt die Ausgangskopie über SQLite `.backup`, einschließlich bereits bestätigter WAL-Transaktionen. Beim periodischen Reset wird der Anwendungscontainer vor dem Austausch der Datenbank und dem Entfernen der WAL-/SHM-Dateien gestoppt und anschließend gestartet. Der Reset-Sidecar besitzt weiterhin Zugriff auf den Docker-Socket und ist ausschließlich für die Demo gedacht.

## Optionale Sidecar-Services

| Service          | Image                                | Zweck                 |
| ---------------- | ------------------------------------ | --------------------- |
| CrowdSec         | `crowdsecurity/crowdsec:latest`      | IPS                   |
| MySQL            | `mysql:8`                            | Produktions-DB        |
| PostgreSQL       | `postgres:17-bookworm`               | Produktions-DB        |
| GeoIP-Update     | `ghcr.io/maxmind/geoipupdate:latest` | GeoIP-Daten           |
| Caddy            | `ghcr.io/shedowe19/shieldpm:caddy`   | HTTP→HTTPS Redirector |
| OpenAppSec-Agent | `ghcr.io/openappsec/agent:latest`    | AI WAF                |

## Versionierung

- **Source of Truth**: `.version` + `backend/package.json` + `frontend/package.json`
- Alle drei müssen synchron gehalten werden
- Aktueller Stand: `4.3.2`

## CI/CD (GitHub Workflows)

Workflows unter `.github/workflows/`:

| Datei                                     | Zweck                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docker.yml`                              | Multi-Plattform-Docker-Image-Build und Push nach `ghcr.io`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `docker-latest.yml`                       | Latest-Tag-Update                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `dockerlint.yml`                          | Hadolint-Check für Dockerfile                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `caddy.yml`                               | Build des Caddy-Sidecar-Image (`shieldpm:caddy`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `caddy-fmt.yml`                           | Formatierungs-Check für `caddy/Caddyfile`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `codeql.yml`                              | Statische Sicherheitsanalyse (GitHub CodeQL)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `lint-and-format.yml`                     | Nicht-mutierende Quality-Gates: hunkbasierter Diff-/Token-Schutz mit Merge-Base-Fallback zum Default-Branch bei fehlender Vergleichsrevision, expliziter `refs/heads/`-Fetch schützt dabei gegen gleichnamige Tags, diff-basierter Biome-Check, Backend-/Frontend-Tests, Locale-/Build-Check und Audit ab Schweregrad High (bis zur Bereinigung der bestehenden Lockfile-Funde nur berichtend)                                                                                                                                                                                                     |
| `shellcheck.yml`                          | Lint für `scripts/install.sh` und Rootfs-Shell-Scripts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `json.yml`                                | JSON-Lint (Schema-Files, RBAC-Rules)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `spellcheck.yml`                          | codespell mit Skip-Liste (siehe Konfig im Workflow)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `npm-updates.yml`                         | Aktualisiert direkte npm-Abhängigkeiten mit `ncu -u --target latest` ohne Paket-Ausschlüsse. Der Workflow installiert zunächst den eingefrorenen Ausgangsstand und erhält vorhandene Manifest-`resolutions`; das Frontend-Lockfile wird anschließend dedupliziert und erneut eingefroren installiert. Node-26-gebundenes Yarn Classic, geprüfte Tool-Binärdateien, Versionsdokumentation, erfolgreiche Lizenzscans, Backend-/Frontend-Tests und Frontend-Build gehen der PR-Erstellung voraus. `DEPENDENCY_UPDATES_TOKEN` ist erforderlich, damit die erzeugte PR die regulären Prüfungen auslöst. |
| `wiki-sync.yml`                           | Synchronisiert `docs/wiki/` mit dem GitHub-Wiki-Repo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `.github/codeql/codeql-config.yml`        | CodeQL-Analyse-Konfiguration                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `.github/delete-merged-branch-config.yml` | GitHub Auto-Delete Merged Branch Konfiguration                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

Der frühere `dependency-updates.yml`-Workflow wurde entfernt: Er bearbeitete ausschließlich die nicht mehr vorhandenen Dockerfile-Argumente `CSNB_VER` und `CRS_VER`. Diese Bestandteile kommen aus dem separaten Nginx-Basisimage beziehungsweise dem nativen `nginx-binaries`-Release. Der Caddy-Build meldet sich ausschließlich bei seiner Zielregistry GHCR an und benötigt keine DockerHub-Zugangsdaten.

## Hilfs-Skripte

Docker-Publikationen derselben Git-Referenz laufen nacheinander; alle manuellen Latest-Publikationen teilen ebenfalls eine Warteschlange. So kann ein anderer Lauf die Architektur-Tags nicht während der Manifest-Erstellung ersetzen.

Der Docker-Build-Workflow berücksichtigt auch `.dockerignore`, `scripts/install.sh` und `scripts/setup-node-apt.sh`. Pull Requests bauen lokale Images für die Prüfung. PRs aus demselben Repository melden sich bei GHCR an, damit das geschützte Nginx-Basisimage geladen werden kann; Fork-PRs erhalten keine Registry-Zugangsdaten. Push und Multiarch-Publikation laufen nur außerhalb von Pull Requests. Der manuelle Latest-Workflow übergibt und validiert den Release-Tag als Umgebungsvariable, statt Benutzereingaben direkt in Shell-Code einzusetzen.

Der Shellcheck-Workflow prüft auch Erweiterungslose Helfer wie `update-shieldpm` und führt `python3 -m unittest discover -s scripts/tests -v` aus. Diese Tests arbeiten mit temporären Verzeichnissen und simulierten externen Befehlen, ohne einen Installer oder laufende Dienste zu starten.

- `scripts/install.sh` — Native/LXC-Installer (siehe oben).
- `scripts/generate-notices.js` — generiert `THIRD-PARTY-NOTICES.md` aus Metadaten und Lizenzdateien der lokal installierten direkten NPM-Pakete; die Paketnamen sind sichtbar mit der passenden npm-Version verlinkt. Es verwendet das vom Workflow bereitgestellte `license-checker`-Binary und bricht bei einem fehlgeschlagenen Lizenzscan ab, bevor die bestehende Notice-Datei überschrieben werden kann.
- `scripts/wiki-graph.py` — erzeugt die interaktive Beziehungs-Visualisierung des internen Wikis (`docs/wiki-intern/wiki-graph.html`). Nutzt `scripts/lib/vis-network.min.js` als Abhängigkeit.

Der Wiki-Generator ersetzt seine HTML-Platzhalter in einem einzigen Durchlauf. Seitennamen wie `__EDGES__.md` bleiben dadurch als Dateinamen erhalten und beschädigen weder die eingebetteten Graphdaten noch das JavaScript. Die Regression führt den vollständigen Generator mit solchen Seitennamen aus und prüft die ausgegebenen Knoten und Verknüpfungen.

Das optionale `pentest_crowdsec.py` benötigt Python mit `requests` und eine ausdrücklich angegebene HTTP(S)-Origin, beispielsweise `python3 pentest_crowdsec.py https://eigener-testhost.example --rounds 1`. Es startet beim Import keine Anfragen, folgt keinen Weiterleitungen und führt standardmäßig eine Runde aus (maximal 50 bei ausdrücklicher Angabe). Rückgabecode 0 bedeutet einen erkannten CrowdSec-Block, 1 bedeutet, dass keine entsprechende Blockantwort erkannt wurde.

## Verwandte Seiten

- [Build](./build.md)
- [Umgebungsvariablen](../konfiguration/umgebungsvariablen.md)
- [Docker Compose Referenz](../../wiki/Docker-Compose-Reference.md)
- [Caddy-Sidecar](../konfiguration/config-dateien.md)
