# ADR: Request Rate Limiting

## Titel

Einführung eines granularen Request Rate Limitings für Proxy Hosts.

## Status

`Akzeptiert` (Implementiert am 29.12.2025 in PR #160)

## Kontext

Viele Webdienste, die hinter ShieldPM gehostet werden, benötigen Schutz vor Brute-Force-Angriffen, Scraping oder Denial-of-Service (DoS) Attacken auf Applikationsebene. Bisher bot ShieldPM keine Möglichkeit, die Anfragerate (Requests pro Sekunde/Minute) direkt zu drosseln, ohne auf externe Firewalls zurückzugreifen.

## Entscheidung

Das Feature "Request Rate Limiting" wurde implementiert.
- Nutzung der nativen Nginx-Direktiven `limit_req_zone` und `limit_req`.
- Das Backend generiert dedizierte Memory-Zonen pro Proxy-Host, um Kollisionen zu vermeiden.
- Konfigurierbarkeit direkt über das UI (Anfragen pro Sekunde/Minute, Burst-Größe, Nodelay-Flag).
- Bei Überschreitung des Limits liefert Nginx automatisch den HTTP-Statuscode 429 (Too Many Requests).

## Begründung

- **Sicherheit:** Erster und wichtigster Schutzwall gegen Layer-7 DDoS-Angriffe und aggressive Scraper.
- **Ressourcenschutz:** Schützt empfindliche Backend-Services vor Überlastung durch fehlerhafte oder bösartige Clients.

## Konsequenzen

### Positiv
- Signifikante Erhöhung der Resilienz aller proxifizierten Dienste.

### Negativ
- Bei fehlerhafter Konfiguration (zu strikt) können legitime Nutzer durch 429-Fehler ausgesperrt werden.

## Verwandte Seiten

- [ADR-Übersicht](./README.md)
