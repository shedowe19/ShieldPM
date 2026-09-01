# Datenmodell

## Zweck

Überblick über alle Datenbank-Tabellen und deren Beziehungen.

## Kontext

Die Datenbankstruktur wird durch Knex.js-Migrationen definiert. Objection.js-Modelle in `backend/models/` bilden die ORM-Schicht.

## Modelle

| Modell                  | Datei                      | Tabelle                     | Beschreibung                                         |
| ----------------------- | -------------------------- | --------------------------- | ---------------------------------------------------- |
| ProxyHost               | `proxy_host.js`            | `proxy_host`                | Reverse-Proxy-Hosts                                  |
| RedirectionHost         | `redirection_host.js`      | `redirection_host`          | Umleitungen                                          |
| DeadHost                | `dead_host.js`             | `dead_host`                 | 404-Hosts                                            |
| Stream                  | `stream.js`                | `stream`                    | TCP/UDP-Streams                                      |
| Certificate             | `certificate.js`           | `certificate`               | SSL-Zertifikate                                      |
| AccessList              | `access_list.js`           | `access_list`               | Zugriffslisten                                       |
| AccessListAuth          | `access_list_auth.js`      | `access_list_auth`          | Basic-Auth-Einträge                                  |
| AccessListClient        | `access_list_client.js`    | `access_list_client`        | IP-basierte Einträge                                 |
| HostDomain              | `host_domain.js`           | `host_domain`               | Domain-Zuordnungen                                   |
| User                    | `user.js`                  | `user`                      | Benutzer                                             |
| UserPermission          | `user_permission.js`       | `user_permission`           | Berechtigungen                                       |
| User2FA                 | `user-2fa.js`              | `user_2fa`                  | 2FA-Konfiguration                                    |
| User2FABackupCodes      | `user-2fa-backup-codes.js` | `user_2fa_backup_codes`     | 2FA-Backup-Codes                                     |
| AuthSession             | `auth-session.js`          | `auth_session`              | Login-Sessions                                       |
| AuthChallenge           | `auth-challenge.js`        | `auth_challenge`            | Einmalige MFA-/Step-up-Flows                         |
| InitialSetupClaim       | `initial-setup-claim.js`   | `initial_setup_claim`       | Atomarer erster Admin-Claim                          |
| OidcIdentity            | `oidc-identity.js`         | `oidc_identity`             | Eindeutige Issuer/Subject-Bindung                    |
| OidcFlow                | `oidc-flow.js`             | `oidc_flow`                 | Kurzlebiger Login-/Claim-State                       |
| Auth                    | `auth.js`                  | `auth`                      | Authentifizierungsdaten                              |
| Token                   | `token.js`                 | `token`                     | JWT-Tokens                                           |
| AuditLog                | `audit-log.js`             | `audit_log`                 | Protokoll-Einträge                                   |
| Setting                 | `setting.js`               | `setting`                   | Einstellungen                                        |
| DashboardNote           | `dashboard_note.js`        | `dashboard_note`            | Dashboard-Notizen                                    |
| ChatIntegration         | `chat_integration.js`      | `chat_integration`          | Telegram-Config                                      |
| CloudflaredTunnel       | `cloudflared_tunnel.js`    | `cloudflared_tunnel`        | CF-Tunnels                                           |
| TorOnion                | `tor_onion.js`             | `tor_onion`                 | Tor-Services                                         |
| WireGuardPeer           | `wireguard_peer.js`        | `wireguard_peer`            | WG-Peers                                             |
| DDNSProvider            | `ddns_provider.js`         | `ddns_provider`             | DDNS-Anbieter                                        |
| AnalyticCount           | `analytic_count.js`        | `analytic_count`            | Traffic-Zähler                                       |
| AnalyticsLogs           | `analytics_logs.js`        | `analytics_logs`            | Analytics-Logs                                       |
| AnalyticsIngestionBatch | —                          | `analytics_ingestion_batch` | Transaktionales Ledger für idempotentes Spool-Replay |
| NowHelper               | `now_helper.js`            | —                           | Hilfsklasse für Timestamps                           |

## Wichtige Relationen

- `ProxyHost` → `HostDomain` (1:n über `host_domains`)
- `ProxyHost` → `AccessList` (n:1 über `access_list_id`)
- `ProxyHost` → `Certificate` (n:1 über `certificate_id`)
- `AccessList` → `AccessListAuth` (1:n)
- `AccessList` → `AccessListClient` (1:n)
- `User` → `UserPermission` (1:n)
- `User` → `User2FA` (1:n)
- `User` → `AuthSession` (1:n)

## Gotchas

- `domain_names` auf `ProxyHost` ist kein DB-Feld — es wird im `$afterGet()` aus `host_domains` berechnet.
- Boolean-Felder in SQLite werden als `0`/`1` gespeichert. Die Konvertierung erfolgt im Model.
- `created_on` und `modified_on` verwenden `string`-Typ (nicht `datetime`) für DB-Kompatibilität.

## Verwandte Seiten

- [Datenbank](./datenbank.md)
- [Migrationen](./migrationen.md)
- [Modulübersicht](../module/README.md)
