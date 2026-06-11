# Monitoring

## Zweck

Das Monitoring-Modul stellt ein Uptime-Kuma-artiges HTTP/HTTPS-Monitoring für ShieldPM bereit. Es prüft definierte Endpunkte aktiv, speichert Check-Historie, zeigt Statusinformationen in UI/API und kann bei relevanten Statuswechseln SMTP-E-Mail-Benachrichtigungen senden.

## MVP-Umfang

Der aktuelle MVP unterstützt:

- HTTP/HTTPS-Monitore
- Methoden `GET` und `HEAD`
- konfigurierbares Intervall und Timeout
- erwarteter HTTP-Status
- optionaler Body-Substring-Match
- Failure Threshold für `degraded`/`down`
- Statuswerte `pending`, `up`, `degraded`, `down`, `paused`
- Latenz, letzter HTTP-Status und letzter Fehler
- Check-History in `monitor_check`
- manueller Testlauf über die API/UI
- optionale Zuordnung zu einem Proxy Host (`proxy_host_id`)
- RBAC über `user_permission.monitoring`
- Audit-Log für Create/Update/Delete
- globale SMTP-Konfiguration für Monitoring-Alarme
- Test-E-Mail für SMTP-Konfiguration
- Down-/Degraded-/Recovery-Mail nur bei Statuswechseln, nicht bei jeder Prüfung

## Backend-Dateien

| Datei                                             | Zweck                                                       |
| ------------------------------------------------- | ----------------------------------------------------------- |
| `backend/internal/monitoring.js`                  | Business-Logik, Scheduler, HTTP-Checks, Statuswechsel       |
| `backend/internal/notifications.js`               | SMTP-Konfiguration, Mailversand und Monitoring-Mailvorlagen |
| `backend/routes/monitoring.js`                    | REST-API unter `/api/monitoring`                            |
| `backend/models/monitor.js`                       | Objection-Model für Tabelle `monitor`                       |
| `backend/models/monitor_check.js`                 | Objection-Model für Tabelle `monitor_check`                 |
| `backend/migrations/20260610000000_monitoring.js` | Tabellen und Permission-Spalte                              |
| `backend/test/internal/monitoring.spec.js`        | Unit-Tests für Check-/Status-/Alertlogik                    |
| `backend/test/internal/notifications.spec.js`     | Unit-Tests für SMTP-Konfiguration und Mailversand           |

## Datenmodell

### `monitor`

Speichert die Monitor-Konfiguration und den letzten bekannten Status.

Wichtige Felder:

- `name`
- `type` (`http` im MVP)
- `url`
- `method`
- `interval_seconds`
- `timeout_seconds`
- `expected_status`
- `expected_body`
- `failure_threshold`
- `consecutive_failures`
- `status`
- `last_checked_on`
- `last_success_on`
- `last_failure_on`
- `last_latency_ms`
- `last_http_status`
- `last_error`
- `proxy_host_id`
- `enabled`
- `notification_enabled`
- `is_deleted`

### `monitor_check`

Speichert einzelne Prüfergebnisse.

Wichtige Felder:

- `monitor_id`
- `checked_on`
- `status`
- `latency_ms`
- `http_status`
- `error`
- `response_excerpt`

### `setting:smtp-notification-config`

Die globale SMTP-Konfiguration liegt in der bestehenden Tabelle `setting` unter der ID:

```text
smtp-notification-config
```

`meta` enthält Host, Port, TLS-Flag, Benutzername, verschlüsseltes Passwort, Absender, Empfänger und Betreff-Präfix. Das Passwort wird mit `lib/encryption.js` verschlüsselt gespeichert und in API-Antworten nur als `password_set` angezeigt.

## Status- und Alertlogik

- Erfolgreicher Check → `up`
- Ein Fehler unterhalb `failure_threshold` → `degraded`
- Fehleranzahl >= `failure_threshold` → `down`
- deaktivierter Monitor → `paused`
- neuer Monitor vor erstem Check → `pending`

SMTP-Benachrichtigungen werden nur ausgelöst, wenn:

1. SMTP global aktiviert und vollständig konfiguriert ist,
2. `monitor.notification_enabled` aktiv ist,
3. der Status wirklich wechselt,
4. der neue Status `degraded` oder `down` ist oder ein vorher gestörter Monitor wieder `up` wird.

Dadurch gibt es keine Mail bei jedem einzelnen Check, sondern nur Statuswechsel- und Recovery-Mails.

## Scheduler

`internalMonitoring.initTimer()` wird beim Backend-Start initialisiert. Der Scheduler:

1. lädt aktive Monitore,
2. prüft nur Monitore, deren `last_checked_on` älter als `interval_seconds` ist,
3. führt den HTTP/HTTPS-Check mit Timeout aus,
4. speichert Check-History und Snapshot-Felder,
5. löst bei relevanten Statuswechseln optional SMTP-Benachrichtigungen aus.

Wichtig: Der Scheduler darf keine Nginx-Reloads triggern und darf Proxy-/Nginx-Operationen nicht blockieren.

## API

Siehe [Monitoring Routes](../api/monitoring.md).

## UI

Die Frontend-Seite liegt unter:

```text
frontend/src/pages/Monitoring/
```

Route:

```text
/monitoring
```

Die Seite folgt dem bestehenden `index.tsx` / `TableWrapper.tsx` / `Table.tsx`-Pattern und nutzt:

- `MonitorModal` für Create/Edit/Test einzelner Monitore
- `SmtpNotificationModal` für globale SMTP-Konfiguration und Testmail

## Berechtigungen

Neue Permission:

```text
monitoring: manage | view | hidden
```

Sie wird in `user_permission.monitoring` gespeichert und im Permissions-Modal angezeigt.

Die SMTP-Konfiguration verwendet zusätzlich die bestehende Settings-Berechtigung (`settings:get`/`settings:update`) für `smtp-notification-config`, weil dort Zugangsdaten gespeichert werden.

## Nächste Ausbaustufen

- Telegram/Webhook/Ntfy-Alerts als weitere Notification-Provider
- Incident-Tabelle für längere Ausfälle
- TCP/DNS/TLS-Monitore
- SLA-/Uptime-Reports
- Dashboard-Widget
- automatische Monitor-Erstellung für alle Proxy Hosts
- Public Status Page

## Verwandte Seiten

- [API: Monitoring](../api/monitoring.md)
- [Datenmodell](../daten/datenmodell.md)
- [Migrationen](../daten/migrationen.md)
- [Screens & Pages](../ui/screens.md)
