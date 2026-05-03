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

1. Pro Host (Proxy/Dead) kann eine Git-Konfiguration hinterlegt werden (Repo, Branch, Pfad, optional SSH-Key oder Token).
2. `internal/git-deploy.js` klont/aktualisiert das Repo (via `isomorphic-git`) ins Daten-Verzeichnis.
3. Nginx serviert den Inhalt als statische/dynamische Seite (je nach Konfiguration).
4. Aktualisierungen können manuell oder per Cron/Webhook ausgelöst werden.

## Sicherheit

- SSH-Keys und Tokens werden verschlüsselt gespeichert (`lib/encryption.js`).
- Geheime Werte werden **nicht** im Wiki/Audit-Log dokumentiert.

## Abhängigkeiten

- `isomorphic-git` — Pure-JS-Git-Implementation
- `internal/proxy-host.js`, `internal/dead-host.js` — Hosts mit Git-Sync
- `internal/audit-log.js` — Protokollierung

## Offene Fragen

- Unklar: Webhooks für automatisches Pull (vorhanden? geplant?)

## Verwandte Seiten

- [GitOps](./gitops.md)
- [Proxy-Host](./proxy-host.md)
- [Modulübersicht](./README.md)
- [Secrets & Sicherheit](../konfiguration/secrets-und-sicherheit.md)
