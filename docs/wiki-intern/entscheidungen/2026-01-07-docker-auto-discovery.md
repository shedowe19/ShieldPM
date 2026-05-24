# ADR: Docker Auto-Discovery

## Titel

Integration eines Moduls zur automatischen Erkennung und Konfiguration von Docker-Containern.

## Status

`Akzeptiert` (Implementiert am 07.01.2026 in PR #219)

## Kontext

Viele Nutzer betreiben ShieldPM auf demselben Docker-Host wie ihre Upstream-Applikationen. Bisher mussten Administratoren für jeden neuen Container manuell einen Proxy-Host anlegen, die IP-Adresse (oft dynamisch in Docker-Netzwerken) eintragen und den Port definieren. Dies war fehleranfällig und aufwendig.

## Entscheidung

Ein Docker-Auto-Discovery-Modul wurde im Backend implementiert.

- ShieldPM verbindet sich über den Docker Socket (`/var/run/docker.sock`) mit der Docker-API.
- Es lauscht auf Container-Events (Start/Stop).
- Über Docker-Labels (z.B. `shieldpm.enable=true`, `shieldpm.host=app.domain.com`) können Proxy-Hosts vollautomatisch konfiguriert und aktuell gehalten werden.

## Begründung

- **Automatisierung:** Reduziert den administrativen Aufwand auf null, sobald das Label-Setup einmal steht (vergleichbar mit Traefik).
- **Zuverlässigkeit:** ShieldPM erkennt IP-Änderungen von Containern bei Neustarts sofort und passt die Upstream-Ziele dynamisch an, ohne dass Nginx ins Leere läuft.

## Konsequenzen

### Positiv

- Traefik-ähnliche Entwicklererfahrung.

### Negativ

- Sicherheitsimplikationen: ShieldPM benötigt Zugriff auf den Docker-Socket, was im Falle einer Kompromittierung des Containers root-ähnliche Rechte auf dem Host-System bedeuten kann.

## Verwandte Seiten

- [ADR-Übersicht](./README.md)
