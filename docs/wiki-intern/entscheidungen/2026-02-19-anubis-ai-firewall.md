# ADR: Integration der Anubis AI Firewall

## Titel

Einführung von Anubis als dedizierte AI-gestützte Web Application Firewall (WAF).

## Status

`Akzeptiert` (Implementiert am 19.02.2026 in Commit 0afb24ea)

## Kontext

Die bisherige Nutzung von ModSecurity (CRS) war oft zu starr und erzeugte viele False Positives. OpenAppSec war eine gute Alternative, jedoch schwerfällig in der Verwaltung. ShieldPM benötigte eine moderne, smarte und granular pro Host konfigurierbare Firewall, die auch fortgeschrittene Bot-Netzwerke, Scraper und AI-Crawler dynamisch blockieren kann.

## Entscheidung

Die "Anubis AI Firewall" wurde in ShieldPM integriert.
- Anubis läuft als eigenständiger Daemon neben Nginx.
- Nginx kommuniziert über einen UNIX-Socket (`/run/nginx/anubis.sock`) mit Anubis (Traffic-Inspection).
- Das Backend (`backend/internal/anubis.js`) verwaltet die Anubis-Policies (YAML) dynamisch und lädt sie per SIGHUP neu, ohne Ausfallzeiten zu verursachen.
- Administratoren können im Frontend direkt Custom-Rules (z.B. Regex für User-Agents) anlegen, die per `X-ShieldPM-Host` Header exakt auf bestimmte Proxy Hosts angewendet werden.

## Begründung

- **Sicherheit:** Machine-Learning basierte Anomalieerkennung bietet einen weit besseren Schutz gegen Zero-Day-Exploits als rein signaturbasierte Firewalls.
- **Flexibilität:** Die enge Integration in das ShieldPM-Dashboard erlaubt eine viel zugänglichere WAF-Konfiguration.

## Konsequenzen

### Positiv
- Massiver Gewinn an Applikationssicherheit bei gleichzeitiger Reduktion von False Positives.

### Negativ
- Erhöhter Ressourcenverbrauch (RAM/CPU) auf dem Host-System durch den Anubis-Daemon.
- Komplexes IPC (Inter-Process Communication) zwischen Nginx, Backend und Anubis.

## Verwandte Seiten

- [ADR-Übersicht](./README.md)
