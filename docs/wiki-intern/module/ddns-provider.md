# DDNS-Provider

## Zweck

`backend/internal/ddns-provider.js` verwaltet Provider-Metadaten, verschlüsselte Konfiguration, Capabilities,
Ownership und Audit-Ereignisse. Die Ausführung übernimmt `backend/internal/ddns.js`.

## Unterstützte Typen

- Cloudflare (Zone-ID + API-Token, A/AAAA)
- DuckDNS (Token, IPv4/IPv6)
- Custom HTTPS Callback mit strikter SSRF-Prüfung

## Berechtigungen und Secrets

CRUD prüft die jeweilige `ddns_providers:*`-Capability. Bei eingeschränkter Visibility werden Reads/Updates/Deletes vor
der Mutation auf `owner_user_id` begrenzt. Provider-Token werden verschlüsselt gespeichert, in API-/Logfehlern
redigiert und nicht in GitOps snapshot v2 exportiert. Nach Disaster Recovery müssen Secrets neu provisioniert werden.

## Verwandte Seiten

- [DDNS](./ddns.md)
- [GitOps](./gitops.md)
- [Benutzer & Auth](./benutzer-auth.md)
- [Modulübersicht](./README.md)
