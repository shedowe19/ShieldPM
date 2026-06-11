# Monitoring Routes

## Zweck

REST-API für das Uptime-Monitoring-Modul und seine SMTP-Benachrichtigungen.

Basis-Pfad:

```text
/api/monitoring
```

## Berechtigung

Alle Endpunkte benötigen ein gültiges JWT.

| Aktion                                      | Permission                                       |
| ------------------------------------------- | ------------------------------------------------ |
| Listen/Get/Checks/Test                      | `monitoring:view` oder höher                     |
| Create/Update/Delete/Create from Proxy Host | `monitoring:manage`                              |
| SMTP-Konfiguration lesen                    | `settings:get` auf `smtp-notification-config`    |
| SMTP-Konfiguration ändern/Testmail senden   | `settings:update` auf `smtp-notification-config` |

## Endpunkte

| Methode  | Pfad                                             | Zweck                            |
| -------- | ------------------------------------------------ | -------------------------------- |
| `GET`    | `/api/monitoring`                                | Monitore listen                  |
| `POST`   | `/api/monitoring`                                | Monitor erstellen                |
| `GET`    | `/api/monitoring/:id`                            | Monitor abrufen                  |
| `PUT`    | `/api/monitoring/:id`                            | Monitor aktualisieren            |
| `DELETE` | `/api/monitoring/:id`                            | Monitor soft-deleten             |
| `GET`    | `/api/monitoring/:id/checks`                     | Check-Historie abrufen           |
| `POST`   | `/api/monitoring/:id/test`                       | Monitor sofort prüfen            |
| `POST`   | `/api/monitoring/from-proxy-host/:proxy_host_id` | Monitor aus Proxy Host erstellen |
| `GET`    | `/api/monitoring/notifications/smtp`             | SMTP-Konfiguration abrufen       |
| `PUT`    | `/api/monitoring/notifications/smtp`             | SMTP-Konfiguration speichern     |
| `POST`   | `/api/monitoring/notifications/smtp/test`        | SMTP-Testmail senden             |

## Create Payload

```json
{
  "name": "Vaultwarden",
  "type": "http",
  "url": "https://vault.example.com",
  "method": "GET",
  "interval_seconds": 60,
  "timeout_seconds": 5,
  "expected_status": 200,
  "expected_body": "Vaultwarden",
  "failure_threshold": 3,
  "notification_enabled": true,
  "enabled": true,
  "proxy_host_id": 12
}
```

## SMTP Config Payload

```json
{
  "enabled": true,
  "host": "smtp.example.com",
  "port": 587,
  "secure": false,
  "username": "alerts@example.com",
  "password": "secret",
  "from": "ShieldPM <alerts@example.com>",
  "to": ["ops@example.com"],
  "subject_prefix": "[ShieldPM]"
}
```

Hinweise:

- `password` wird verschlüsselt gespeichert.
- `GET /api/monitoring/notifications/smtp` gibt kein Passwort zurück, sondern nur `password_set`.
- Wird beim Speichern kein Passwort gesendet, bleibt das vorhandene Passwort erhalten.
- Testmails verwenden die gespeicherte SMTP-Konfiguration.

## Statuswerte

| Status     | Bedeutung                                            |
| ---------- | ---------------------------------------------------- |
| `pending`  | Noch kein Check gespeichert                          |
| `up`       | Letzter Check erfolgreich                            |
| `degraded` | Fehler vorhanden, aber Threshold noch nicht erreicht |
| `down`     | Fehleranzahl erreicht Threshold                      |
| `paused`   | Monitor deaktiviert                                  |

## SMTP-Alertverhalten

Monitoring sendet SMTP-Mails nur bei relevanten Statuswechseln:

- `pending`/`up` → `degraded`
- `pending`/`degraded`/`up` → `down`
- `degraded`/`down` → `up` als Recovery-Mail

Keine Mail wird gesendet, wenn der Status gleich bleibt, z. B. `down` → `down`.

## OpenAPI

Die Endpunkte sind im OpenAPI-Schema registriert:

```text
backend/schema/swagger.json
backend/schema/components/monitor-object.json
backend/schema/components/monitor-check-object.json
backend/schema/components/smtp-notification-config-object.json
backend/schema/paths/monitoring/
```

Validierung:

```bash
cd backend
node validate-schema.js
```

## Verwandte Seiten

- [Modul: Monitoring](../module/monitoring.md)
- [API-Routen](./routen.md)
- [Schemas](./schemas.md)
