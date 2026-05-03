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

## Offene Fragen

- Unklar: Genaues Label-Format für Auto-Discovery-Konfiguration

## Verwandte Seiten

- [Proxy-Host](./proxy-host.md)
- [Host (gemeinsame Logik)](./host.md)
- [Zertifikate](./zertifikate.md)
- [Modulübersicht](./README.md)
- [Umgebungsvariablen](../konfiguration/umgebungsvariablen.md)
