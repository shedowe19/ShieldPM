# Git-Deploy

## Zweck

Automatisches Auschecken/Aktualisieren statischer Webseiten oder Konfigurationen aus Git-Repositories und Bereitstellung über Proxy-Hosts. Ergänzt das [GitOps-Modul](./gitops.md), unterscheidet sich aber im Zweck:

- **GitOps**: Synchronisierung der **ShieldPM-Konfiguration** (Hosts, Zertifikate, Settings) ins Git-Repo.
- **Git-Deploy**: Auschecken **fremder** Repos (z. B. statische Sites, PHP-Apps) ins `/data/`-Verzeichnis, damit Nginx sie ausliefern kann.

## Kontext

Typische Anwendungsfälle:

- Hugo/Jekyll/Hugo-Sites direkt aus Git deployen
- Konfigurations-Snippets aus Git ziehen
- PHP-Anwendungen automatisch auf neuen Stand bringen

## Wichtige Dateien

- `backend/internal/git-deploy.js` (~417 Zeilen) — Klonen, Pullen, Branch-Wechsel, Auth-Handling
- `backend/migrations/20260119000000_add_git_sync.js` — Git-Sync-Felder pro Host
- `frontend/src/components/GitSyncTab.tsx` — UI-Tab im Host-Modal
- `frontend/src/hooks/useGitSync.ts` — React-Query-Hook

## Verhalten

1. Pro Host (Proxy/Dead) kann eine Git-Konfiguration hinterlegt werden (`git_repo_url`, `git_branch`, `git_poll_interval`, `git_poll_unit`, optional Auth-Daten).
2. `internal/git-deploy.js` klont/aktualisiert das Repo (via `isomorphic-git`) in ein Verzeichnis pro Host unter `/data/`.
3. Beim Branch-Wechsel wird das Repo neu geklont, sonst wird ein `git pull` ausgeführt.
4. Bei jedem erfolgreichen Sync wird `forward_host` auf das ausgecheckte Verzeichnis gesetzt und Nginx neu geladen.
5. **Trigger**: pro Host ein eigener `setInterval`-Timer (`git_poll_interval` × `git_poll_unit`, z. B. 5 minutes). Manuelle Sync-Trigger sind über die UI möglich.
6. Im Demo-Modus ist das Polling deaktiviert.

## Webhooks

Aktuell **nicht implementiert** — die Aktualisierung läuft ausschließlich per Polling-Timer. Externe Webhooks (z. B. von GitHub) werden nicht direkt empfangen. Eine manuelle Sync-Funktion in der UI dient als Workaround.

## Sicherheit

- SSH-Keys und Tokens werden verschlüsselt gespeichert (`lib/encryption.js`).
- Geheime Werte werden **nicht** im Wiki/Audit-Log dokumentiert.

## Abhängigkeiten

- `isomorphic-git` — Pure-JS-Git-Implementation
- `internal/proxy-host.js`, `internal/dead-host.js` — Hosts mit Git-Sync
- `internal/audit-log.js` — Protokollierung

## Offene Fragen

- Keine (Polling-Mechanik ist beschrieben, Webhook-Empfänger sind nicht implementiert).

## Verwandte Seiten

- [GitOps](./gitops.md)
- [Proxy-Host](./proxy-host.md)
- [Modulübersicht](./README.md)
- [Secrets & Sicherheit](../konfiguration/secrets-und-sicherheit.md)
