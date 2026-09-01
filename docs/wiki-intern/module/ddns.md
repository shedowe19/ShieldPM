# DDNS

## Zweck

DDNS aktualisiert Cloudflare-, DuckDNS- oder explizite Custom-HTTPS-Provider bei einer geänderten öffentlichen IPv4/
IPv6-Adresse.

## Ablauf

- Ein fester 60-Sekunden-Timer und ein kurzer Startup-Delay stoßen die Prüfung an.
- Eine In-Flight-Sperre verhindert parallele Durchläufe.
- IPv4/IPv6 kommen ausschließlich von den festen ipify-JSON-Endpunkten und müssen public unicast sein.
- Provider werden unabhängig aktualisiert; Fehler eines Providers stoppen die übrigen nicht.
- Shutdown entfernt Timer und wartet auf den laufenden Durchlauf.

## Custom-URL-SSRF-Grenze

- nur HTTPS, TLS-Verifikation aktiv, keine URL-Credentials;
- nur `{IP}`, `{IPv4}`, `{IPv6}`, `{DOMAIN}`, URL-encoded eingesetzt;
- localhost, private, loopback, link-local, reserved, multicast und Metadata-Adressen blockiert;
- alle DNS-Antworten validiert, eine validierte Adresse je Hop gepinnt;
- jeder Redirect erneut validiert, maximal 3 Redirects;
- 10 Sekunden Timeout, 4 KiB URL, 64 KiB Response;
- Fehler/Logs auf 500 Zeichen begrenzt und um Query-URLs, Tokens und konfigurierte Secretwerte redigiert.

## Wichtige Dateien

- `backend/internal/ddns.js`
- `backend/internal/ddns-provider.js`
- `backend/models/ddns_provider.js`
- `backend/routes/nginx/ddns_providers.js`

## Verwandte Seiten

- [DDNS-Provider](./ddns-provider.md)
- [IP-Ranges](./ip-ranges.md)
- [Secrets und Sicherheit](../konfiguration/secrets-und-sicherheit.md)
- [Security-Modernisierung](../entscheidungen/2026-08-31-security-modernisierung.md)
