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

1. Pro Proxy-Host mit Weiterleitungsschema `path` kann eine Git-Konfiguration hinterlegt werden (`git_repo_url`, `git_branch`, `git_poll_interval`, `git_poll_unit`, optional Auth-Daten).
2. `internal/git-deploy.js` klont/aktualisiert das Repo (via `isomorphic-git`) in ein Verzeichnis pro Host unter `/data/`.
3. Beim Branch-Wechsel wird das Repo neu geklont, sonst wird ein `git pull` ausgeführt.
4. Bei jedem erfolgreichen Sync wird `forward_host` auf das ausgecheckte Verzeichnis gesetzt und Nginx neu geladen.
5. **Trigger**: pro Host ein eigener `setInterval`-Timer (`git_poll_interval` × `git_poll_unit`, z. B. 5 minutes). Manuelle Sync-Trigger sind über die UI möglich.
6. Im Demo-Modus ist das Polling deaktiviert.

## Webhooks

Aktuell **nicht implementiert** — die Aktualisierung läuft ausschließlich per Polling-Timer. Externe Webhooks (z. B. von GitHub) werden nicht direkt empfangen. Eine manuelle Sync-Funktion in der UI dient als Workaround.

## Sicherheit

- HTTPS-Zugangstokens werden verschlüsselt gespeichert (`lib/encryption.js`); die Git-Implementierung unterstützt keine native SSH-Authentifizierung.
- Geheime Werte werden **nicht** im Wiki/Audit-Log dokumentiert.

## Abhängigkeiten

- `isomorphic-git` — Pure-JS-Git-Implementation
- `internal/proxy-host.js` — Hosts mit Git-Sync
- `internal/audit-log.js` — Protokollierung

### Parallelität und Konfigurationswechsel

Gleichzeitige Sync-Anfragen für denselben Host teilen sich einen laufenden Sync, sodass Klonen und Pullen nicht parallel im selben Arbeitsverzeichnis laufen. Ein Wechsel der Repository-URL wird zusätzlich zum Branch-Wechsel erkannt und löst einen neuen Clone aus. Gelöschte Hosts werden nicht synchronisiert. Bei einem neuen Root-Pfad werden die normalisierten Domains, das Zertifikat und die vollständige Access List vor dem Nginx-Rendern geladen.

Ändert sich die Repository-URL, wird die Polling-Konfiguration neu bewertet. Timerwerte werden auf mindestens zehn Sekunden und maximal den von Node.js unterstützten Timerbereich begrenzt; ungültige Werte erhalten einen sicheren Standard, statt durch einen Timerüberlauf eine schnelle Endlosschleife auszulösen.

### Zustandsprüfung nach Netzwerkoperationen

Nach Clone oder Pull und dem anschließenden Lesen der Commit-ID lädt der Sync den aktuellen Host erneut. Zwischen dieser letzten Prüfung und dem Verzeichnistausch liegt keine weitere asynchrone Git-Abfrage. Ist der Host inzwischen gelöscht, auf ein anderes Weiterleitungsschema umgestellt oder wurden Repository, Branch oder Zugangsdaten geändert, wird der alte Sync nicht als Erfolg gespeichert und erzeugt keine neue Nginx-Konfiguration. Der Preservation-Test prüft zusätzlich Repository- und Schemawechsel während einer verzögerten Commit-Abfrage.

Beim Wechsel von Repository oder Branch entsteht der Ersatz-Clone zunächst in einem eindeutigen Nachbarverzeichnis. Die bisher veröffentlichte Website bleibt während des Downloads sowie bei Clone-Fehlern oder inzwischen geänderter Hostkonfiguration erhalten. Erst nach erfolgreichem Clone und erneuter Zustandsprüfung wird das Verzeichnis ausgetauscht; seine bisherigen Zugriffsrechte bleiben erhalten. Scheitert die Veröffentlichung, wird das vorherige Verzeichnis zurückbenannt. Unvollständige Ersatzverzeichnisse werden aufgeräumt. `sixth-integrations-git-deploy-preservation.spec.js` prüft diese Übergänge auf einem echten lokalen Dateisystem mit simulierten Git-Netzwerkoperationen. Reguläre Pulls im unveränderten Repository arbeiten weiterhin im bestehenden Checkout.

Für verwaltete Roots unter `/data/websites/` verhindert die Nginx-Konfiguration das Folgen symbolischer Links. `.git`-Pfade werden bei statischen Hosts gesperrt, damit Repository-Konfiguration und Historie nicht öffentlich ausgeliefert werden. PHP-Anwendungen werden weiterhin als ausführbarer Anwendungscode behandelt; die Dateipfadprüfung stellt keine PHP-Sandbox bereit.

### Sichtbarkeit und Zeiteinheiten

Manueller Sync, Statusabfrage und Konfigurationsänderung laden Hosts innerhalb der aktuellen `permission_visibility`. Eingeschränkte Benutzer können ausschließlich eigene Hosts abrufen oder ändern; nur Sichtbarkeit `all` beziehungsweise interne Polling-Aufrufe erlauben fremde Hosts. Die Prüfung erfolgt vor Datei-, Git- oder Datenbankänderungen.

Gespeicherte Polling-Intervalle bleiben in ihrer gewählten Einheit erhalten: `1m` bedeutet eine Minute und `1h` eine Stunde. Erst nach der Umrechnung in Millisekunden gilt die Mindestdauer von zehn Sekunden.

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

## Verwandte Seiten

- [GitOps](./gitops.md)
- [Proxy-Host](./proxy-host.md)
- [Modulübersicht](./README.md)
- [Secrets & Sicherheit](../konfiguration/secrets-und-sicherheit.md)
