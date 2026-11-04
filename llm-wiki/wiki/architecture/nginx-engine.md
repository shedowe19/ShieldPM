# Nginx-Konfigurationsengine

Status: active
Last verified: 2026-11-04
Confidence: high

## Zweck

`backend/internal/nginx.js` ist die zentrale Stelle, die aus Datenbankzustand
Nginx-Konfigurationsdateien macht, sie validiert und den Reload auslöst. Wer
Host-Verhalten ändert, ändert fast immer diese Datei oder die Templates.

## Was existiert

- Engine: `backend/internal/nginx.js` (741 Zeilen)
- Templates: `backend/templates/*.conf` (18 Vorlagen plus `ip-blocked.html`)
- Renderer: LiquidJS-Instanz aus `backend/lib/utils.js`
- Vorschau: `backend/internal/proxy-host-preview.js` und `backend/lib/nginx-preview.js`

## Wie es funktioniert

1. **Konfigurieren:** `configure(model, host_type, host, options)` ist der Einstieg
   für einen einzelnen Host und ruft `configureHost` auf (`nginx.js:68-69`).
   Massenänderungen laufen getrennt über `bulkGenerateConfigs` und
   `bulkGenerateConfigGroups` (`nginx.js:623-633`).
2. **Sperre:** `withConfigurationLock(callback)` serialisiert alle Schreibvorgänge
   über einen asynchronen Kontext (`nginx.js:77`). `reload()` erkennt, ob bereits
   ein Lock aktiv ist, und sperrt sonst selbst (`nginx.js:228-232`).
3. **Rendern:** `renderConfig(host_type, host_row)` wertet die passende Vorlage aus
   (`nginx.js:350-486`); `renderLocations()` mischt pro Location Access-List,
   Zertifikat und SSL/HSTS-Flags hinein (`nginx.js:293-341`).
4. **Schreiben:** Zielpfad ist `/data/nginx/<file-friendly-host-type>/<id>.conf`,
   die Default-Konfiguration liegt unter `/data/nginx/default.conf`
   (`nginx.js:281-285`).
5. **Validieren:** `test()` ruft `nginx -tq` auf und prüft zusätzlich die
   konfigurierten Firewall-Lookups (`nginx.js:217-223`).
6. **Aktivieren:** `_reloadCommands()` sammelt optionale OCSP-Aktualisierungen und
   den eigentlichen Reload (`nginx.js:237`).
7. **Zurückrollen:** `rollbackStagedConfig()` stellt bei Fehlern die vorherige
   Datei wieder her (`nginx.js:205`).

## Interfaces und Daten

| Funktion                                              | Zweck                                                            |
| ----------------------------------------------------- | ---------------------------------------------------------------- |
| `configure`                                           | Einstieg für Host-Änderungen                                     |
| `configureHost`                                       | Staged Write mit Backup und Commit                               |
| `commitStagedConfig` / `rollbackStagedConfig`         | Zwei-Phasen-Abschluss                                            |
| `bulkGenerateConfigs` / `bulkGenerateConfigGroups`    | Massenänderungen                                                 |
| `deleteConfig`, `renameConfigAsError`                 | Entfernen bzw. Deaktivieren                                      |
| `backupConfig`, `restoreConfig`, `deleteBackupConfig` | Dateisicherung                                                   |
| `advancedConfigHasDefaultLocation`                    | Lexer-Prüfung auf eine Top-Level-`location /`                    |
| `getLogs`                                             | Liest `error.log`, `access.log`, `json_access.log`, `stream.log` |

Datenpfade: `/data/nginx/...`, Zertifikate unter `/data/tls/certbot/live` und
`/data/tls/custom` (`nginx.js:245-262`). Interne Zertifikate liegen unter
`/data/tls/internal` (`internal/certificate.js:276`, `internal/pki.js:9`).

## Risiken und Stolperfallen

- **Nie direkt** `nginx -s reload` aufrufen; immer `internalNginx.reload()`.
- **Bulk-Operationen** schreiben mit `skip_reload`; der Aufrufer entscheidet, ob
  die Gruppe am Ende einen einzigen validierten Reload auslöst
  (`nginx.js:632-650`).
- Die In-Process-Sperre (`configurationQueue` + `AsyncLocalStorage`) schützt nur
  diesen Node-Prozess. Ein zweiter Prozess, der dieselben Dateien schreibt, ist
  nicht abgesichert.
- `advancedConfigHasDefaultLocation` ist ein Lexer, kein Regex: Quoted Arguments
  und Kommentare dürfen die Erkennung nicht täuschen. Änderungen an dieser
  Funktion brauchen Tests.
- Der Reload prüft die _gesamte_ Konfiguration. Ein kaputter fremder Host blockiert
  damit auch eine an sich korrekte Änderung; das Backup-Verhalten ist die Rettung.
- Zur Abgrenzung „Engine serialisiert“ gegen „`.cursorrules` behauptet Debounce“:
  [Widerspruch](../contradictions/2026-11-04-nginx-reload-debounce.md).

## Offene Fragen

- `DATA_PATH` wirkt in `nginx.js` nur auf `getLogs` (`nginx.js:722`); die
  Vhost-Pfade sind fest `/data/nginx/...` (`nginx.js:281-285`). Ob native
  Installationen den Wert offiziell setzen dürfen, ist eine Policy-Frage
  ([Offene Fragen](../questions/open-questions.md)).

## Verwandte Seiten

- [Architektur](./overview.md)
- [Host-Lebenszyklus](./host-lifecycle.md)
- [Hintergrundjobs](./background-jobs.md)
- [Nginx-Engine (Tiefe)](../reference/module/nginx-engine.md)
- [Nginx-Templates (Tiefe)](../reference/module/nginx-templates.md)
- [Proxy-Host (Tiefe)](../reference/module/proxy-host.md)
