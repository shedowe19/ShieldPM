# Traffic-Flow: Messgrenzen explizit halten

Status: active
Last verified: 2026-11-05
Confidence: high

## Zweck

Die Grenze zwischen belegten Abschlussbeobachtungen und aktuellen Kantenraten festhalten.

## Entscheidung

Die experimentelle Flow-Ansicht zeigt konfigurierte Topologie und kurzlebige
Beobachtungen abgeschlossener HTTP-Anfragen. Sie behauptet keine aktuelle
Kantenrate. `current_rates: false`, `null`-Werte und konstante Linienstärken
halten diese Grenze auch im API-Vertrag fest. Der API-Takt beträgt fünf Sekunden.

## Begründung

Access-Logs entstehen beim Abschluss einer Anfrage. Die isolierte Messprüfung
mit ShieldPM Nginx 1.31.6 empfängt bereits Antwortdaten, während 1,2 Sekunden
lang noch kein Log- oder UDP-Eintrag existiert. Erst nach Abschluss werden
131.072 Body-Bytes sichtbar. Systemweite Netzwerkzähler können keine einzelne
Host- oder Upstream-Kante belegen. Ein Lua-Bodyfilter wäre ebenfalls kein
vollständiger Nachweis für Wire-Bytes, Uploads und WebSockets.

## Folgen

Der Vorschau fehlen echte Raten, Glättung und eine Rate-zu-Linienstärke-Skala.
Das ist eine offene Produktanforderung, kein erfolgreich erfülltes Live-Messziel.
Eine spätere Implementierung braucht getrennt validierte Nginx-Instrumentation
und Tests für laufende Transfers, Multiplexing und Retries. Die bestehende
Nginx-Binärbasis liegt im separaten Repository. Es werden keine Systemzähler
oder Endlog-Bytes als Ersatzraten verwendet.

## Verwandte Seiten

- [Messprüfung](../../../scripts/benchmarks/traffic-flow-measurement.mjs)
- [Analytics-Modul](../reference/module/analytics.md#experimenteller-traffic-flow)
- [Aktivierung und Rückweg](../../../docs/wiki/Analytics.md#live-traffic-flow-experimental)
