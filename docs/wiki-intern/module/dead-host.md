# Dead-Host (404-Hosts)

## Zweck

Verwaltung von "Dead Hosts" — Domains, die bewusst eine 404- oder Fehler-Seite ausliefern, ohne weiterzuleiten oder zu proxen.

## Kontext

Dead-Hosts werden eingesetzt, um bekannte Domains "abzufangen" (z. B. nicht genutzte Subdomains, ehemalige Domains), damit sie nicht versehentlich auf den Default-Site-Handler fallen oder Crawler/Angreifer Informationen erhalten.

## Wichtige Dateien

- `backend/internal/dead-host.js` (~420 Zeilen) — Business-Logik
- `backend/models/dead_host.js` — Objection.js-Modell mit `host_domains`-Relation
- `backend/templates/dead_host.conf` — EJS-Template für leere/404-Server-Blöcke
- `backend/routes/nginx/dead_hosts.js` — REST-API-Routen unter `/api/nginx/dead-hosts`
- `backend/lib/access/dead_hosts-*.json` — RBAC-Regeln
- `frontend/src/pages/Nginx/DeadHosts/` — UI-Tabelle
- `frontend/src/modals/DeadHostModal.tsx` — Bearbeitungs-Modal

## Verhalten

1. Benutzer legt einen Dead-Host mit Domain(s) und optionaler Custom-Konfiguration an.
2. `internal/dead-host.js` validiert Berechtigungen und speichert.
3. `internal/nginx.js` rendert das Template zu `.conf`-Datei unter `/data/nginx/dead_host/`.
4. Eingehende Requests auf diese Domain erhalten standardmäßig HTTP 404.
5. Optional kann eine Custom-Page oder ein eigenes SSL-Zertifikat verwendet werden.

## Abhängigkeiten

- `internal/host.js` — gemeinsame Host-Hilfslogik
- `internal/nginx.js` — Config-Generierung und Reload
- `internal/certificate.js` — optionales Zertifikat
- `internal/audit-log.js` — Protokollierung
- `internal/gitops.js` — automatische Synchronisierung bei aktivem GitOps

## Offene Fragen

- Keine

## Verwandte Seiten

- [Proxy-Host](./proxy-host.md)
- [Redirection-Host](./redirection-host.md)
- [Host-Hilfslogik](./host.md)
- [Modulübersicht](./README.md)
- [Datenmodell](../daten/datenmodell.md)
