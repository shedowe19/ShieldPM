# Access-Lists

## Zweck

Zugriffskontrolle für Proxy-Hosts via Basic Auth, IP-Ranges und mTLS.

## Kontext

Access-Lists können an Proxy-Hosts gebunden werden, um den Zugriff einzuschränken.

## Wichtige Dateien

- `backend/internal/access-list.js` (17 KB) — Business-Logik
- `backend/internal/ip_ranges.js` (3 KB) — Cloudflare IP-Ranges
- `backend/models/access_list.js` (3 KB) — Objection.js-Modell
- `backend/models/access_list_auth.js` (1 KB) — Basic-Auth-Modell
- `backend/models/access_list_client.js` (1 KB) — IP-Client-Modell
- `backend/routes/nginx/access_lists.js` (3 KB) — API-Routen

## Verhalten

- Basic Auth: Benutzername + bcrypt-gehashtes Passwort
- IP-Ranges: Allow/Deny basierend auf Client-IP
- mTLS: Client-Zertifikat-Authentifizierung
- Access-Lists werden in htpasswd-Dateien unter `/data/access/` geschrieben

## Abhängigkeiten

- `internal/nginx.js` — Config-Generierung
- `internal/audit-log.js` — Protokollierung
- `bcryptjs` — Passwort-Hashing

## Offene Fragen

- Keine

## Verwandte Seiten

- [Proxy-Host](./proxy-host.md)
- [Modulübersicht](./README.md)
