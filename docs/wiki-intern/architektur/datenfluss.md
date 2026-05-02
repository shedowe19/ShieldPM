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
5. Objection.js Model speichert in Datenbank
6. internal/nginx.js wird getriggert:
   a. Liest aktuelle Host-Daten aus DB
   b. Rendert EJS-Template (templates/proxy_host.conf)
   c. Schreibt .conf nach /data/nginx/proxy_host/X.conf
7. nginx -s reload (debounced, 2s Verzögerung)
8. Audit-Log-Eintrag wird erstellt
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

- **Nginx-Validierung deaktiviert**: `nginx -t` wird vor dem Reload **nicht** ausgeführt. Template-Fehler können Nginx brechen.
- **Debounced Reload**: Schnelle aufeinanderfolgende Änderungen werden in einem einzigen Reload gebündelt.
- **Boolean-Felder in SQLite**: Werden als `0`/`1` (Integer) gespeichert. Das Objection.js-Modell konvertiert automatisch.

## Verwandte Seiten

- [Architektur-Überblick](./ueberblick.md)
- [Nginx-Engine](../module/nginx-engine.md)
- [Datenmodell](../daten/datenmodell.md)
