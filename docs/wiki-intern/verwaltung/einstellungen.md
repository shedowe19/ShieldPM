# Einstellungen

## Zweck

Verwaltung von globalen Systemeinstellungen (Standard-Seite, Default-Site, OIDC-Settings, AI-Settings, GitOps-Settings, Anubis-Settings usw.).

## Kontext

Die Anwendung benötigt globale Konfigurationswerte, die in der Datenbank gespeichert und über die API verwaltet werden. Die Werte werden u. a. von der Nginx-Engine, dem AI-Modul und den Login-Routen ausgelesen.

## Wichtige Dateien

- `backend/internal/setting.js` (3 KB) — Business-Logik für Einstellungen
- `backend/models/setting.js` — Einstellungs-Modell
- `backend/routes/settings.js` — REST-API unter `/api/settings`
- `frontend/src/pages/Settings/` — UI mit Tabs (DefaultSite, Ai, GitOps, Layout)

## Verhalten

- `setting.js` ermöglicht das Lesen und Aktualisieren von Systemeinstellungen.
- Einzelne Settings werden per Key gespeichert (z. B. `default-site`, `oidc-config`).
- Nach einer Änderung wird ggf. ein Nginx-Reload oder ein Service-Restart ausgelöst.
- Die Default-Site-Variante mit eigenem HTML zeigt Validierungsfehler direkt unter dem beschrifteten Editor an und verknüpft sie über `aria-describedby`; ein leerer Inhalt kann nicht gespeichert werden. Regression: `frontend/src/pages/Settings/DefaultSite.test.tsx`.
- Ein fehlgeschlagenes Nachladen der Default-Site-Einstellung zeigt bei bereits vorhandenen Daten einen Fehler im weiterhin geöffneten Formular. Ungespeichertes HTML bleibt auch bei anschließender Wiederherstellung der Verbindung erhalten. Scheitert das erste Laden ohne Daten, wird kein Formular mit Ersatzwerten angeboten.
- AI-Modelllisten gelten nur für die Verbindung, mit der sie angefordert wurden. Änderungen an Provider, Base-URL oder API-Key verwerfen geladene Optionen und ausstehende Antworten einschließlich deren Fehlern. Auch ein Wechsel zurück zum vorherigen Wert reaktiviert keine ältere Anfrage. Regression: `frontend/src/pages/Settings/Ai.test.tsx`.
- GitOps-Einstellungen werden erst nach erfolgreichem Laden bearbeitbar. Ungespeicherte Änderungen sperren Aktionen gegen die bisher gespeicherte Repository-Konfiguration; siehe [GitOps](../module/gitops.md).

## Standardseite und Fehlerbehandlung

Partielle Settings-Updates verändern nur die tatsächlich mitgesendeten Felder `value` und `meta`. Ausgelassene Felder bleiben aus dem gespeicherten Datensatz erhalten, auch bei der anschließenden Nginx- und HTML-Erzeugung. Ein reines HTML-Metadaten-Update behält daher den bisherigen Seitenmodus; ein Wechsel des Modus auf `html` kann vorhandene HTML-Metadaten weiterverwenden. Ein mitgesendetes `meta` ersetzt weiterhin das gesamte Metadatenobjekt.

Änderungen an `default-site` laufen unter derselben Nginx-Konfigurationssperre wie Hoständerungen. Die bestehende Konfiguration und bei HTML-Änderungen der bisherige Seiteninhalt werden vor der Ersetzung gesichert. Erst nach erfolgreicher Generierung und Prüfung werden die Datenbankänderung und der Reload durchgeführt; bei einem Fehler werden die Datenbanktransaktion, Konfiguration und HTML zurückgesetzt und die bisherige Konfiguration erneut geladen. Scheitert auch diese Wiederherstellung, bleibt der Fehler sichtbar und muss anhand der Serverprotokolle geprüft werden.

Beim Start wird die vollständige gespeicherte Einstellung einschließlich `value` und `meta` geladen. Die Option `REGENERATE_ALL` verwendet für 404-Hosts deren eigene Vorlage und deren Konfigurationsverzeichnis. Regressionstests: `backend/test/internal/setting-rollback.spec.js` und `backend/test/internal/setup-state.spec.js`.

## Abhängigkeiten

- Objection.js-Modell `setting.js`
- `internal/audit-log.js` — Protokollierung
- Wird von `internal/nginx.js`, `internal/ai.js`, `internal/gitops.js`, `internal/anubis.js` u. a. gelesen

## Hinweis

Dashboard-Notizen sind ein eigenständiges Feature und werden auf einer separaten Seite dokumentiert: [Dashboard-Notizen](../module/dashboard-notes.md).

## Verwandte Seiten

- [Verwaltungsübersicht](./README.md)
- [Dashboard-Notizen](../module/dashboard-notes.md)
- [Audit-Log](./audit-log.md)
- [Modulübersicht](../module/README.md)
