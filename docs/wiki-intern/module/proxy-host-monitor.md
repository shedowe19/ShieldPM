# Proxy-Host-Überwachung

## Zweck

Der Dienst prüft, ob das konfigurierte Upstream-Ziel eines Proxy-Hosts erreichbar ist. Er speichert den aktuellen
Zustand, Antwortzeit, HTTP-Status und einen begrenzten Verlauf. Ein aktivierter Telegram-Alarm meldet Wechsel des
Zustands an die für den Besitzer aktivierten ChatOps-Integrationen.

## Kontext

`backend/internal/proxy-host-monitor.js` startet nach dem Start des API-Servers. Ein Polling-Takt von 10 Sekunden
lädt fällige Hosts und führt insgesamt höchstens fünf Checks gleichzeitig aus. Das nächste Fälligkeitsdatum wird
gespeichert; ein Neustart erzeugt deshalb keine unbeschränkte Reihe gleichzeitiger Prüfungen. Bei `SIGTERM` in
Produktion und bei `SIGINT` oder `SIGTERM` in der Entwicklung wird der Timer beendet und laufende Sockets werden
abgebrochen. Ausgeschaltete und gelöschte Hosts werden nicht geprüft.

## Wichtige Dateien

- `backend/internal/proxy-host-monitor.js` — Zielauflösung, HTTP-/TCP-Probes, Scheduler, Verlauf und Rechteprüfung
- `backend/models/proxy_host_monitor.js` — Einstellungen und zuletzt gemessener Zustand
- `backend/models/proxy_host_monitor_check.js` — einzelne, zeitlich sortierte Messergebnisse
- `backend/migrations/20260923000000_add_proxy_host_monitor.js` — DB-Schema
- `backend/migrations/20260923000001_add_proxy_host_monitor_tls_options.js` — TLS-Vertrauensanker und Servername
- `backend/migrations/20260924000000_add_proxy_host_monitor_skip_certificate_verification.js` — optionale Zertifikatsprüfung
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
- HTTPS-Probes prüfen das Upstream-Zertifikat und den Servernamen. Optional kann `upstream_ca` ein PEM-Bundle
  mit höchstens 65.535 Bytes und acht Zertifikaten als Vertrauensbasis festlegen. Dieses Bundle ersetzt die
  standardmäßigen Node.js-Vertrauensanker; ohne Bundle gelten die Node.js-Standardeinstellungen.
  `upstream_server_name` überschreibt den für TLS verwendeten DNS-Namen, wenn Verbindungsadresse und
  Zertifikatsname verschieden sind. Bei einem Zertifikatsfehler lautet der Status `unknown`, ohne einen
  Ausfallalarm auszulösen.
- Nur für HTTPS kann der Benutzer `skip_certificate_verification` ausdrücklich aktivieren. Dann bleibt die
  Verbindung TLS-verschlüsselt, aber Zertifikatskette und Serveridentität werden nicht geprüft: Auch fremde,
  selbstsignierte oder abgelaufene Zertifikate werden akzeptiert. Das konfigurierte CA-Bundle wird für diesen
  Check nicht verwendet; ein `upstream_server_name` dient weiterhin nur als SNI zur Auswahl des virtuellen
  Upstreams. Der Monitor wertet danach dessen HTTP-Status aus. Ein Angreifer zwischen Monitor und Upstream könnte
  diesen Status verfälschen. Die Probe sendet weiterhin keine Cookies oder Zugangsdaten. Für reines HTTP oder TCP
  gibt es keine TLS-Zertifikatsprüfung. Ohne den Schalter bleibt die strikte Prüfung aktiv. Ein Wechsel des
  Upstream-Ziels setzt diese Ausnahme zurück und verlangt ein erneutes ausdrückliches Aktivieren.
- Der HTTP-Status muss exakt dem konfigurierten Code entsprechen. Ein fehlgeschlagener Verbindungsaufbau, Timeout
  oder anderer Status setzt den Zustand auf `down`. `unknown` bezeichnet ungeprüfte oder wegen eines
  Zertifikatsfehlers nicht prüfbare Hosts; deaktivierte Monitore und Hosts erscheinen als `paused`, ohne den letzten
  gespeicherten Check zu verfälschen.
- Die Proxy-Host-Tabelle zeigt den Monitorzustand in der Spalte „Dienstprüfung“ und unmittelbar daneben die
  eigenständige Spalte „Latenz“. Sie zeigt `response_ms` des letzten Checks in Millisekunden, auch wenn der Check
  fehlgeschlagen ist. Bei noch ausstehender Prüfung, deaktivierter Überwachung oder nicht verfügbaren Monitordaten
  erscheint „–“. Bei einem Timeout beschreibt der Wert die Dauer der fehlgeschlagenen Probe bis zum Abbruch und
  keine bestätigte Netzwerklatenz. Im Dialog „Host-Überwachung“ bleibt die Antwortzeit beim letzten Check und im
  Verlauf sichtbar.
- Die Konfiguration begrenzt Intervalle auf 15–3600 Sekunden und Timeouts auf 500–15000 Millisekunden; der Timeout
  muss kürzer als das Intervall sein. Manuelle Checks teilen sich die Begrenzung auf fünf Verbindungen und sind
  zusätzlich auf zehn Aufrufe je Minute und IP begrenzt.
- Pro Host bleiben höchstens 100 Check-Einträge und höchstens 30 Tage erhalten. Das Löschen des Hosts entfernt
  Einstellungen und Verlauf. Eine Änderung von Prüftyp, Pfad oder erwartetem Status beginnt eine neue Historie;
  ebenso ein geändertes `upstream_ca`, `upstream_server_name` oder `skip_certificate_verification`. Dabei wird auch
  der Alarmstatus zurückgesetzt.
  Die Änderung von Intervall, Timeout oder Benachrichtigung erhält bisherige Messungen.
- Ein täglicher Cleanup entfernt auch bei pausierten Monitoren Einträge nach 30 Tagen und beseitigt Konfigurationen,
  deren Proxy-Host inzwischen gelöscht wurde (höchstens 200 verwaiste Hosts pro Durchgang).
- Die erste erfolgreiche Messung erzeugt keinen Telegram-Alarm; ein erster Fehler und spätere Up-/Down-Wechsel
  werden an aktivierte Telegram-Integrationen desselben Besitzers gesendet. Zwischen Nachrichten für denselben
  Host liegen mindestens fünf Minuten. Ein währenddessen zurückgehaltener Wechsel wird bei einem späteren Check
  nach Ablauf der Wartezeit gesendet, sofern der neue Zustand dann noch gilt. Der Check-Verlauf bleibt lückenlos
  innerhalb der Aufbewahrungsgrenze. Ein Telegram-Fehler ändert das gespeicherte Messergebnis nicht. Die
  Klartextnachricht nennt Host-ID, falls vorhanden zugeordnete Domains, geprüftes Upstream-Ziel, Prüfart, Soll-
  und Ist-Status, Messdauer, Zeitlimit und UTC-Zeit. Sie unterscheidet HTTP-Statusabweichungen sowie bekannte DNS-,
  Netzwerk- und TLS-Fehlercodes. Bei einem Timeout nennt sie die zuletzt erreichte Phase: Namensauflösung,
  TCP-Verbindung, TLS-Handshake oder Warten auf HTTP-Antwortheader. Dazu schlägt sie einen Prüfschritt vor.
  Dies ist eine Beobachtung der Monitor-Probe, keine nachträglich ermittelte definitive Ursache: Eine langsame
  Antwort kann mehrere Gründe haben. Auffällige Geheimwerte in Pfadsegmenten werden für Telegram maskiert;
  CA-Daten, Rohtexte von Socket-Fehlern, Antwortinhalte und Authentifizierungsheader werden nicht versendet.
  Ein Genesungsalarm nennt den Befund der Prüfung beim ausgelösten DOWN-Alarm und, falls vorhanden, einen
  späteren letzten fehlgeschlagenen Check vor der Erholung jeweils mit UTC-Zeit. So werden Fehlerwechsel während der
  fünfminütigen Alarmsperre nicht dem ursprünglichen Alarm zugeschrieben. Falls die ursprüngliche Prüfung bereits
  aus dem begrenzten Verlauf entfernt wurde, wird nur der letzte Check ausdrücklich als solcher bezeichnet.
  Sind beide Einträge nicht mehr vorhanden, meldet die Nachricht, dass frühere Ausfallbefunde fehlen.
  Der Abstand zwischen DOWN- und UP-Nachricht belegt wegen der Alarmsperre keine durchgehende Ausfalldauer.
- Wenn sich das Upstream-Ziel des Hosts ändert, werden der letzte Status und alte Messergebnisse zurückgesetzt.
  Wechselt der Host dabei zu einem für den Prüftyp nicht unterstützten Ziel (etwa Datei oder Unix-Socket), wird
  der Monitor deaktiviert; der Scheduler erzeugt dadurch keine scheinbaren Ausfälle. Die Einstellungen bleiben
  erhalten und können nach einem Wechsel zurück zu einem geeigneten Netzwerkziel wieder aktiviert werden.
  Bei einem nicht unterstützten Ziel zeigt die Oberfläche den pausierten Zustand; die Einstellungen sind dort erst
  nach einem Wechsel zurück zu einem Netzwerkziel wieder bearbeitbar. Die API akzeptiert auch dann deaktivierte
  Einstellungen, damit bestehende Integrationen den Monitor ausschalten können.
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
