# ADR: ARM64 / Raspberry Pi 4 Architektur-Support

## Titel

Einführung von Multi-Arch-Builds zur Unterstützung von `aarch64` / ARM64 Systemen.

## Status

`Akzeptiert` (Implementiert am 03.02.2026 in PR #280)

## Kontext

ShieldPM wurde primär für x86_64 Architekturen (Standard-Server) entwickelt und kompiliert. Eine wachsende Anzahl an Nutzern nutzt jedoch energieeffiziente Single-Board-Computer (wie den Raspberry Pi 4) als Heim-Server. Docker-Images, die für x86 gebaut wurden, können auf diesen ARM-Prozessoren nicht nativ ausgeführt werden.

## Entscheidung

Die CI/CD-Pipelines (GitHub Actions) und Dockerfiles wurden für Multi-Arch-Support erweitert.

- Nutzung von `docker buildx` zum parallelen Bauen von `linux/amd64` und `linux/arm64` Images.
- Native NPM-Module (z.B. SQLite, bcrypt) wurden auf ihre Cross-Compilation-Kompatibilität geprüft.
- Das Basis-Image (`shieldpm-nginx`) wurde ebenfalls für ARM64 bereitgestellt.

## Begründung

- **Reichweite:** Erschließt eine massive Nutzerbasis im Homelab-Sektor (Raspberry Pi Nutzer).
- **Zukunftssicherheit:** ARM-Architekturen gewinnen auch im Cloud-Segment (AWS Graviton, Ampere) zunehmend an Bedeutung.

## Konsequenzen

### Positiv

- ShieldPM ist nun nativ und performant auf Raspberry Pi 4 / 5 und ARM-basierten Cloud-Servern lauffähig.

### Negativ

- Verdopplung der CI/CD-Build-Zeiten, da Images für zwei Architekturen assembliert werden müssen.
- Höheres Risiko bei Abhängigkeits-Updates (ein Node-Modul könnte auf x86 funktionieren, auf ARM aber beim Bauen scheitern).

## Verwandte Seiten

- [ADR-Übersicht](./README.md)
