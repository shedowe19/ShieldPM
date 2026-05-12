# WASM Edge Filters (ngx_wasm_module)

## Zweck

Dieses Feature ermöglicht die Nutzung von in WebAssembly (WASM) kompilierten Erweiterungen direkt in Nginx (über das `ngx_wasm_module`). Es erlaubt Entwicklern und Administratoren, hochperformante Custom-Logik (z.B. in Rust oder Go geschrieben) wie spezielle WAF-Filter (z.B. Coraza WAF), Bild-Manipulation oder Payload-Validierung zentral hochzuladen und einfach per Dropdown in den jeweiligen Proxy-Hosts zu aktivieren, ohne Nginx neu kompilieren zu müssen.

## Kontext

Das Feature bietet eine **globale WASM-Modul-Verwaltung**. Administratoren laden `.wasm` Dateien hoch und benennen sie. Diese Dateien werden auf dem Server unter `/data/wasm/` gespeichert. Anschließend kann im "Advanced"-Tab des Proxy-Host-Modals ein WASM-Modul aus einer Liste ausgewählt werden. Zusätzlich können modulspezifische Nginx-Direktiven (z.B. `wasm_call`) übergegeben werden.

## Wichtige Dateien

- `backend/migrations/20260511233200_add_wasm_module.js`: Erstellt die `wasm_module`-Tabelle und ergänzt `proxy_host` um `wasm_module_id` und `wasm_config`.
- `backend/models/wasm_module.js`: Objection.js-Modell für WASM-Module.
- `backend/internal/wasm-module.js` & `backend/routes/nginx/wasm_modules.js`: Backend-Logik für Datei-Upload (`multer`), CRUD-Operationen und API-Routen (`/api/nginx/wasm-modules`).
- `backend/schema/components/wasm-module-object.json`: OpenAPI/JSON-Schema für WASM-Module.
- `backend/templates/_proxy_logic.conf`, `backend/templates/proxy_host.conf`, `backend/templates/_proxy_host_custom_location.conf`: Integrieren `wasm_module` Direktiven.
- `frontend/src/pages/Nginx/WasmModules/`: Übersichtsseite für alle hochgeladenen WASM-Module.
- `frontend/src/modals/WasmModuleModal.tsx`: Formular für das Hochladen von `.wasm` Dateien.
- `frontend/src/components/Form/WasmModuleSelect.tsx`: Dropdown-Feld zur Modul-Auswahl in der Proxy-Host Konfiguration.
- `frontend/src/api/backend/models.ts` & `frontend/src/hooks/useWasmModule(s).ts`: Typen und React-Query Hooks für das Frontend.

## Verhalten

1. Ein Administrator navigiert im Hauptmenü zu "WASM Modules" und lädt eine `.wasm` Datei hoch. Die Datei wird intern im `WASM_PATH` (`/data/wasm/`) mit einer UUID gespeichert.
2. Der Administrator öffnet die Bearbeitungsansicht eines Proxy-Hosts. Im Tab "Advanced" wählt er aus dem Dropdown das gewünschte WASM-Modul aus. Optional trägt er Parameter/Direktiven in das "WASM Module Arguments" Textfeld ein (z.B. `wasm_call 'my_plugin' 'hello_world';`).
3. Diese Konfiguration wird in der `proxy_host`-Tabelle (`wasm_module_id`, `wasm_config`) gespeichert.
4. Beim Neu-Generieren der Nginx-Konfiguration wird der `wasm_module "/data/wasm/<uuid>.wasm";` Block zusammen mit den Argumenten in die Server-Blöcke (`proxy_host.conf`) bzw. Location-Blöcke integriert.

## Abhängigkeiten

- Das Nginx-System muss mit dem `ngx_wasm_module` kompiliert/ausgestattet sein (bereits vorhanden).
- Die Referenzen verweisen auf das `WASM_PATH` Verzeichnis, das vom Node.js Backend beschreibbar sein muss und von Nginx lesbar. (Typischerweise `/data/wasm/` im Container).

## Verwandte Seiten

- [Proxy-Host](./proxy-host.md)
- [Nginx-Templates](./nginx-templates.md)
- [Datenbank-Migrationen](../daten/migrationen.md)
