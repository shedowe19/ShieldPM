# Glossar

Status: active
Last verified: 2026-11-04
Confidence: high

## Zweck

Die Begriffe, die in diesem Wiki eine bestimmte Bedeutung haben. Ausführliche
Definitionen stehen in der Tiefendoku; hier steht die Kurzform für den Einstieg.

| Begriff                          | Bedeutung                                                                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Kuratierte Seite**             | Synthese unter `llm-wiki/wiki/`; erklärt einen Bereich und verlinkt die Tiefe.                                                              |
| **Tiefendoku / Referenz**        | `llm-wiki/wiki/reference/`; modulweise Details, aus `docs/wiki-intern/` übernommen.                                                         |
| **Raw**                          | `llm-wiki/raw/`; unveränderliche Belege, derzeit die ersetzte `agent.md`-Fassung.                                                           |
| **Host-Revision** (Host-Version) | Verschlüsselter Snapshot eines Proxy-Hosts mit Rollback (`host-revisions.js`). Code/DB/API: `revision`; UI/Nutzertext: „Host-Version“.      |
| **Nginx-Engine**                 | `backend/internal/nginx.js` (auch „Nginx-Konfigurationsengine“, Code: `internalNginx`): rendert Templates, prüft mit `nginx -tq`, lädt neu. |
| **Nginx-Build**                  | Der kompilierte Webserver aus dem Repository `shieldpm-nginx`; nicht mit der Engine verwechseln.                                            |
| **Staged Config**                | Konfigurationsdatei, die geschrieben, geprüft und erst dann aktiviert wird.                                                                 |
| **Host-Typ**                     | Proxy-, Redirection-, Dead-Host oder Stream.                                                                                                |
| **Domain-Claim**                 | Reservierung eines Domainnamens für genau einen Host.                                                                                       |
| **IP-Firewall**                  | Regeln je Proxy-Host (IP, ASN, Land) mit eigener Sperrseite.                                                                                |
| **Access-List**                  | Wiederverwendbare Basic-Auth- oder mTLS-Regel für Hosts.                                                                                    |
| **Incident**                     | Eintrag der Störungszentrale mit Verfügbarkeit und Benachrichtigung.                                                                        |
| **TScanner**                     | Projekt eigene statische Prüfung mit 9 Checks und 4 AST-Policies.                                                                           |

## Ältere Glossare

Dieses Glossar ist der Einstieg. Die ausführliche Begriffsliste steht unter
[reference/glossar.md](./reference/glossar.md); `reference/projekt/begriffe.md`
verweist nur noch dorthin. Damit gibt es eine Quelle.

## Verwandte Seiten

- [Index](./index.md)
- [Projektüberblick](./overview.md)
- [Glossar (Tiefe)](./reference/glossar.md)
- [Begriffe (Tiefe)](./reference/projekt/begriffe.md)
