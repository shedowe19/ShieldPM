# ADR: Passive Health Checks & Maintenance Page

## Titel

Implementierung von passiven Health-Checks mit automatischer Fallback-Maintenance-Page.

## Status

`Akzeptiert` (Implementiert am 25.12.2025)

## Kontext

Wenn ein im Backend konfigurierter Upstream-Server (Docker-Container oder VM) ausfiel, zeigte ShieldPM standardmäßig den generischen 502/504 Fehler des OpenResty-Cores ("Bad Gateway"). Dies führte oft zu Verwirrung bei Endnutzern, da sie nicht wussten, ob der Proxy selbst oder der Zieldienst offline war.

## Entscheidung

Eine automatisierte "Maintenance on Failure"-Funktion wurde implementiert.
- Nginx wurde so konfiguriert, dass Fehler (502, 503, 504) per `error_page` direkt abgefangen werden.
- Fällt ein Backend-Service aus, liefert Nginx automatisch eine statisch generierte Maintenance-Page (HTML/CSS) aus, die sich im `/data/`-Verzeichnis befindet.
- Das ShieldPM-Dashboard bietet einen Toggle, um diese Funktion pro Proxy-Host granular ein- oder auszuschalten (z.B. nützlich für APIs, die echtes 502-JSON statt HTML benötigen).

## Begründung

- **User Experience (UX):** Bereitstellung einer professionellen, gebrandeten Fehlerseite für Endnutzer anstelle von rohen Server-Fehlermeldungen.
- **Sicherheit:** Verhindert das "Leaken" von Architektur-Informationen durch Standard-Fehlerseiten.

## Konsequenzen

### Positiv
- Sofortige optische Aufwertung ausgefallener Dienste.
- Reduzierung von Support-Tickets, da klare "Dienst nicht verfügbar"-Meldungen angezeigt werden.

### Negativ
- Bei APIs oder maschinellem Traffic (z.B. Webhooks) kann die Auslieferung von HTML-Content bei einem 502-Fehler zu Client-Crashes führen, weshalb das Feature optional (per Toggle) gehalten werden musste.

## Verwandte Seiten

- [ADR-Übersicht](./README.md)
