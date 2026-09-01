# Datenfluss

## Zweck

Beschreibung des Datenflusses in ShieldPM — von der Benutzeraktion bis zur Nginx-Konfiguration.

## Request-Verarbeitung (Traffic)

```
Browser → Nginx (Frontend)
           ├── CrowdSec (Lua IPS) → Block/Allow
           ├── ModSecurity (WAF) → Block/Allow
           └── OpenAppSec (AI WAF) → Block/Allow
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
5. Service startet DB-Transaktion und registriert Runtime-Compensation
6. internal/nginx.js wird getriggert:
   a. Liest aktuelle Host-Daten aus DB
   b. Rendert EJS-Template (templates/proxy_host.conf)
   c. Rendert vollständigen Kandidaten in Staging
   d. Führt nginx -t gegen den Kandidaten aus
7. Bei Erfolg: atomare Aktivierung + Reload + DB-Commit
8. Bei Fehler: Runtime- und DB-Rollback
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

```
1. Cron-Job (alle CRT Stunden, Standard: 23)
2. internal/certbot.js prüft ablaufende Zertifikate
3. certbot renew wird ausgeführt
4. Bei Erfolg: nginx -s reload
```

## Wichtige Hinweise

- **Nginx-Validierung**: Jeder vollständige Kandidat wird vor Aktivierung mit `nginx -t` geprüft.
- **Compensation**: DB und generierte Dateien bilden eine gemeinsame Operation; Teilfehler stellen den letzten gültigen Zustand her.
- **Boolean-Felder in SQLite**: Werden als `0`/`1` (Integer) gespeichert. Das Objection.js-Modell konvertiert automatisch.

## Verwandte Seiten

- [Architektur-Überblick](./ueberblick.md)
- [Nginx-Engine](../module/nginx-engine.md)
- [Datenmodell](../daten/datenmodell.md)
