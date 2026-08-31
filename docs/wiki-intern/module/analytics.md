# Analytics

## Zweck

Analytics verarbeitet Nginx-JSON-Access-Logs zu Detailzeilen und Zeit-/Host-Aggregationen. Die Durability-Grenze liegt
zwischen Logtailer, fsync-Spool und atomarer Datenbanktransaktion.

## Ingestion

1. Eine normalisierte Logzeile wird mit Sequenz/Checksumme als NDJSON angehängt und `fsync`-bestätigt.
2. Ein bounded Batch erhält stabile Batch-ID und Payload-Hash.
3. Detailzeilen, Aggregationen und `analytics_ingestion_batch` werden in derselben DB-Transaktion committed.
4. Ein verlorenes Commit-Ack wird über Ledger/Hash als bereits verarbeitet erkannt.
5. Erst danach schreitet der Spool-Checkpoint voran; Kompaktierung bewahrt alle noch replaybaren Sequenzen.

Spool- und Checkpointdateien müssen regulär, contained und ohne Mehrfach-Hardlink sein. Trunkierte Tail-Records werden
beim Replay ignoriert/repariert, valide vorangehende Records bleiben erhalten. Limits:

| Variable                           | Standard                                | Grenze                                       |
| ---------------------------------- | --------------------------------------- | -------------------------------------------- |
| `ANALYTICS_SPOOL_PATH`             | `/data/shieldpm/analytics-spool.ndjson` | normalisierter absoluter Pfad unter `/data/` |
| `ANALYTICS_SPOOL_MAX_BYTES`        | `67108864`                              | Gesamtkapazität                              |
| `ANALYTICS_SPOOL_RECORD_MAX_BYTES` | `262144`                                | Einzelrecord                                 |
| `ANALYTICS_SPOOL_BATCH_RECORDS`    | `250`                                   | Transaktionsbatch                            |

Ein voller Spool verwirft keine alten uncommitted Datensätze, sondern lehnt neue Ingestion begrenzt/geloggt ab.

## Zeit- und Tenant-Grenzen

API-Zeitfenster werden als vollständige ISO-8601-Werte mit Zeitzone validiert, geordnet und bounded. Owner-Visibility
wird vor Aggregation/Paging angewendet. Globale System-/DB-Metriken sind nur für Principals mit globaler Sichtbarkeit
erreichbar; Hostdaten bleiben auf sichtbare Proxy-Hosts begrenzt.

## Shutdown

`stop()` beendet zuerst Tail-Aufnahme/Timer, wartet dann auf alle pending Batches und schließt erst danach Spool und
Datenbankpfad. `backend/index.js` ruft diesen Drain bei `SIGTERM`/`SIGINT` vor Prozessende auf.

## Wichtige Dateien

- `backend/internal/analytics.js`
- `backend/lib/analytics-spool.js`
- `backend/models/analytic_count.js`
- `backend/models/analytics_logs.js`
- `backend/migrations/20260831231500_add_analytics_ingestion_ledger.js`
- `backend/routes/analytics.js`
- `frontend/src/pages/Analytics/`

## Verwandte Seiten

- [Datenbank](../daten/datenbank.md)
- [Umgebungsvariablen](../konfiguration/umgebungsvariablen.md)
- [Deployment](../entwicklung/deployment.md)
- [Security-Modernisierung](../entscheidungen/2026-08-31-security-modernisierung.md)
