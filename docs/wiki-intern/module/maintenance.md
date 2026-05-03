# Maintenance

## Zweck

Geplante Wartungsfenster und Fehlerseiten für Proxy-Hosts.

## Kontext

Ermöglicht es, Proxy-Hosts zeitgesteuert in den Wartungsmodus zu versetzen und benutzerdefinierte Fehlerseiten anzuzeigen.

## Wichtige Dateien

- `backend/internal/maintenance.js` (5 KB) — Business-Logik

## Verhalten

- Zeitgesteuerte Wartungsfenster (Start-/Endzeit)
- Benutzerdefinierte Maintenance-Pages
- Failure-Pages bei Backend-Ausfällen

## Abhängigkeiten

- `internal/nginx.js` — Config-Generierung für Maintenance-Mode

## Offene Fragen

- Keine

## Verwandte Seiten

- [Proxy-Host](./proxy-host.md)
- [Nginx-Engine](./nginx-engine.md)
- [Verwaltung](../verwaltung/README.md)
- [Modulübersicht](./README.md)
