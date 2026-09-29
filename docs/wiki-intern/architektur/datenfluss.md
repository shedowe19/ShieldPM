# Datenfluss

## Zweck

Beschreibung des Datenflusses in ShieldPM — von der Benutzeraktion bis zur Nginx-Konfiguration.

## Request-Verarbeitung (Traffic)

```
Browser → Nginx (Frontend)
           ├── CrowdSec (Lua IPS) → Block/Allow, falls aktiviert
           ├── ModSecurity (WAF) → Block/Allow, falls aktiviert
           └── OpenAppSec (AI WAF) → Block/Allow, falls aktiviert
                    │
                    ▼
              ┌─────────────┐
              │   Anubis     │ (optional, PoW-Gate)
              │   OAuth2     │ (optional, SSO)
              └──────┬──────┘
                     ▼
              Nginx (Backend Proxy)
              proxy_pass → Upstream-Service
```

## Host-Konfiguration (CRUD)

```
1. Benutzer erstellt Host über Web-UI (React)
2. React sendet POST /api/nginx/proxy-hosts an Backend
3. Express-Route validiert Schema (AJV)
4. internal/proxy-host.js prüft Berechtigungen
5. Objection.js Model speichert in Datenbank
6. internal/nginx.js wird getriggert:
   a. Liest aktuelle Host-Daten aus DB
   b. Rendert LiquidJS-Vorlage (templates/proxy_host.conf)
   c. Schreibt .conf nach /data/nginx/proxy_host/X.conf
7. nginx -tq prüft die Gesamtkonfiguration; bei Fehler wird die vorherige Datei wiederhergestellt
8. Bei gültiger Konfiguration nginx -s reload (ohne globalen Debounce)
9. Audit-Log-Eintrag wird erstellt
```

## Datenbank-Zugriffsmuster

```
Route (Express) → Schema-Validierung (AJV)
                → internal/* (Business-Logik)
                → Model (Objection.js)
                → Knex (Query-Builder)
                → SQLite / MySQL / PostgreSQL
```

## Zertifikats-Erneuerung

1. Das Backend prüft beim Start und anschließend per Timer auslaufende Zertifikate. `CRT` konfiguriert das Intervall (Standardwert 23 Stunden), das Backend begrenzt es auf höchstens 12 Stunden.
2. `internal/certificate.js` prüft jedes verwaltete Let's-Encrypt-Zertifikat separat über Certbot und reicht seine explizite Profilwahl erneut weiter. Certbot entscheidet die Fälligkeit; Fehler bleiben je Zertifikat isoliert.
3. Nach erfolgreicher Erneuerung wird die Nginx-Konfiguration validiert und ein Reload signalisiert

## Wichtige Hinweise

- **Nginx-Validierung**: `internal/nginx.js` ruft vor dem Reload `nginx -tq` auf. Ungültige Hostkonfigurationen werden zurückgerollt und im Hoststatus protokolliert.
- **Serielle Änderungen**: Hostdateien und Zertifikatsaktivierung laufen unter einem gemeinsamen Konfigurations-Lock. Eine Sammelregeneration testet den gesamten Stapel einmal; der reguläre Reload hat keinen pauschalen Zwei-Sekunden-Debounce.
- **Boolean-Felder in SQLite**: Werden als `0`/`1` (Integer) gespeichert. Das Objection.js-Modell konvertiert automatisch.

## Verwandte Seiten

- [Architektur-Überblick](./ueberblick.md)
- [Nginx-Engine](../module/nginx-engine.md)
- [Datenmodell](../daten/datenmodell.md)
