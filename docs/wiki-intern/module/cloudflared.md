# Cloudflare Tunnels

## Zweck

Integration von Cloudflare Tunnels (cloudflared) für Zero-Trust-Zugriff ohne offene Ports.

## Kontext

Ermöglicht das Exponieren von Diensten über Cloudflare ohne eingehende Portfreigaben im Router.

## Wichtige Dateien

- `backend/internal/cloudflared.js` (4 KB) — Business-Logik
- `backend/models/cloudflared_tunnel.js` (2 KB) — Objection.js-Modell
- `backend/routes/nginx/cloudflared.js` (5 KB) — API-Routen

## Verhalten

- Verwaltet Cloudflare-Tunnel-Konfigurationen in der Datenbank
- Startet und überwacht die lokal installierte Cloudflared-Binary
- Kein offener Port auf dem Host nötig

## Abhängigkeiten

- Cloudflared-Binary (muss verfügbar sein)
- `internal/audit-log.js` — Protokollierung

### Prozesslebenszyklus

Das Modul startet die lokal installierte `cloudflared`-Binary mit dem Tunnel-Token in der Prozessumgebung. Es registriert einen `error`-Handler für Startfehler, beispielsweise eine fehlende Binary, und speichert Fehlerstatus und Fehlermeldung. Ein verspätetes `exit`-Event eines gestoppten Prozesses darf weder den Eintrag eines bereits gestarteten Nachfolgers löschen noch dessen Status überschreiben. Auch die verzögerte Online-Prüfung bezieht sich auf die konkrete Prozessinstanz.

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

## Verwandte Seiten

- [Modulübersicht](./README.md)
- [Proxy-Host](./proxy-host.md)
- [IP-Ranges (Cloudflare-IPs)](./ip-ranges.md)
- [Tor Onion Services](./tor.md)
- [WireGuard](./wireguard.md)
