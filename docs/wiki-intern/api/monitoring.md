# Monitoring Routes

## Zweck

REST-API für das Uptime-Monitoring-Modul.

Basis-Pfad:

```text
/api/monitoring
```

## Berechtigung

Alle Endpunkte benötigen ein gültiges JWT und die neue Permission `monitoring`.

| Aktion                                      | Permission                   |
| ------------------------------------------- | ---------------------------- |
| Listen/Get/Checks/Test                      | `monitoring:view` oder höher |
| Create/Update/Delete/Create from Proxy Host | `monitoring:manage`          |

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
  "enabled": true,
  "proxy_host_id": 12
}
```

## Statuswerte

| Status     | Bedeutung                                            |
| ---------- | ---------------------------------------------------- |
| `pending`  | Noch kein Check gespeichert                          |
| `up`       | Letzter Check erfolgreich                            |
| `degraded` | Fehler vorhanden, aber Threshold noch nicht erreicht |
| `down`     | Fehleranzahl erreicht Threshold                      |
| `paused`   | Monitor deaktiviert                                  |

## OpenAPI

Die Endpunkte sind im OpenAPI-Schema registriert:

```text
backend/schema/swagger.json
backend/schema/components/monitor-object.json
backend/schema/components/monitor-check-object.json
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
