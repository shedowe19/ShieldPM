# WASM Edge Filters (ngx_wasm_module)

## Zweck

Dieses Feature ermöglicht die Nutzung von in WebAssembly (WASM) kompilierten Erweiterungen direkt in Nginx (über das `ngx_wasm_module`). Es erlaubt extrem performante Custom-Logik (z.B. in Rust oder Go geschrieben) wie spezielle Authentifizierung, Bild-Manipulation oder Payload-Validierung, ohne Nginx neu kompilieren zu müssen.

## Kontext

Das Feature ist als separates Eingabefeld im "Advanced"-Tab des Proxy-Host-Modals verfügbar. Administratoren können spezifische WASM-Direktiven eintragen, die bei der Nginx-Konfigurationsgenerierung direkt in den jeweiligen Host-Block integriert werden.

## Wichtige Dateien

- `backend/migrations/20260511225041_add_wasm_config.js`: Erstellt die `wasm_config`-Spalte in der `proxy_host`-Tabelle.
- `backend/models/proxy_host.js`: Fügt das Feld `wasm_config` zum Objection.js-Modell hinzu.
- `backend/schema/components/proxy-host-object.json`: OpenAPI/JSON-Schema für Proxy-Hosts.
- `backend/templates/_proxy_logic.conf`, `backend/templates/proxy_host.conf`, `backend/templates/_proxy_host_custom_location.conf`: Integrieren den `{{ wasm_config }}` Liquid-Tag ins Nginx-Template.
- `frontend/src/components/Form/WasmConfigField.tsx`: Die React-Komponente für das Code-Editor-Feld in der Oberfläche.
- `frontend/src/modals/ProxyHostModal.tsx`: Integriert das Formularfeld in die Benutzeroberfläche.
- `frontend/src/api/backend/models.ts` & `frontend/src/hooks/useProxyHost.ts`: Erweitern das Frontend-Modell und den Standard-Zustand.

## Verhalten

1. Ein Administrator öffnet die Bearbeitungsansicht eines Proxy-Hosts.
2. Im Tab "Advanced" ist ein neues Feld "WASM Edge Filters (ngx_wasm_module)" verfügbar.
3. Eingegebener Nginx-Code für WASM (z.B. `wasm_call 'my_plugin' 'hello_world';`) wird im Feld `wasm_config` in der Tabelle `proxy_host` gespeichert.
4. Beim Neu-Generieren der Nginx-Konfiguration wird dieser Wert direkt nach dem `advanced_config`-Block in die `*.conf` Datei eingesetzt.

## Abhängigkeiten

- Das Nginx-System muss mit dem `ngx_wasm_module` kompiliert/ausgestattet sein (bereits vorhanden).
- Die referenzierten `.wasm` Dateien müssen im Dateisystem für Nginx zugänglich sein.

## Verwandte Seiten

- [Proxy-Host](./proxy-host.md)
- [Nginx-Templates](./nginx-templates.md)
- [Datenbank-Migrationen](../daten/migrationen.md)
