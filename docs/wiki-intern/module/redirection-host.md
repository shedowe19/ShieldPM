# Redirection-Host

## Zweck

Verwaltung von HTTP/HTTPS-Umleitungen (Redirections), die eine Quell-Domain auf ein anderes Ziel weiterleiten.

## Kontext

Redirection-Hosts werden verwendet, um eingehende Anfragen z. B. von alten Domains, Tippfehler-Domains oder marketing-spezifischen URLs auf eine kanonische Ziel-URL umzuleiten (HTTP-Statuscode 301/302).

## Wichtige Dateien

- `backend/internal/redirection-host.js` (~448 Zeilen) — Business-Logik (CRUD, Aktivieren/Deaktivieren, Zertifikat-Zuordnung)
- `backend/models/redirection_host.js` — Objection.js-Modell, Relationen zu `host_domains` und `certificate`
- `backend/templates/redirection_host.conf` — EJS-Template für das Nginx-`server`-Block
- `backend/routes/nginx/redirection_hosts.js` — REST-API-Routen unter `/api/nginx/redirection-hosts`
- `backend/lib/access/redirection_hosts-*.json` — RBAC-Regeln (create/get/list/update/delete)
- `frontend/src/pages/Nginx/RedirectionHosts/` — UI-Tabelle und Modal
- `frontend/src/modals/RedirectionHostModal.tsx` — Bearbeitungs-Modal

## Verhalten

1. Benutzer legt einen Redirection-Host mit Quell-Domain(s), Ziel-URL und HTTP-Code (301/302) an.
2. `internal/redirection-host.js` validiert Berechtigungen, speichert das Modell und legt `host_domains`-Einträge an.
3. `internal/nginx.js` rendert das Template `redirection_host.conf` zu einer `.conf`-Datei unter `/data/nginx/redirection_host/`.
4. Optional kann ein SSL-Zertifikat zugewiesen werden (HTTPS-Umleitung).
5. Nginx-Reload (debounced).

## Abhängigkeiten

- `internal/host.js` — gemeinsame Host-Hilfslogik (Domain-Validierung, Konflikt-Prüfung)
- `internal/nginx.js` — Config-Generierung und Reload
- `internal/certificate.js` — optionales Zertifikat
- `internal/audit-log.js` — Protokollierung
- `internal/gitops.js` — wird bei aktivem GitOps automatisch synchronisiert

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

## Verwandte Seiten

- [Proxy-Host](./proxy-host.md)
- [Dead-Host](./dead-host.md)
- [Host-Hilfslogik](./host.md)
- [Modulübersicht](./README.md)
- [Datenmodell](../daten/datenmodell.md)
