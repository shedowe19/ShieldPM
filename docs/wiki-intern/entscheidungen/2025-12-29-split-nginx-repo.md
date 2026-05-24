# ADR: Auslagerung des Nginx-Builds (shieldpm-nginx)

## Titel

Trennung der Nginx-Kompilierung vom ShieldPM-Hauptrepository.

## Status

`Akzeptiert` (Implementiert am 29.12.2025 in PR #174)

## Kontext

Der Docker-Build-Prozess von ShieldPM dauerte historisch sehr lange, da Nginx inklusive diverser Module (ModSecurity, HTTP/3 QUIC, Lua) aus den C-Sourcen kompiliert werden musste. Da sich die Applikationslogik (Node.js/React) viel häufiger ändert als die Nginx-Basis, führte dies zu massiver Ineffizienz in der CI/CD-Pipeline.

## Entscheidung

Das Projekt wurde in zwei Repositories gesplittet:

1. `shieldpm-nginx` (Neues Repo): Verantwortlich für die OS-Basis (Debian) und das Kompilieren des statischen Nginx-Binaries. Veröffentlicht ein fertiges Base-Image (z.B. `ghcr.io/shedowe19/shieldpm-nginx:master`).
2. `ShieldPM` (Dieses Repo): Baut auf dem Nginx-Base-Image auf und ergänzt lediglich die Applikationslogik (Backend, Frontend, Scripte).

## Begründung

- **Build Performance:** App-Deployments dauern nur noch wenige Sekunden statt 20+ Minuten.
- **Separation of Concerns:** Infrastruktur-Updates (Nginx CVEs) sind vom Feature-Release-Zyklus der UI entkoppelt.

## Konsequenzen

### Positiv

- Drastisch schnellere CI-Pipelines.
- Saubereres Haupt-Dockerfile.

### Negativ

- Entwickler müssen nun zwei Repositories im Blick behalten, wenn sie neue Nginx-Module (z.B. ein neues Lua-Skript oder WAF-Modul) einführen wollen.

## Verwandte Seiten

- [ADR-Übersicht](./README.md)
