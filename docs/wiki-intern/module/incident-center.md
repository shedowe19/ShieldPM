# Incident-Center

## Zweck

Das Incident-Center verbindet dauerhafte Ausfälle von Proxy-Host-Monitoren mit täglichen Verfügbarkeitswerten,
einem Latenzverlauf und nachvollziehbarer Zustellung an Webhook-, ntfy- und Discord-Kanäle.
Es ergänzt die bestehende begrenzte Check-Historie und Telegram-Integration.

## Wichtige Dateien

- `backend/internal/incidents.js`: Vorfälle, Aggregate, Alarm-Stummschaltung und Zustellungsworker.
- `backend/models/monitor_incident.js`: Modelle der sieben zusätzlichen Tabellen.
- `backend/migrations/20261017190300_incident_center.js`: Datenbankstruktur und Indizes.
- `backend/lib/notification-http.js`: begrenzte HTTPS-Zustellung mit geprüften und gepinnten DNS-Adressen.
- `backend/routes/incidents.js`: authentifizierte API unter `/api/incidents`.
- `backend/internal/proxy-host-monitor.js`: transaktionale Anbindung akzeptierter Checks.
- `frontend/src/pages/Incidents/index.tsx`: vollständige Bedienoberfläche unter `/incidents`.
- `frontend/src/hooks/useIncidents.ts` und `frontend/src/api/backend/incidents.ts`: Abfragen und Mutationen.

## Persistenz und Zustandsübergänge

Ein akzeptierter Check schreibt innerhalb derselben Datenbanktransaktion den bisherigen Monitorstatus,
den Check, dessen Bereinigung sowie Incident, Beobachtung, tägliches Aggregat, Latenzminute und gegebenenfalls
Zustellungsauftrag. Ein Fehler in einem dieser Writes rollt die gesamte Messung zurück. Veraltete oder
abgebrochene Probes erzeugen keine Incident-Daten. Externe Zustellung findet erst nach dem Commit statt.

Der erste `down`-Check eröffnet einen Vorfall. Weitere `down`-Checks erhöhen dessen Fehlerzähler;
`unknown` schließt ihn nicht. Ein späterer `up`-Check schließt ihn als `recovered`. Änderungen der Messung
oder eine Monitoring-Pause schließen einen offenen Vorfall ausdrücklich als `monitor_changed`, ohne eine
Wiederherstellung des Dienstes zu behaupten. Die historischen Aggregate bleiben erhalten. Die erfolgreiche
Löschung eines Hosts entfernt dessen private Incident-, Aggregat-, Mute- und Zustellungsdaten.

`monitor_observation` hält die letzte akzeptierte Messung. Ein bekannter Zustand gilt für die Aggregation
höchstens bis zum nächsten Check oder für ein konfiguriertes Prüfintervall. Längere Lücken, Pausen und Zeit
vor der ersten Messung bleiben unbekannt. Intervalle werden an UTC-Tagesgrenzen aufgeteilt. Tageswerte
berechnen `uptime_percent` ausschließlich aus bekanntem Up-/Down-Anteil; ohne bekannte Zeit ist der Wert
`null`. `coverage_percent` und `unknown_ms` bleiben daneben sichtbar. Es handelt sich um eine Schätzung
zwischen Messungen, nicht um eine kontinuierliche Messung der Erreichbarkeit.

Erfolgreiche Checks erzeugen je UTC-Minute Anzahl, Mittelwert, Minimum und Maximum der Latenz. Der Plot
zeigt die letzten 24 Stunden und verbindet Lücken nicht. Die Stunden-/Tagesabfrage liest weder die
100er-Check-Historie noch zählt sie fehlende Checks als Erfolg. Tägliche Aggregate bleiben 366 Tage,
Latenzminuten sieben Tage, abgeschlossene Vorfälle und Zustellungsverlauf 366 Tage erhalten. Offene Vorfälle
werden nicht durch die zeitliche Bereinigung geschlossen. Der Worker bereinigt höchstens stündlich.

## Alarm-Stummschaltung

Pro Host kann ein Zeitfenster mit Start, Ende und Begründung hinterlegt oder gelöscht werden. Die Oberfläche
verwendet lokale Browserzeiten; die API speichert ISO-Zeitpunkte mit Zeitzone. Das Fenster ist am Beginn
einschließlich und am Ende ausschließlich aktiv. Es darf höchstens 366 Tage umfassen.

Diese Funktion ändert weder die Wartungsseite noch Nginx-Listener oder die Ausführung der Checks.
Vorfälle und Aggregate entstehen weiter. Neue Kanalaufträge werden als `muted` gespeichert. Der Worker
prüft vor einem späteren Zustellungsversuch erneut das aktuelle Fenster; auch bereits wartende Retries
können deshalb stummgeschaltet werden. Telegram-Statusalarme beachten dasselbe Fenster. Die bisherigen
Telegram-Alarmzustände werden währenddessen nicht verbraucht, sodass ein nach Ende weiterhin erkannter
Ausfall wieder angekündigt werden kann. Stummgeschaltete Kanalaufträge werden nicht automatisch nachträglich
verschickt; ein berechtigter Benutzer kann sie im Zustellungsverlauf ausdrücklich erneut anstoßen.

## Kanäle und Zustellung

Ein Kanal gehört ausschließlich seinem Benutzer. Ein leeres `host_ids` abonniert alle eigenen Hosts;
explizite IDs dürfen ebenfalls nur eigene Hosts benennen. Ein Kanal wird nur für Monitoren mit
`alert_enabled` verwendet. Bestehende Telegram-Konfigurationen bleiben ein eigenständiger Zustellungsweg.

Endpoint-URL und optionaler Bearer-Token werden gemeinsam mit dem persistenten Instanzschlüssel verschlüsselt.
Listen-/Schreibantworten enthalten nur `has_credentials`, niemals URL oder Token. Leere beziehungsweise
ausgelassene URLs erhalten den vorhandenen Endpoint bei unverändertem Kanaltyp; ein ausgelassener Token
bleibt erhalten, ein explizit leerer Token entfernt ihn. Änderungen verwenden eine Versionsnummer und
weisen veraltete Entwürfe ab. Ein Typwechsel benötigt einen neuen Endpoint.

Die Zustellung verwendet öffentliche HTTPS-URLs nach derselben Adressrichtlinie wie Firewall-Feeds:
keine URL-Benutzerinfo oder Fragmente, keine privaten oder reservierten Adressen und keine gemischten
öffentlichen/privaten DNS-Antworten. Die aufgelösten Adressen werden an den Socket gebunden; TLS-SNI,
Zertifikatsprüfung und Host-Header bleiben an die eigentliche Gegenstelle gebunden. Redirects werden nicht
verfolgt. Ein gemeinsames Zehn-Sekunden-Limit umfasst DNS und Anfrage. Private interne ntfy-Endpoints werden
von dieser Richtlinie nicht freigegeben.

- Webhook: JSON mit Ereignis, Incident-/Host-ID, Zustand, begrenztem Befund und Prüfzeitpunkt.
- ntfy: Klartext an den konfigurierten Topic-Endpoint; optional Bearer-Authentifizierung.
- Discord: gültiger `discord.com`-Webhook, Klartextinhalt und deaktivierte automatische Erwähnungen.

Der Worker beansprucht Aufträge transaktional und verarbeitet höchstens zwei gleichzeitig, maximal 20 pro
Tick. Er prüft aktuell gespeicherte Zugangsdaten, aktivierten Kanal, Host-Existenz, Eigentümer und Abonnement
vor dem Versand erneut. Fehler führen zu höchstens fünf Versuchen mit exponentiellem Abstand von 30 Sekunden
bis zu einer Stunde. Ein über fünf Minuten unterbrochener `sending`-Auftrag wird wieder übernommen.
Die Zustände `pending`, `sending`, `sent`, `failed`, `muted` und `cancelled` sind im UI sichtbar.
Öffentliche Fehlertexte enthalten weder Remote-Antwortkörper noch URLs, Token oder Transportdiagnosen.

Zustellung ist mindestens einmal: Ein Prozessabbruch zwischen erfolgreicher HTTP-Annahme und Speicherung
kann einen erneuten Versand auslösen. Der Header `Idempotency-Key: shieldpm-delivery-<ID>` erlaubt Empfängern
die Deduplizierung. Ein expliziter Retry setzt den Versuchszähler zurück; bereits versendete oder aktuell
laufende Aufträge werden nicht erneut gestartet.

## Berechtigungen und API

Hostbezogene Abfragen verwenden `proxy_hosts:get`, Auflistungen `proxy_hosts:list` und Änderungen
`proxy_hosts:update`, jeweils mit bestehendem Owner-Scope. Kanäle und ihr Zustellungsverlauf bleiben auch
bei globaler Host-Sichtbarkeit ausschließlich dem jeweiligen Besitzer zugänglich. Im Demo-Modus sind
alle Mutationen gesperrt.

| API unter `/api/incidents`       | Verhalten                                                                         |
| -------------------------------- | --------------------------------------------------------------------------------- |
| `GET /hosts`                     | Hostauswahl, maximal 2000 sichtbare Hosts, ohne Zugangsdaten                      |
| `GET /?host_id=&status=&before=` | Letzte 100 berechtigte Vorfälle, Cursor für ältere Einträge                       |
| `GET /hosts/:id?days=30`         | 1–365 Tage Verfügbarkeit, letzte 24 Stunden Latenz, aktuelle Beobachtung und Mute |
| `PUT /hosts/:id/mute`            | Fenster setzen; `{ "clear": true }` entfernt es                                   |
| `GET/POST /targets`              | Eigene Kanäle lesen/anlegen, maximal 100                                          |
| `PUT/DELETE /targets/:id`        | Versionsgeprüft ändern beziehungsweise Kanal und dessen Verlauf löschen           |
| `GET /deliveries`                | Letzte 100 eigene Zustellungsaufträge                                             |
| `POST /deliveries/:id/retry`     | Erneuter berechtigter Zustellungsversuch                                          |

## Validierung

`incident-center.spec.js` verwendet echte SQLite-Migrationen und Modelle sowie einen lokalen HTTP-Upstream.
Geprüft werden lange Vorfälle, Unknown-Lücken, UTC-Tageswechsel, Erhalt nach 105 Checks, transaktionales
Rollback, persistente Outbox, Retries, Stummschaltung und Eigentümer-/Secret-Grenzen.
`notification-http.spec.js` kontrolliert DNS und HTTPS-Grenzen einschließlich Pinning, Redirects,
privater Ziele, Discord-/ntfy-Payloads und Abbruch während DNS.
`pages/Incidents/index.test.tsx` prüft Kanalbearbeitung mit unveränderten Secrets, konkrete Retry-Aktionen,
Mutes mit Zeitzone und unverändertem Entwurf während Polling sowie getrennte Plot-Segmente für Lücken.
Externe Anbieterzugänge und produktive Telegram-/Discord-/ntfy-Zustellungen sind keine lokalen Testvoraussetzungen.

## Verwandte Seiten

- [Proxy-Host-Monitor](./proxy-host-monitor.md)
- [Wartungsmodus](./maintenance.md)
- [ChatOps](./chatops.md)
- [Secrets und Sicherheit](../konfiguration/secrets-und-sicherheit.md)
- [Tests](../entwicklung/tests.md)
