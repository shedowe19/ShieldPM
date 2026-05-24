# ADR: Web Terminal Hosts (SSH Integration)

## Titel

Implementierung einer Web-basierten Terminal-Funktion zur direkten SSH-Verwaltung von Proxy-Zielen.

## Status

`Akzeptiert` (Implementiert am 23.01.2026 in PR #257)

## Kontext

Administratoren, die ShieldPM nutzen, müssen häufig Fehler auf den Ziel-Servern (Upstreams) analysieren, Docker-Container neustarten oder Konfigurationen auf den Backend-Maschinen anpassen. Ein Wechsel zwischen ShieldPM (Web) und einem separaten SSH-Client störte den Workflow.

## Entscheidung

Ein natives Web-Terminal wurde in ShieldPM integriert.

- Das Frontend verwendet `xterm.js`, um ein vollwertiges Konsolen-Fenster im Browser zu rendern.
- Das Backend nutzt die `ssh2` Bibliothek für Node.js in Kombination mit WebSockets (`ws`), um einen interaktiven, bidirektionalen Shell-Stream zwischen Browser und Ziel-Host aufzubauen.
- SSH-Keys oder Passwörter können sicher in ShieldPM hinterlegt werden, um Verbindungen zu etablieren.

## Begründung

- **Produktivität:** Nahtloser Übergang von "Proxy konfigurieren" zu "Server administrieren" im selben Fenster.
- **Zentralisierung:** Administratoren benötigen keinen lokalen SSH-Client mehr, was besonders in restriktiven Firmennetzwerken von Vorteil ist.

## Konsequenzen

### Positiv

- Signifikante Aufwertung von ShieldPM als zentrales DevOps-Werkzeug.

### Negativ

- Erhöhte Sicherheitsanforderungen: Das Backend hat nun SSH-Zugriff auf andere Maschinen. Eine Kompromittierung von ShieldPM hat weitreichende Folgen (daher auch das nachgelagerte Security Hardening im Februar/März).
- Websockets benötigen spezielle Nginx-Konfiguration, falls ShieldPM selbst hinter einem weiteren Proxy läuft.

## Verwandte Seiten

- [ADR-Übersicht](./README.md)
