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

### Kodierung von Provider-Parametern

DuckDNS-Token und Domains sowie Cloudflare-Abfragefilter werden mit `URLSearchParams` kodiert. Zeichen wie `&` bleiben Teil des jeweiligen Werts und können keine zusätzlichen Update-Parameter oder DNS-Typfilter erzeugen. Cloudflare-Zonen- und Record-IDs werden beim Einfügen in den URL-Pfad kodiert. Regressionen prüfen die vom HTTP-Client tatsächlich verwendeten URLs.

### Gleichzeitige Aktualisierungen und Startwiederholungen

Überlappende Intervallaufrufe teilen einen laufenden Aktualisierungslauf. Trifft dabei eine erzwungene Aktualisierung nach einer Konfigurationsänderung ein, folgt anschließend ein weiterer Lauf mit neu geladenen Providern. Dadurch überschreiben konkurrierende periodische Läufe keine neueren Ergebnisse und erzeugen keine doppelten WAN-Abfragen.

Cloudflare-Aktualisierungen warten auch bei einem einzelnen Fehler auf sämtliche bereits gestarteten Record-Anfragen. Erst danach wird der Fehler weitergegeben und gegebenenfalls der erzwungene Folgelauf gestartet. Eine langsame AAAA-Aktualisierung des alten Laufs kann dadurch nach einem schnellen A-Fehler nicht die neuere IPv6-Adresse zurücksetzen. `fifth-integrations-ddns-partial-failure.spec.js` prüft diese Reihenfolge mit verzögerten HTTP-Antworten.

Ein erneuter Timer-Start ersetzt sowohl das Intervall als auch die verzögerte Erstabfrage. Fehler beim Leeren einer benutzerdefinierten HTTP-Antwort besitzen einen eigenen Listener und können den Backend-Prozess nicht als unbehandeltes Stream-Ereignis beenden.

Ein gespeicherter `last_error` löst beim nächsten regulären Intervall einen erneuten Updateversuch aus, auch wenn die WAN-Adresse unverändert geblieben ist. Das betrifft insbesondere fehlgeschlagene erzwungene Aktualisierungen nach Domain- oder Zugangsdatenänderungen. Nach einem erfolgreichen Versuch wird der Fehler gelöscht; weitere Intervalle warten wieder auf eine IP-Änderung. `sixth-integrations-ddns-retry.spec.js` prüft Fehler, automatischen Wiederholungsversuch und anschließenden Ruhezustand.

Die Statusfelder `last_ipv4`, `last_ipv6`, `last_updated_on` und `last_error` sind in der Datenbank nullable und dürfen auch in API-Antworten `null` enthalten. Das veröffentlichte Antwortschema bildet diese Werte ausdrücklich ab. `sixth-integrations-ddns-response-contract.spec.js` validiert vollständige Erstellungs- und Listenantworten des echten HTTP-Routers mit echten SQLite-Migrationen und Modellen gegen das zusammengesetzte OpenAPI-Schema.

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

## Verwandte Seiten

- [Cloudflare Tunnels](./cloudflared.md)
- [IP-Ranges](./ip-ranges.md)
- [Proxy-Host](./proxy-host.md)
- [Modulübersicht](./README.md)
