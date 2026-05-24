# ADR: Full-Stack Refactoring Phase 1 & 2

## Titel

Umfangreiches Refactoring der Code-Basis: Frontend-Typisierung, Backend-Validierung und UX-Verbesserungen.

## Status

`Akzeptiert` (Implementiert am 03.12.2025 in PRs #13 bis #19)

## Kontext

Der ursprüngliche Nginx Proxy Manager wies an vielen Stellen technische Schulden auf:

- Mangelhafte oder fehlende TypeScript-Typisierungen im Frontend.
- Inkonsistente Payload-Validierung im Backend (oft wurde direkt auf `req.body` ohne Schema-Validierung zugegriffen).
- Schlechte User Experience durch fehlerhafte Modal-Animationen und Startup-Crashes.

## Entscheidung

Ein mehrphasiges Refactoring (Phase 1 & 2) wurde durchgeführt:

1. **Frontend Typing:** Flächendeckende Einführung strikter TypeScript-Typen für API-Responses, Props und React-Query-Hooks.
2. **Backend Validation:** Einführung und Stärkung von Schema-basierten Validierungen für eingehende API-Anfragen.
3. **UX & UI:** Reparatur und Erweiterung der `AnimatedModalBody`-Komponenten sowie Einführung fließenderer Übergänge im gesamten Dashboard.
4. **Docker Build:** Wiederherstellung der `COPY`-Methode im Dockerfile für stabilere Builds und Beseitigung von Startup-Crashes.

## Begründung

- **Stabilität:** Strikte Typisierung und Backend-Validierung verhindern Runtime-Errors ("Cannot read property of undefined") und erhöhen die Sicherheit gegen fehlerhafte Payloads.
- **Entwickler-Erfahrung (DX):** Durch bessere TypeScript-Unterstützung können neue Features im Frontend deutlich schneller und sicherer entwickelt werden.
- **Nutzer-Erfahrung (UX):** Reparierte Animationen sorgen für ein "Premium-Gefühl", was im ShieldPM-Design essenziell ist.

## Konsequenzen

### Positiv

- Signifikant robustere Code-Basis.
- Bessere Fehlermeldungen bei falschen API-Anfragen.

### Negativ

- Initial hoher Refactoring-Aufwand, der zu vielen geänderten Dateien führte.

## Verwandte Seiten

- [ADR-Übersicht](./README.md)
