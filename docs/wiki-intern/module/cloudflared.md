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

### Serialisierung und globale Sichtbarkeit

Start, Stop, Restart und Löschen laufen pro Tunnel-ID nacheinander. Gleichzeitige Starts können dadurch keinen zweiten unverwalteten Prozess erzeugen. REST und KI verwenden denselben internen Löschweg; dessen Sperre umfasst Stop und Datenbanklöschung. Ein bereits eingereihter Restart kann deshalb erst nach Abschluss der Löschung fortfahren. Fehler asynchroner Start-/Restart-Aufträge werden ausdrücklich abgefangen und protokolliert.

Start und Restart laden innerhalb dieser Warteschlange den aktuellen, nicht gelöschten Datenbankeintrag. Ein alter Snapshot kann daher weder einen gelöschten Tunnel erneut starten noch nach einer Tokenrotation veraltete Zugangsdaten verwenden. Numerische und stringförmige IDs teilen dieselbe Warteschlange und Prozesszuordnung. `fifth-integrations-cloudflared-delete.spec.js` prüft entfernte und soft-gelöschte Einträge, Tokenrotation und einen während der verzögerten Datenbanklöschung eingereihten Restart.

Ändern und Löschen beachten die von der jeweiligen Capability gelieferte `permission_visibility`: `all` erlaubt fremde Tunnel, eingeschränkte Sichtbarkeit begrenzt auf den Eigentümer. Globale Verwaltungsrechte werden nicht durch eine zusätzliche pauschale Owner-Prüfung blockiert.

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

## Verwandte Seiten

- [Modulübersicht](./README.md)
- [Proxy-Host](./proxy-host.md)
- [IP-Ranges (Cloudflare-IPs)](./ip-ranges.md)
- [Tor Onion Services](./tor.md)
- [WireGuard](./wireguard.md)
