# DDNS

## Zweck

Dynamic DNS Client für automatische DNS-Aktualisierung bei IP-Wechsel.

## Kontext

Unterstützt Cloudflare, DuckDNS und benutzerdefinierte URLs als DDNS-Provider.

## Wichtige Dateien

- `backend/internal/ddns.js` (8 KB) — DDNS-Update-Logik
- `backend/internal/ddns-provider.js` (4 KB) — Provider-Verwaltung
- `backend/models/ddns_provider.js` (2 KB) — Objection.js-Modell
- `backend/routes/nginx/ddns_providers.js` (3 KB) — API-Routen

## Verhalten

- Periodische Prüfung der öffentlichen IP
- Aktualisiert DNS-Einträge bei Änderung
- Unterstützt IPv4 und IPv6
- Benutzerdefinierte Update-URLs werden vor dem Abruf gegen SSRF geprüft; IPv6-Literale werden dabei ohne URL-Klammern geprüft, damit die Loopback-Adresse `::1` zuverlässig blockiert wird.

## Abhängigkeiten

- HTTP-Client für DNS-API-Aufrufe

### Netzwerksicherheit und Fehlerstatus

Benutzerdefinierte URLs dürfen ausschließlich öffentliche HTTP(S)-Ziele erreichen. IPv4, IPv6 und IPv4-gemappte IPv6-Adressen werden geprüft. DNS wird erst beim Verbindungsaufbau aufgelöst; enthält die Antwort private oder reservierte Adressen, scheitert der Abruf. Der Socket verwendet ausschließlich die geprüften Adressen, wodurch eine zweite DNS-Auflösung zwischen Prüfung und Verbindung entfällt. Redirects werden nicht verfolgt. Netzwerkabrufe haben ein Zeitlimit von zehn Sekunden.

Ohne WAN-Adresse der gewählten IP-Version wird kein Provider-Update versendet. `updateProvider()` liefert zusätzlich zum persistierten Fehlerstatus ein strukturiertes Erfolg-/Fehlerergebnis. Die Testfunktion übernimmt diesen Status und meldet fehlgeschlagene Updates nicht mehr als Erfolg.

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

## Verwandte Seiten

- [Cloudflare Tunnels](./cloudflared.md)
- [IP-Ranges](./ip-ranges.md)
- [Proxy-Host](./proxy-host.md)
- [Modulübersicht](./README.md)
