# Hintergrundjobs und Timer

Status: active
Last verified: 2026-11-04
Confidence: high

## Zweck

Viele Funktionen von ShieldPM laufen ohne HTTP-Request: Zertifikatserneuerung,
Wartungsfenster, Host-Überwachung, IP-Ranges, DDNS, Git-Deploy, Sitzungsreinigung.
Diese Seite sammelt, was beim Start gestartet wird und was beim Herunterfahren
gestoppt werden muss.

## Wie es funktioniert

`backend/index.js` startet die Dienste in fester Reihenfolge (`backend/index.js:43-122`):

1. Datenbankmigration (`migrateFromSqliteToNewDb`, `migrateUp`)
2. Analytics initialisieren
3. Upload-Relay initialisieren
4. Setup (Initial-Admin aus Umgebungsvariablen, Standardobjekte)
5. OpenAPI-Schema kompilieren
6. Sitzungsreinigung als Timer
7. IP-Ranges: Timer und sofortiger Fetch nur, wenn `SKIP_IP_RANGES === "false"`;
   ohne gesetzte Variable wird übersprungen (`backend/index.js:41,53`)
8. Zertifikats-Timer
9. Wartungs-Timer
10. Nginx-Reload unter Konfigurationssperre
11. Firewall-Listen-Timer, Cloudflared, Tor, WireGuard, OAuth2-Proxy, Docker,
    GitOps, DDNS, Chat, Git-Deploy
12. HTTP-Server auf dem Unix-Socket; danach Instanzbackup-Commit,
    Störungszentrale, Traffic-Policy, Proxy-Host-Überwachung, Terminal-WebSocket

Beim `SIGTERM` werden Überwachung, Timer, Docker, Störungszentrale, Traffic-Policy,
Sitzungsreinigung, Analytics und Upload-Relay beendet (`backend/index.js:100-116`).

## Timer im Überblick

| Dienst             | Aufgabe                                               | Datei                                            |
| ------------------ | ----------------------------------------------------- | ------------------------------------------------ |
| Zertifikate        | Erneuerung prüfen, ACME ausstellen                    | `internal/certificate.js`, `internal/certbot.js` |
| Wartung            | geplante Wartungsfenster aktivieren                   | `internal/maintenance.js`                        |
| Proxy-Host-Monitor | HTTP(S)/TCP-Checks, Historie, Telegram-Alarm          | `internal/proxy-host-monitor.js`                 |
| Firewall-Listen    | HTTPS-URL-Quellen aktualisieren (nur `url`-Typ)       | `internal/firewall-list.js`                      |
| IP-Ranges          | Cloudflare-IP-Listen aktualisieren                    | `internal/ip_ranges.js`                          |
| DDNS               | dynamische DNS-Einträge aktualisieren                 | `internal/ddns.js`                               |
| Git-Deploy         | Host aus Git-Repository nachziehen                    | `internal/git-deploy.js`                         |
| Docker             | Container über Labels entdecken (2-Sekunden-Debounce) | `internal/docker.js:377-407`                     |
| Sitzungen          | abgelaufene Browser-Sitzungen löschen                 | `internal/auth-session-cleanup.js`               |
| Analytics          | Zugriffslogs auswerten                                | `internal/analytics.js`                          |

## Risiken und Stolperfallen

- **Startfehler:** Wirft `appStart()` einen Fehler, startet es nach 1 Sekunde neu
  (`backend/index.js:118-121`). Ein dauerhaft defekter Zustand erzeugt eine
  stille Neustartschleife.
- **Reihenfolge:** Analytics und Schema müssen vor den abhängigen Diensten fertig
  sein; die Reihenfolge ist bewusst und nicht beliebig.
- **Doppelte Timer:** Fast alle Timer räumen einen bestehenden `interval` vor dem
  Neustart ab oder brechen bei vorhandenem Timer ab. Ungeschützt ist
  `git-deploy` (`git-deploy.js:409`): ein zweites `init()` würde Intervalle
  stapeln.
- **Shutdown:** Ein neuer Timer ohne Eintrag im `SIGTERM`-Block verhindert ein
  sauberes Beenden.
- **Docker-Debounce:** Nur die Docker-Erkennung bündelt **ihre eigenen** Änderungen
  über 2 Sekunden; die Nginx-Engine selbst debounced nicht
  ([Widerspruch](../contradictions/2026-11-04-nginx-reload-debounce.md)).

## Offene Fragen

- Unklar: Ob der 1-Sekunden-Neustart bei fehlender Datenbankverbindung dauerhaft
  gewünscht ist oder einen Healthcheck verdecken soll. `confidence: low`.

## Verwandte Seiten

- [Architektur](./overview.md)
- [Nginx-Engine](./nginx-engine.md)
- [Laufzeit und Start](../infrastructure/runtime.md)
- [Wartung (Tiefe)](../reference/module/maintenance.md)
- [Proxy-Host-Überwachung (Tiefe)](../reference/module/proxy-host-monitor.md)
