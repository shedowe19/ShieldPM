# Datenmodell

Status: active
Last verified: 2026-11-04
Confidence: high

## Zweck

Überblick über die Objekte, die ShieldPM in der Datenbank hält, und über die
Regeln, die beim Schreiben gelten. Für Spalten und Constraints ist die
Migrationskette die Wahrheit, nicht diese Seite.

## Modellgruppen

`backend/models/` enthält 33 Dateien: 31 Modelldateien mit `tableName` (zusammen
39 Modellklassen/Tabellen, weil einige Dateien mehrere Modelle definieren), dazu
`token.js` (JWT-Objekt) und `now_helper.js`.

| Gruppe             | Modelle                                                                                         | Zweck                                        |
| ------------------ | ----------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Nginx-Hosts        | `proxy_host`, `redirection_host`, `dead_host`, `stream`                                         | die vier Hosttypen                           |
| Domain-Relationen  | `host_domain`, `host_domain_claim`                                                              | Domains je Host, Konfliktprüfung             |
| Host-Erweiterungen | `proxy_host_revision`, `proxy_host_monitor`, `proxy_host_monitor_check`, `monitor_incident`     | Versionen, Überwachung, Vorfälle             |
| TLS                | `certificate`                                                                                   | Zertifikate und Zuordnung                    |
| Zugriff            | `access_list`, `access_list_auth`, `access_list_client`, `firewall_list`                        | Auth-Regeln und IP-Firewall                  |
| Identität          | `user`, `auth`, `user_permission`, `token`, `auth-session`, `user-2fa`, `user-2fa-backup-codes` | Benutzer, Passwörter, Rechte, Sitzungen, 2FA |
| Integrationen      | `cloudflared_tunnel`, `tor_onion`, `wireguard_peer`, `ddns_provider`, `chat_integration`        | Tunnel, DDNS, Telegram                       |
| Betrieb            | `setting`, `audit-log`, `dashboard_note`                                                        | Einstellungen, Protokoll, Notizen            |
| Analytics          | `analytics_logs`, `analytic_count`                                                              | Rohlogs und Aggregate                        |

Zusätzlich existiert `now_helper` als Zeitstempel-Helfer ohne eigene Tabelle.

## Regeln

- **Booleans:** SQLite speichert `0`/`1`; nur die Modelle konvertieren. Außerhalb
  der Modelle keine `true`/`false`-Werte in Queries.
- **Zeitstempel:** `$beforeInsert` und `$beforeUpdate` setzen `created_on` und
  `modified_on`.
- **Löschen:** überwiegend Soft-Delete über `is_deleted = 1`. Hart löschen
  DDNS-Provider, Notification-Targets und Chat-Integrationen (`deleteById`);
  Zertifikate löschen regulär weich, Vorfälle hart per `.delete()`.
- **JSON-Felder:** `jsonAttributes` deklariert sie; SQLite speichert Text.
- **Abgeleitete Felder:** `domain_names` auf Proxy-Hosts kommt aus `host_domains`
  (`AGENTS.md`, Abschnitt „Gotchas“). Nicht direkt schreiben.
- **Verschlüsselung:** sensible Felder laufen über `backend/lib/encryption.js`;
  die Instanzschlüssel schreibt `backend/lib/config.js:145-162` nach
  `/data/shieldpm/keys.json`.

## Beziehungen (vereinfacht)

```
user 1─n proxy_host (owner_user_id)
proxy_host 1─n host_domain
proxy_host 1─1 proxy_host_monitor (host_id unique)
proxy_host 1─n proxy_host_monitor_check (host_id)
proxy_host 1─n proxy_host_revision
certificate 1─n proxy_host (certificate_id)
access_list 1─n access_list_auth / access_list_client
firewall_list n─n proxy_host (über meta.ip_firewall.list_ids)
user 1─n auth / auth-session / user-2fa
```

`models/token.js` ist kein Datenbankmodell, sondern das JWT-Objekt.

## Risiken und Stolperfallen

- **Domain-Claims:** Die Claim-Registry verhindert neue Doppelbelegungen; bestehende
  Kollisionen bleiben bei der Migration bewusst erhalten. Wer Domains direkt
  schreibt, umgeht die Prüfung.
- **Metadaten-Merge:** Docker-Rediscovery und andere Aktualisierungen müssen
  `meta` mergen, sonst gehen Firewall- oder Cache-Einstellungen verloren.
- **Revisionen:** verschlüsselte Snapshots dürfen nicht mit Klartext verglichen
  werden.
- **Analytics-Aufbewahrung:** Aggregation und Löschgrenzen liegen in eigenen
  Migrationen und Timern; ein manuelles Löschen kann Kennzahlen verfälschen.

## Offene Fragen

- Unklar: Ob `host_domain_claim` dauerhaft bestehen bleibt oder nur eine
  Übergangslösung zur Migration ist. `confidence: medium`.

## Verwandte Seiten

- [Datenbank und Migrationen](./migrations.md)
- [Host-Lebenszyklus](../architecture/host-lifecycle.md)
- [Datenmodell (Tiefe)](../reference/daten/datenmodell.md)
- [Datenbank (Tiefe)](../reference/daten/datenbank.md)
