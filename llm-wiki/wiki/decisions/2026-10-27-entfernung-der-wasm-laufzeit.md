# Entfernung der Wasm/WASI-Ausführung

Status: active
Last verified: 2026-11-04
Confidence: high

## Zweck

Diese Entscheidung dokumentiert, warum die Wasm/WASI-Ausführung aus ShieldPM
entfernt wurde und welche Spuren das für Hosts, Migrationen und den Nginx-Build
hinterlässt.

## Kontext

ShieldPM experimentierte mit einer Laufzeit für Wasm/WASI-Anwendungen, die per
Proxy-Host ausgeliefert und gefiltert werden konnten. Die Funktion brachte
Kataloge, UI, API-Endpunkte und Nginx-Hooks mit.

Belege für den Ausbau:

- Commit `25c3b02c` — „Fix zero-certificate references and remove Wasm and WASI
  execution“
- Commit `03c9248a` und `71fb81d1` — ursprünglicher Einbau
- Migration `backend/migrations/20261027150000_remove_retired_host_runtime.js`
- `GEMINI.md:25` — „Retired runtime: Wasm/WASI execution, catalogs, UI, APIs and
  Nginx hooks were removed at the user's request.“
- `llm-wiki/wiki/reference/entwicklung/gitops-reference-and-runtime-removal-2026-10-27.md`

## Entscheidung

Die Wasm/WASI-Ausführung, ihre Kataloge sowie die zugehörige UI und API werden
entfernt. Das Upgrade entfernt nur zurückgezogene Host-Metadaten und
ShieldPM-eigene Laufzeitfragmente. Normales Lua-, Auth- und Cache-Verhalten bleibt
erhalten.

## Konsequenzen

- `proxy_host.meta` kann noch alte Schlüssel enthalten; die Migration räumt sie ab.
- Ein eigener Nginx-Build ohne das Modul und ohne Wasmtime gehört in das
  Repository `shieldpm-nginx`; hier bleibt nur die Anwendungsseite.
- Alte Referenzen in Dokumenten sind irreführend und dürfen nicht als aktueller
  Funktionsumfang gelesen werden.
- Tests, die die entfernte Laufzeit prüfen, sind gegenstandslos geworden
  (`backend/test/migrations/retired-host-runtime.spec.js` prüft heute das
  Entfernen).

## Offene Fragen

- Unklar: Ob es Installationen gibt, die die Laufzeit noch aktiv nutzen und vor dem
  Upgrade gewarnt werden müssen. `confidence: low`.

## Verwandte Seiten

- [Entscheidungen](./README.md)
- [Host-Lebenszyklus](../architecture/host-lifecycle.md)
- [Datenbank und Migrationen](../data/migrations.md)
- [Entfernungsbericht (Tiefe)](../reference/entwicklung/gitops-reference-and-runtime-removal-2026-10-27.md)
