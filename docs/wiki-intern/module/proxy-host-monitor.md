# Proxy-Host-Überwachung

## Zweck

Der Dienst prüft, ob das konfigurierte Upstream-Ziel eines Proxy-Hosts erreichbar ist. Er speichert den aktuellen
Zustand, Antwortzeit, HTTP-Status und einen begrenzten Verlauf. Ein aktivierter Telegram-Alarm meldet Wechsel des
Zustands an die für den Besitzer aktivierten ChatOps-Integrationen.

## Kontext

`backend/internal/proxy-host-monitor.js` startet nach dem Start des API-Servers. Ein Polling-Takt von 10 Sekunden
lädt fällige Hosts und führt insgesamt höchstens fünf Checks gleichzeitig aus. Das nächste Fälligkeitsdatum wird
gespeichert; ein Neustart erzeugt deshalb keine unbeschränkte Reihe gleichzeitiger Prüfungen. SIGTERM beendet den
Timer und bricht laufende Sockets ab. Ausgeschaltete und gelöschte Hosts werden nicht geprüft.

## Wichtige Dateien

- `backend/internal/proxy-host-monitor.js` — Zielauflösung, HTTP-/TCP-Probes, Scheduler, Verlauf und Rechteprüfung
- `backend/models/proxy_host_monitor.js` — Einstellungen und zuletzt gemessener Zustand
- `backend/models/proxy_host_monitor_check.js` — einzelne, zeitlich sortierte Messergebnisse
- `backend/migrations/20260923000000_add_proxy_host_monitor.js` — DB-Schema
- `backend/routes/nginx/proxy_hosts.js` — geschützte HTTP-Routen
- `backend/schema/paths/nginx/proxy-hosts/hostID/monitor/` — OpenAPI- und Eingabeverträge
- `backend/internal/chat.js` — Telegram-Nachricht an konfigurierte erlaubte IDs des Host-Besitzers
- `backend/internal/gitops.js` — Export und Wiederherstellung der Einstellungen als `proxy-host-monitors/{host_id}.yaml`

## Verhalten

- Die Aktivierung wird je Host konfiguriert. Für HTTP(S) benutzt der Check das bestehende Upstream-Ziel und einen
  relativen Pfad. Ein am `forward_host` angehängter Pfad wird wie bei der Nginx-Generierung vorangestellt. TCP
  öffnet eine Verbindung ohne Daten zu senden; bei Terminal-Hosts gelten `terminal_host` und `terminal_port`.
- Die Anwendung nimmt keine beliebigen vollständigen URLs entgegen. Nur bestehende Proxy-Hosts mit Berechtigung
  `proxy_hosts:update` dürfen ihre Monitor-Konfiguration ändern. Dateibasierte Ziele und Unix-Sockets werden
  abgelehnt. HTTP-Probes verwenden weder Sitzungs-Cookies noch Redirects; der Response-Body wird verworfen.
- Der HTTP-Status muss exakt dem konfigurierten Code entsprechen. Ein fehlgeschlagener Verbindungsaufbau, Timeout
  oder anderer Status setzt den Zustand auf `down`. `unknown` bezeichnet noch nicht geprüfte Hosts; deaktivierte
  Monitore und Hosts erscheinen als `paused`, ohne den letzten gespeicherten Check zu verfälschen.
- Die Konfiguration begrenzt Intervalle auf 15–3600 Sekunden und Timeouts auf 500–15000 Millisekunden; der Timeout
  muss kürzer als das Intervall sein. Manuelle Checks teilen sich die Begrenzung auf fünf Verbindungen und sind
  zusätzlich auf zehn Aufrufe je Minute und IP begrenzt.
- Pro Host bleiben höchstens 100 Check-Einträge und höchstens 30 Tage erhalten. Das Löschen des Hosts entfernt
  Einstellungen und Verlauf. Eine Änderung von Prüftyp, Pfad oder erwartetem Status beginnt eine neue Historie;
  die Änderung von Intervall, Timeout oder Benachrichtigung erhält bisherige Messungen.
- Ein täglicher Cleanup entfernt auch bei pausierten Monitoren Einträge nach 30 Tagen und beseitigt Konfigurationen,
  deren Proxy-Host inzwischen gelöscht wurde (höchstens 200 verwaiste Hosts pro Durchgang).
- Die erste erfolgreiche Messung erzeugt keinen Telegram-Alarm; ein erster Fehler und spätere Up-/Down-Wechsel
  werden an aktivierte Telegram-Integrationen desselben Besitzers gesendet. Zwischen Nachrichten für denselben
  Host liegen mindestens fünf Minuten. Ein währenddessen zurückgehaltener Wechsel wird bei einem späteren Check
  nach Ablauf der Wartezeit gesendet, sofern der neue Zustand dann noch gilt. Der Check-Verlauf bleibt lückenlos
  innerhalb der Aufbewahrungsgrenze. Ein Telegram-Fehler ändert das gespeicherte Messergebnis nicht.
- Wenn sich das Upstream-Ziel des Hosts ändert, werden der letzte Status und alte Messergebnisse zurückgesetzt.
  GitOps exportiert nur Monitor-Einstellungen und keine historischen Messergebnisse. Backups vor Einführung dieses
  Features besitzen keinen Monitor-Ordner; ihr Import lässt lokal vorhandene Monitore unberührt.

## Schnittstellen

| Route                                                | Recht                             | Zweck                                         |
| ---------------------------------------------------- | --------------------------------- | --------------------------------------------- |
| `GET /api/nginx/proxy-hosts/monitors/status?ids=1,2` | `proxy_hosts:list` + Sichtbarkeit | Zustände für höchstens 100 angeforderte Hosts |
| `GET /api/nginx/proxy-hosts/:host_id/monitor`        | `proxy_hosts:get`                 | Konfiguration, Status und Verlauf             |
| `PUT /api/nginx/proxy-hosts/:host_id/monitor`        | `proxy_hosts:update`              | Konfiguration erstellen oder ersetzen         |
| `POST /api/nginx/proxy-hosts/:host_id/monitor/check` | `proxy_hosts:update`              | Sofortige Messung                             |

## Abhängigkeiten

- [Proxy-Host](./proxy-host.md) — Ziel und Besitzer
- [ChatOps](./chatops.md) — Telegram-Integration
- [Datenmodell](../daten/datenmodell.md) — Datenbanktabellen

## Offene Fragen

- TODO: Falls später Mail oder Webhook als Ausgabekanal eingeführt wird, die Alarmzustellung um einen ausdrücklich
  konfigurierten Kanal erweitern. Derzeit versendet nur eine bestehende, aktivierte Telegram-Integration Alarme.

## Verwandte Seiten

- [Proxy-Host](./proxy-host.md)
- [API-Routen](../api/routen.md)
- [Modulübersicht](./README.md)
