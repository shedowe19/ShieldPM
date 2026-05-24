# ADR: Secure Demo Mode & Security Hardening

## Titel

Implementierung eines schreibgeschützten Demo-Modus für öffentliche Showcases.

## Status

`Akzeptiert` (Implementiert am 15.01.2026 in PR #224)

## Kontext

Das ShieldPM-Projekt benötigte eine öffentlich zugängliche Live-Demo (z.B. auf `demo.shieldpm.dev`), damit potenzielle Nutzer die Benutzeroberfläche testen konnten. Es war jedoch ein massives Sicherheitsrisiko, Unbekannten Zugriff auf ein System zu geben, das Shell-Kommandos (Web-Terminal), Docker-Sockets (Auto-Discovery) und Netzwerk-Configs manipulieren kann.

## Entscheidung

Ein nativer `Secure Demo Mode` wurde implementiert.

- Gesteuert über die Umgebungsvariable `SHIELDPM_DEMO_MODE=true`.
- Eine dedizierte Express.js-Middleware (`backend/lib/express/demo.js`) fängt alle zustandsändernden HTTP-Anfragen (`POST`, `PUT`, `DELETE`) global ab und liefert eine simulierte Erfolgsmeldung oder einen `403 Forbidden` zurück.
- Kritische API-Endpunkte (wie das Web-Terminal, Passwort-Änderungen, User-Verwaltung) werden tief auf Backend-Ebene blockiert.
- Das Frontend blendet sensible Daten (echte Zertifikats-Keys, API-Tokens) visuell aus oder ersetzt sie durch Platzhalter.

## Begründung

- **Marketing & Vertrauen:** Eine Live-Demo erhöht die Adoption-Rate des Open-Source-Projekts signifikant.
- **Sicherheit:** Durch die zentrale Middleware-Architektur wird verhindert, dass Entwickler bei neuen Features versehentlich Lücken in der Demo-Absicherung übersehen (Fail-Safe by Design).

## Konsequenzen

### Positiv

- Gefahrloses Hosting der öffentlichen Demo-Instanz.

### Negativ

- Einige Features (wie die Echtzeit-Vorschau von neu angelegten Hosts) wirken im Demo-Modus etwas starr, da die DB-Einträge nicht wirklich persistiert werden und daher nach einem Seiten-Reload verschwinden.

## Verwandte Seiten

- [ADR-Übersicht](./README.md)
