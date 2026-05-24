# ADR: Scheduled Maintenance Mode

## Titel

Einführung eines geplanten Wartungsmodus (Scheduled Maintenance Mode).

## Status

`Akzeptiert` (Implementiert am 31.12.2025)

## Kontext

Nach der Einführung der passiven Health-Checks und Fallback-Seiten äußerten Nutzer den Wunsch, Dienste proaktiv für geplante Wartungsarbeiten offline nehmen zu können, ohne den Upstream-Server manuell stoppen zu müssen oder Traffic-Leaks zu riskieren.

## Entscheidung

Ein "Scheduled Maintenance Mode" wurde implementiert.
- Administratoren können im Dashboard einen genauen Zeitraum (Start- und Enddatum) definieren, in dem ein Proxy-Host automatisch in den Wartungsmodus wechselt.
- Nginx fängt in diesem Zeitraum alle Anfragen mit einem `503 Service Unavailable` ab und serviert die statische Maintenance-Page.
- Das Backend prüft die Scheduling-Regeln asynchron und generiert bei Eintreten des Zeitpunkts automatisch eine neue Nginx-Konfiguration inkl. Reload.

## Begründung

- **Operational Excellence:** Verhindert menschliche Fehler beim manuellen An- und Abschalten von Wartungsseiten während geplanter Updates (z.B. nächtliche Datenbank-Migrationen).
- **SEO-Optimierung:** Die korrekte Auslieferung eines `503 Service Unavailable` signalisiert Suchmaschinen, dass der Ausfall temporär ist, wodurch das Ranking nicht beeinträchtigt wird.

## Konsequenzen

### Positiv
- Vollständige Automatisierung von Wartungsfenstern.

### Negativ
- Erhöhte Komplexität in der Nginx-Config-Engine, da nun zeitbasierte Events asynchrone Nginx-Reloads auslösen.

## Verwandte Seiten

- [ADR-Übersicht](./README.md)
