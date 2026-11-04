# Host-Lebenszyklus

Status: active
Last verified: 2026-11-04
Confidence: high

## Zweck

ShieldPM verwaltet vier Nginx-Hosttypen mit gemeinsamer Basis. Diese Seite
erklärt, welche Typen es gibt, welche Daten sie besitzen und was beim Anlegen,
Ändern und Löschen passiert. Sie verhindert, dass Änderungen nur einen Typ
abdecken und die anderen brechen.

## Was existiert

| Typ              | Dienst                                 | Route                          | Ziel-Nginx-Ordner  |
| ---------------- | -------------------------------------- | ------------------------------ | ------------------ |
| Proxy-Host       | `backend/internal/proxy-host.js`       | `/api/nginx/proxy-hosts`       | `proxy_host`       |
| Redirection      | `backend/internal/redirection-host.js` | `/api/nginx/redirection-hosts` | `redirection_host` |
| Dead Host (404)  | `backend/internal/dead-host.js`        | `/api/nginx/dead-hosts`        | `dead_host`        |
| Stream (TCP/UDP) | `backend/internal/stream.js`           | `/api/nginx/streams`           | `stream`           |

Gemeinsame Logik liegt in `backend/internal/host.js`, Zusatzlogik in
`proxy-host-options.js`, `proxy-host-policies.js`, `host-revisions.js` und
`host-traffic-policy.js`.

## Wie es funktioniert

1. Die Route validiert den Request gegen ein JSON-Schema.
2. Der Dienst prüft Berechtigungen über `access` und die Sichtbarkeit des Hosts.
3. Der Datensatz wird bei Proxy-, Redirection- und Dead-Hosts in einer Transaktion
   geschrieben; Domains werden dort über `host_domains` gepflegt. Streams sind
   anders: sie werden über `incoming_port` adressiert und speichern keine Domains
   (`stream.js:92-97`).
4. Der Dienst ruft `internalNginx.configure(...)` auf. Die Engine rendert,
   validiert und lädt neu.
5. Schlägt ein Schritt fehl, wird die Host-Konfiguration zurückgerollt. Nur beim
   Wiederherstellen eines Proxy-Hosts wiederholt die Kompensation bis zu drei
   Versuche (zwei Wiederholungen) in frischen Transaktionen, und nur bei exakt
   Snapshot-, Lock-Timeout- oder Deadlock-Fehlern von MySQL/MariaDB.
6. Bei Proxy-Hosts können zusätzlich Überwachung, Diagnose, OAuth2-Proxy,
   Upload-Relay, IP-Firewall und Cache beteiligt sein.

## Daten und Invarianten

- **Domains:** `domain_names` ist eine abgeleitete Sicht auf `host_domains`
  (`backend/models/proxy_host.js`). Nie direkt schreiben.
- **Metadaten:** Viele Erweiterungen liegen in `meta` (z. B. `meta.ip_firewall`).
  Docker-Rediscovery muss bestehende Metadaten mergen, nicht ersetzen.
- **Revisionen:** `proxy_host_revision` speichert verschlüsselte Host-Stände für
  Rollback (`backend/internal/host-revisions.js`).
- **Rechteausweitung:** Öffentliche Zertifikat- und Access-List-Erweiterungen
  prüfen die Berechtigung je Relation und Eigentümer.
- **Deaktivieren statt löschen:** `renameConfigAsError` macht einen defekten Host
  sichtbar, ohne die Datei zu verlieren.

## Risiken und Stolperfallen

- Ein Rollback, der nur die Nginx-Datei zurücknimmt, nicht aber Access-List-
  Dateien, hinterlässt inkonsistenten Zustand.
- Host-Löschung muss abhängige Objekte (Zertifikatszuordnung, Monitore,
  Revisionen, Tunnel-Verknüpfungen) mit behandeln.
- `domain_names` doppelt zu pflegen erzeugt Geister-Domains im Zertifikat.
- Die Massenpfade (`bulkGenerateConfigGroups`) dürfen keine Einzel-Reloads
  auslösen.

## Offene Fragen

- Unklar: Ob alle vier Hosttypen dieselben Revisionsmechanismen nutzen; die
  Revisionstabellen und -routen sind auf Proxy-Hosts ausgelegt. `confidence: medium`.

## Verwandte Seiten

- [Architektur](./overview.md)
- [Nginx-Engine](./nginx-engine.md)
- [Datenmodell](../data/overview.md)
- [Proxy-Host (Tiefe)](../reference/module/proxy-host.md)
- [Host-Versionen (Tiefe)](../reference/features/host-revisionen.md)
- [Host-Logik (Tiefe)](../reference/module/host.md)
