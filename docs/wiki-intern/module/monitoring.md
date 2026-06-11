# Monitoring

## Zweck

Das Monitoring-Modul stellt ein Uptime-Kuma-artiges HTTP/HTTPS-Monitoring für ShieldPM bereit. Es prüft definierte Endpunkte aktiv, speichert Check-Historie und stellt Statusinformationen für UI, API und spätere Benachrichtigungen bereit.

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

## Backend-Dateien

| Datei                                             | Zweck                                                 |
| ------------------------------------------------- | ----------------------------------------------------- |
| `backend/internal/monitoring.js`                  | Business-Logik, Scheduler, HTTP-Checks, Statuswechsel |
| `backend/routes/monitoring.js`                    | REST-API unter `/api/monitoring`                      |
| `backend/models/monitor.js`                       | Objection-Model für Tabelle `monitor`                 |
| `backend/models/monitor_check.js`                 | Objection-Model für Tabelle `monitor_check`           |
| `backend/migrations/20260610000000_monitoring.js` | Tabellen und Permission-Spalte                        |
| `backend/test/internal/monitoring.spec.js`        | Unit-Tests für Check-/Statuslogik                     |

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
- `status`
- `last_checked_at`
- `last_latency_ms`
- `last_http_status`
- `last_error`
- `proxy_host_id`
- `enabled`
- `is_deleted`

### `monitor_check`

Speichert einzelne Prüfergebnisse.

Wichtige Felder:

- `monitor_id`
- `checked_at`
- `status`
- `latency_ms`
- `http_status`
- `error`
- `response_excerpt`

## Statuslogik

- Erfolgreicher Check → `up`
- Ein Fehler unterhalb `failure_threshold` → `degraded`
- Fehleranzahl >= `failure_threshold` → `down`
- deaktivierter Monitor → `paused`
- neuer Monitor vor erstem Check → `pending`

## Scheduler

`internalMonitoring.initTimer()` wird beim Backend-Start initialisiert. Der Scheduler:

1. lädt aktive Monitore,
2. prüft nur fällige Monitore,
3. führt Checks mit Concurrency-Limit aus,
4. speichert History und Snapshot-Felder,
5. verschiebt `next_check_at` mit leichtem Jitter.

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

Die Seite folgt dem bestehenden `index.tsx` / `TableWrapper.tsx` / `Table.tsx`-Pattern und nutzt `MonitorModal` für Create/Edit.

## Berechtigungen

Neue Permission:

```text
monitoring: manage | view | hidden
```

Sie wird in `user_permission.monitoring` gespeichert und im Permissions-Modal angezeigt.

## Nächste Ausbaustufen

- Telegram/Webhook/Ntfy-Alerts bei Statuswechseln
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
