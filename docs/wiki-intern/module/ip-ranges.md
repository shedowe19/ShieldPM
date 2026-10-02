# IP-Ranges (Cloudflare-IPs)

## Zweck

Lädt bei Aktivierung regelmäßig die offiziellen [Cloudflare-IP-Ranges](https://www.cloudflare.com/ips/) und stellt sie Nginx als `set_real_ip_from`-Liste zur Verfügung. **Standardmäßig ist der Abruf deaktiviert**. Administratoren aktivieren ihn unter Einstellungen → Netzwerk; die Vorgabe wird in der Datenbank gespeichert und ohne Neustart angewendet.

## Kontext

Wenn ShieldPM hinter Cloudflare betrieben wird (Proxy-Modus), kommen Anfragen aus Cloudflare-IPs. Ohne `real_ip`-Konfiguration würden alle Logs/Filter Cloudflare statt des echten Clients sehen.

## Wichtige Dateien

- `backend/internal/ip_ranges.js` — Lädt und cached Cloudflare-IP-Listen
- `backend/internal/ip-ranges-options.js` — Validierte Datenbankoptionen und Live-Anwendung
- `backend/templates/ip_ranges.conf` — Generiertes Nginx-Snippet mit `set_real_ip_from`-Direktiven
- Aufruf: typischerweise im Backend-Boot-Prozess oder per Maintenance-Task

## Verhalten

1. Holt die aktuellen IPv4-Liste (`https://www.cloudflare.com/ips-v4`) und IPv6-Liste (`https://www.cloudflare.com/ips-v6`) per HTTPS, optional über `proxy-agent`.
2. Prüft die IPv4-/IPv6-CIDRs vollständig mit `ipaddr.js` und rendert sie via Liquid in `backend/templates/ip_ranges.conf`.
3. Schreibt das Ergebnis nach `/data/nginx/ip_ranges.conf`. Bei einem Abruf im laufenden Betrieb folgt ein Nginx-Reload; beim Start übernimmt ihn der anschließende gemeinsame Initialisierungsablauf.

## Konfiguration

- **Update-Intervall**: `ip-ranges-options.meta.refresh_interval_hours`, ganze Stunden von **6 bis 594** in Sechs-Stunden-Schritten; Standard **6 Stunden**. Eine reine Intervalländerung ersetzt den Timer.
- **Aktivierung**: `ip-ranges-options.meta.enabled` ist standardmäßig `false`. Aktivieren startet einen Hintergrundabruf und den regelmäßigen Timer; die API wartet beim Speichern nicht auf die externe Antwort. Deaktivieren stoppt den Timer und verhindert die Veröffentlichung noch laufender Abrufe. Bereits bekannte Ranges bleiben erhalten. Beim Backend-Start wird ein aktivierter erster Abruf vor dem anschließenden gemeinsamen Nginx-Reload abgewartet.
- **Upgrade**: Die Migration übernimmt `SKIP_IP_RANGES=false` als aktiviert und einen gültigen `IPRT` von 1 bis 99 als Sechs-Stunden-Multiplikator einmalig für fehlende Datensätze. Danach beeinflussen diese Variablen die Laufzeit nicht mehr.
- **Manueller Trigger**: AI-Tool `renew_ip_ranges` (siehe `backend/internal/ai/tools.js`) ruft `internalIpRanges.fetch()` direkt auf.

## Abhängigkeiten

- `internal/nginx.js` — Reload
- `proxy-agent` — Nutzung des System-Proxies (`HTTP_PROXY`/`HTTPS_PROXY`)
- HTTP(S)-Zugriff zu `cloudflare.com` (Outbound erforderlich)

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

## Validierung der Cloudflare-Listen

IPv4- und IPv6-CIDRs werden mit `ipaddr.js` vollständig geprüft. Leere Listen, HTML-Fehlerantworten, falsche Adressfamilien und ungültige Präfixe ersetzen die bestehende Konfiguration nicht. HTTP-Fehler und Zeitüberschreitungen werden als Fehler behandelt; der nächste planmäßige Versuch bleibt möglich. Damit werden insbesondere die zuvor durch den fehlerhaften IPv6-Regulärausdruck verlorenen Netze übernommen.

## Atomarer Dateiaustausch

Die neue Liste wird vollständig in einer eindeutigen temporären Datei im selben Verzeichnis geschrieben und anschließend per Rename veröffentlicht. Schreibfehler wie ein voller Datenträger oder ein fehlgeschlagener Dateiaustausch lassen die bisherige vollständige Trust-Liste erhalten. Temporäre Dateien werden im `finally`-Block entfernt. `fourth-ip-ranges-files.spec.js` prüft diese Fehlerpfade mit echten temporären Dateien und die erfolgreiche Veröffentlichung beider Adressfamilien.

## Verwandte Seiten

- [Nginx-Engine](./nginx-engine.md)
- [Cloudflare Tunnels](./cloudflared.md)
- [Einstellungen](../verwaltung/einstellungen.md#zertifikats--und-netzwerkoptionen)

- [Modulübersicht](./README.md)
