# WASM Edge Filters

## Zweck

Das WASM-Modul ermöglicht es Benutzern, WebAssembly-Binärdateien (kompiliert aus Rust oder Go) hochzuladen und als Edge Filters auf Proxy Hosts auszuführen. Dies erlaubt benutzerdefinierte Request-Verarbeitungslogik (z.B. spezielle Authentifizierung, Payload-Validierung, Header-Manipulation) ohne Nginx neu kompilieren zu müssen.

## Kontext

- Benötigt das Nginx-Modul `ngx_wasm_module` im Base Image (`shieldpm-nginx`).
- WASM-Dateien werden unter `/data/wasm/{id}.wasm` persistent gespeichert.
- Pro Proxy Host kann genau ein WASM-Modul zugeordnet werden (`wasm_module_id`).

## Wichtige Dateien

### Backend

| Datei | Zweck |
|---|---|
| `backend/models/wasm_module.js` | Objection.js Model mit Relationen zu `User` und `ProxyHost` |
| `backend/internal/wasm_module.js` | CRUD-Service mit Datei-Handling und Nginx-Reload |
| `backend/routes/nginx/wasm_modules.js` | REST-API Endpunkte (GET, POST mit `multer`, PUT, DELETE) |
| `backend/migrations/20260511013400_add_wasm_modules.js` | Erstellt `wasm_module`-Tabelle |
| `backend/migrations/20260511013500_add_wasm_to_proxy_host.js` | Fügt `wasm_module_id` FK zu `proxy_host` hinzu |
| `backend/templates/wasm_modules.conf` | EJS/Nunjucks Template für globale `wasm_core {}` Konfiguration |
| `backend/templates/proxy_host.conf` | Enthält `proxy_wasm module_{id}` Direktive |

### Frontend

| Datei | Zweck |
|---|---|
| `frontend/src/api/backend/wasmModules.ts` | API-Kommunikation (FormData Upload, REST) |
| `frontend/src/hooks/useWasmModules.ts` | React Query Hooks (CRUD Mutations) |
| `frontend/src/pages/Nginx/WasmModules/` | Tabelle, TableWrapper, Index-Seite |
| `frontend/src/modals/WasmModuleModal.tsx` | Create/Edit Dialog |

## Verhalten

### Upload-Flow

1. Benutzer öffnet `/nginx/wasm-modules` und klickt "Add"
2. `WasmModuleModal` zeigt Name, Beschreibung und Datei-Upload
3. Frontend sendet `POST /api/nginx/wasm-modules` als `multipart/form-data` (Feld: `wasm_file`)
4. Backend speichert Metadaten in DB und Binary unter `/data/wasm/{id}.wasm`
5. `nginx.js.generateWasmModulesConfig()` regeneriert `/data/nginx/custom/wasm_modules.conf`
6. Nginx Reload wird ausgelöst

### Proxy Host Zuordnung

1. Benutzer bearbeitet einen Proxy Host → Advanced Tab
2. Dropdown "WASM Edge Filter" zeigt alle verfügbaren Module
3. Auswahl setzt `wasm_module_id` im Proxy-Host-Datensatz
4. Bei Nginx-Config-Generierung wird `proxy_wasm module_{id};` in den `location /` Block eingefügt

### Löschung

1. Beim Löschen eines Moduls werden alle referenzierenden Proxy Hosts auf `wasm_module_id = 0` zurückgesetzt
2. Die Nginx-Configs dieser Hosts werden neu generiert
3. Die WASM-Datei wird von der Festplatte gelöscht
4. Die globale `wasm_modules.conf` wird neu generiert

## API-Endpunkte

| Methode | Pfad | Beschreibung |
|---|---|---|
| `GET` | `/api/nginx/wasm-modules` | Alle Module auflisten |
| `POST` | `/api/nginx/wasm-modules` | Neues Modul erstellen (multipart) |
| `GET` | `/api/nginx/wasm-modules/:id` | Einzelnes Modul abrufen |
| `PUT` | `/api/nginx/wasm-modules/:id` | Modul-Metadaten aktualisieren |
| `DELETE` | `/api/nginx/wasm-modules/:id` | Modul löschen |

## Datenmodell

### Tabelle `wasm_module`

| Spalte | Typ | Beschreibung |
|---|---|---|
| `id` | `INTEGER` | Primärschlüssel (auto-increment) |
| `created_on` | `STRING` | Erstellt am |
| `modified_on` | `STRING` | Geändert am |
| `owner_user_id` | `INTEGER` | Besitzer (FK auf `user`) |
| `name` | `STRING` | Modulname |
| `description` | `STRING` | Optionale Beschreibung |
| `file_name` | `STRING` | Originaler Dateiname |
| `meta` | `JSON` | Zusätzliche Metadaten |
| `is_deleted` | `INTEGER` | Soft-Delete Flag (0/1) |

### Relation auf `proxy_host`

- `proxy_host.wasm_module_id` → `wasm_module.id` (Optional, Default 0 = kein Modul)

## Abhängigkeiten

- `ngx_wasm_module` muss im Nginx-Binary kompiliert sein (Repository `shieldpm-nginx`)
- `multer` (bereits im Backend vorhanden) für Datei-Upload
- Persistenter Speicher unter `/data/wasm/` (Docker Volume)

## Offene Fragen

- TODO: Validierung der WASM-Binärdateien (Magic Bytes prüfen: `\0asm`)
- TODO: Maximale Dateigröße konfigurierbar machen
- TODO: WASM-Modul-Konfigurationsparameter pro Proxy Host (derzeit nur Module ID, keine Parameter)
- TODO: Datei-Re-Upload bei Update (derzeit nur Metadaten-Update möglich)

## Verwandte Seiten

- [Proxy Host](./proxy-host.md)
- [Nginx Engine](./nginx-engine.md)
- [Nginx Templates](./nginx-templates.md)
- [Architektur Überblick](../architektur/ueberblick.md)
