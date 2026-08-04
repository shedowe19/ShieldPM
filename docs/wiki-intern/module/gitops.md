# GitOps

## Zweck

Git-basierte Konfigurationssynchronisierung (Backup, Versionierung, Restore).

## Kontext

GitOps ermöglicht es, die gesamte ShieldPM-Konfiguration in einem Git-Repository zu sichern und wiederherzustellen.

## Wichtige Dateien

- `backend/internal/gitops.js` (38 KB) — Haupt-Business-Logik (größtes Modul)
- `backend/internal/git-deploy.js` (11 KB) — Auto-Deploy von Git-Repos
- `backend/routes/gitops.js` (3 KB) — API-Routen

## Verhalten

- Exportiert Konfiguration als JSON/YAML
- Synchronisiert mit Remote-Git-Repository via `isomorphic-git`
- Unterstützt SSH-Keys und HTTPS-Tokens für Authentifizierung
- Git-Deploy: Automatisches Klonen und Deployen von statischen Sites
- Host-Firewall-Policies werden vor zugehörigen Proxy-Hosts importiert. Jede `firewall-policies/*.yaml` braucht eine positive, stabile `id`; ihre YAML-Daten werden vor dem Persistieren mit derselben Validierung wie die API normalisiert. Bei einem nicht überschreibenden Restore darf eine vorhandene lokale Policy-ID nur wiederverwendet werden, wenn ihre deklarative Definition exakt übereinstimmt. Ein Konflikt – oder ein Proxy-Host, dessen `firewall_policy_id` keine passende Policy derselben Revision definiert – wird abgewiesen statt stillschweigend an eine lokale Policy gebunden. Bei einem überschreibenden Restore setzt eine ältere Proxy-Host-Datei ohne `firewall_policy_id` eine zuvor vorhandene Zuordnung explizit auf `null`; ein Rollback behält damit keine nicht deklarierte Sperre. Volatile Feed-Caches gehören nicht ins Repository; die konfigurierten Quellen werden beim Restore vor Nginx-Render und Reload aktualisiert, während ein vorhandener letzter gültiger Cache bis zum vollständigen Ersatz erhalten bleibt. Fehlt ein Cache für eine nicht erreichbare Quelle, wird kein Reload mit einer leeren Feed-Sperre vorgenommen. Bei Full Sync werden veraltete Firewall-Policies erst entfernt, nachdem alle Proxy-Host-Konfigurationen gegen eine Übergangs-Map erzeugt wurden; so entstehen keine Nginx-Konfigurationen mit fehlenden Maps. Bei Fehlern in Policy- oder abhängigen Host-Dateien bleibt die vorhandene Firewall-Policy erhalten. Da Firewall-Policy-IDs für die deklarativen `firewall_policy_id`-Referenzen der Proxy-Hosts erhalten bleiben, setzt ShieldPM nach einem Restore unter PostgreSQL die zugehörige ID-Sequenz auf den höchsten bestehenden Wert. Das gilt sowohl für GitOps als auch für die SQLite→PostgreSQL-Übernahme; die nächste API-erzeugte Policy erhält dadurch eine freie ID statt eines Duplicate-Key-Fehlers.

## Abhängigkeiten

- `isomorphic-git` — Git-Operationen in Node.js
- `archiver` — ZIP-Archivierung für Export
- `js-yaml` — YAML-Serialisierung

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

## Verwandte Seiten

- [Git-Deploy](./git-deploy.md)
- [Modulübersicht](./README.md)
- [Deployment](../entwicklung/deployment.md)
- [Secrets & Sicherheit](../konfiguration/secrets-und-sicherheit.md)
