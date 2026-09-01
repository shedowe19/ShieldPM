# ADR: Security- und Durability-Modernisierung

## Status

Angenommen am 2026-08-31 für den gemeinsamen Modernisierungs-PR. Die Release-Version wird dadurch nicht automatisch
erhöht.

## Kontext

ShieldPM verbindet privilegierte Auth-, Nginx-, SSH-, Git-, AI- und Update-Aktionen. Mehrere frühere Pfade verließen
sich zu stark auf Browserzustand, Forwarded-Header, unbounded Providerdaten oder nicht atomare Datei/DB-Sequenzen. Ein
Prozessabbruch zwischen zwei Schritten konnte unklaren Zustand hinterlassen; öffentliche GitOps-Backups konnten zu viel
Material erfassen; initiale Credentials durften nicht aus Logs ableitbar sein.

## Entscheidung

### Identität und Authentifizierung

- Der erste Administrator beansprucht einen serverseitig gehashten 256-Bit-One-Time-Ownership-Token. Standardpfad ist
  `/data/shieldpm/initial-admin-setup-token`; Automatisierung bevorzugt `INITIAL_ADMIN_SETUP_TOKEN_FILE` mit `0600`.
  Tokenverbrauch und Useranlage sind eine Transaktion.
- Refresh-Sessions rotieren transaktional. Ein 15-Sekunden-Parallel-Request-Fenster liefert Retry/Conflict, echtes Replay
  widerruft die Familie.
- Cookie-`Secure` und Client-IP berücksichtigen Forwarded-Header nur hinter explizitem `TRUST_PROXY`.
- Impersonation bindet Target- an Actor-Session und recent authentication. Restore benötigt beide gültigen Seiten;
  nested impersonation und Step-up während Impersonation sind gesperrt.
- MFA, Step-up und OIDC-Flows erhalten serverseitige, kurzlebige, zweckgebundene Challenges/Identities.

### Daten und Runtime-Mutationen

- Analytics schreibt vor DB-Verarbeitung in einen fsync-NDJSON-Spool. Batch-Ledger und Nutzdaten committen atomar;
  Checkpoint/Kompaktierung folgt erst danach. Shutdown drainiert alle pending Batches.
- Nginx-Änderungen werden vollständig staged, mit `nginx -t` geprüft und bei Fehler durch DB-/Datei-Compensation
  zurückgerollt.
- DDNS-Custom-URLs sind HTTPS-only, public-unicast/DNS-gepinnt und pro Redirect revalidiert; Zeit/Größe/Redirects sind
  begrenzt, Fehler redigiert.
- Terminal verlangt TLS, authentifizierte ACL und gepinnten SSH-Host-Key. HMAC-Gateway-Assertions werden in 30-Sekunden-
  One-Time-Tickets umgetauscht, die Host, Authority, Browser-Fingerprint und ACL-Revision binden.

### GitOps und AI

- GitOps snapshot v2 exportiert nur allow-listed, secret-freie Felder von Proxy/Redirect/Dead/Stream. Manifest,
  SHA-256, Pfad-/Dateityp-/Größenlimits und strikte Schemas sind Pflicht. Dry Run nutzt denselben Apply-Pfad mit Rollback;
  Journal und Runtime-/DB-Backup ermöglichen Crash Recovery.
- AI-Toolargumente müssen strikte Server-Schemas erfüllen. Pro Antwort/Turn gelten feste Call-/Mutation-/Destructive-
  Limits, Ergebnisse sind bounded. Sensible Aktionen brauchen einen One-Time-HMAC-Confirmation-Token für Actor, Tool,
  Argumente und Ablauf.
- ChatOps verwendet einen live Integration-Principal statt eines synthetischen JWT und prüft Integration, Owner und
  Telegram-Allowlist bei jeder Nachricht.

### Runtime und Supply Chain

- Unterstützte Runtime ist Node.js 24 LTS mit Corepack und repository-pinned Yarn 4; Lockfiles werden immutable
  installiert.
- Native Updates bauen in Staging, verifizieren Artefakte, schalten atomar um und prüfen Health über den Unix-Socket.
  SQLite-Backups sind konsistent; externe DBs benötigen operator-bestätigte native Dumps.
- `SIGTERM`/`SIGINT` löst geordnetes Stoppen, Drain, Session-Ende und DB-Close aus.
- CI prüft Workspaces, Browser-Smokes, Audits und Migrationen auf SQLite/MySQL/PostgreSQL. Actions/Downloads werden auf
  unveränderliche Identitäten geprüft; Third-Party-Notices sind deterministisch.

## Konsequenzen

- Einige bisher akzeptierte Konfigurationen scheitern geschlossen (untrusted Proxy-Header, HTTP-Custom-DDNS,
  Terminal ohne Host-Key/ACL/TLS, secret-bearing GitOps, unbestätigte AI-Aktion).
- Betreiber müssen Setup-Token lokal lesen, Terminal-Fingerprints unabhängig verifizieren, PAT/Provider-Secrets nach
  GitOps-Restore neu provisionieren und externe DB-Dumps testen.
- Recovery-Code und Journale erhöhen die Komplexität, machen aber die Commit-Grenze testbar und wiederanlauffähig.
- Der Versionsbump bleibt eine separate Patch-/Minor-/Major-Entscheidung.

## Externe/manuelle Grenzen

- GitHub Branch Protection/Rulesets müssen im GitHub-Repository aktiviert werden; Code kann sie nicht erzwingen.
- Ein externer MySQL/PostgreSQL-Rollback bleibt Operatoraufgabe und braucht einen validierten nativen Dump.
- Das bewegliche `shieldpm-nginx:master`-Basisimage kann erst nach Veröffentlichung eines unterstützten externen Digests
  reproduzierbar gepinnt werden.

## Verwandte Seiten

- [Architektur-Überblick](../architektur/ueberblick.md)
- [Auth-Session-Service](../module/auth-session-service.md)
- [Analytics](../module/analytics.md)
- [GitOps](../module/gitops.md)
- [Terminal](../module/terminal.md)
- [AI-Agent](../module/ai-agent.md)
- [Deployment](../entwicklung/deployment.md)
