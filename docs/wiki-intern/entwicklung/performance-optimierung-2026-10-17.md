# Messbare Performance-Optimierungen vom 17. Oktober 2026

## Zweck

Drei begrenzte Optimierungen reduzieren unnötige Statusabfragen, Monitor-Historienarbeit und das Laden der
Nginx-Rendergraphen. Umfang und Bedienung der bestehenden Funktionen bleiben erhalten. Grundlage ist
`develop` bei `32a3a9d5dde3182dfc10d3700366d531a7462fa3`.

## Umsetzung und Korrektheit

### Statusspalten

Die Host-Tabelle übergibt keine Monitor-IDs, wenn Dienstprüfung und Latenz beide ausgeblendet sind. Die zugehörige
Statusabfrage bleibt dann deaktiviert. Ein erneutes Einblenden fordert auch innerhalb des globalen Cache-Fensters
aktuelle Daten an. React Query reicht sein AbortSignal bis zum Fetch weiter; ein weiterer aktiver Verbraucher
derselben Abfrage verhindert deren Abbruch. Der Überwachungsdialog und der Backend-Scheduler bleiben unabhängig.

Ein identischer gemounteter Table/QueryClient/Fetch-Test gegen den tatsächlichen Ausgangs- und Änderungsstand
zählt bei beiden ausgeblendeten Spalten über 90 simulierte Sekunden **vor der Änderung 4 und danach 0 Requests**.
Sichtbare Spalten behalten vier Requests. Fokus, Reconnect, Invalidierung, frischer Cache,
laufende Requests und gemeinsam genutzte Abfragen sind zusätzlich abgesichert.

### Monitorhistorie

Die Bereinigung liest mit `LIMIT 1 OFFSET 99` nur die Grenz-ID unter den noch gültigen Messungen und entfernt
abgelaufene sowie überzählige Einträge gemeinsam. Sie gehört zur Transaktion des Statusupdates und des neuen
Checks. Bei einem Fehler werden Status, Messung und Bereinigung zurückgerollt; die Alarmzustellung beginnt erst
nach erfolgreichem Commit. Die Grenzen von 100 Einträgen und 30 Tagen gelten unverändert.

Zwei separate Abfragen vermeiden eine MySQL-Unterabfrage auf dieselbe DELETE-Zieltabelle. Bei voller Historie
sinken die Bereinigungsabfragen von drei auf zwei und die übertragenen IDs von 100 auf eine. Tests mit SQLite
und PostgreSQL/PGlite prüfen außerdem exakte Zeitgrenzen, später eingefügte abgelaufene IDs und Host-Isolation.

### Nginx-Rendergraph

Das Profil zeigte die Graph-Ladevorgänge als wesentlichen Aufwand. `getCurrentHost()` verbindet nur die einzelnen
Beziehungen Zertifikat und Access-List mit dem Host. Domains, Clients und Authentifizierungseinträge werden
getrennt geladen; Sammlungen vervielfachen damit weder Hostdaten noch andere Sammlungen. Der Loader stellt das
aus den Domains abgeleitete `domain_names` ausdrücklich wieder her. Ein geschützter Proxy-Host benötigt nach dem
Aufwärmen der ORM-Metadaten vier statt sechs Graph-Abfragen.

Jeder Host wird weiterhin unmittelbar vor dem Rendern innerhalb der Konfigurationssperre frisch gelesen. Die
Änderung führt keinen Vorab-Cache für einen Sammelauftrag ein. Tests sichern spätere Hoständerungen, vollständige
Beziehungen, gelöschte Beziehungen, Validierung und vollständigen Batch-Rollback. Alle 36 Messläufe mit
echtem ShieldPM-Nginx akzeptierten die vollständigen generierten Konfigurationen; Baseline und Änderung besitzen
je Vergleichspaar identische SHA-256-Werte.

## Vergleichsmessungen

Laufzeit: Node.js 26.12.0, Ubuntu 24.04 x86_64, ShieldPM-Nginx 1.31.6 mit den benötigten Modulen. Die abschließenden
Messungen liefen nach den Tests ohne parallele Test-, Build- oder Installationsaufgaben. Beide Verfahren verwenden
identische synthetische Daten, Aufwärmläufe und drei Messungen in wechselnder Reihenfolge. Angegeben sind Mediane.
Alle Einzelwerte stehen in den [Rohdaten](./performance-optimierung-2026-10-17.json).

### Monitorpersistenz mit SQLite

Der gemessene Abschnitt umfasst Statusupdate, Insert, Transaktion und Bereinigung, aber keine Netzwerkprobe.
Die SQL-Anzahl enthält hier ausdrücklich BEGIN und COMMIT.

| Monitore | SQL vorher → nachher | Persistenz vorher → nachher | p95 je Persistenz vorher → nachher |
| -------: | -------------------: | --------------------------: | ---------------------------------: |
|       10 |              70 → 60 |            8,047 → 7,392 ms |                   1,271 → 1,134 ms |
|      100 |            700 → 600 |          64,208 → 52,367 ms |                   0,912 → 0,753 ms |
|     1000 |          7000 → 6000 |        536,027 → 467,973 ms |                   0,737 → 0,654 ms |

### Nginx-Erzeugung einschließlich echter Syntaxprüfung

Der Vergleich verwendet denselben Enginepfad mit dem bisherigen beziehungsweise neuen Graph-Loader, echte
Liquid-Vorlagen, temporäre Dateien und `nginx -tq`. Die SQL-Anzahl schließt in dieser Tabelle Transaktionsbefehle
aus; pro Host kommen unverändert zwei Transaktionsbefehle hinzu. Jeder Testhost besitzt zwei Domains und
verwendet dieselbe Access-List mit zwei Clients und zwei Authentifizierungseinträgen.

| Datenbank         | Hosts | SQL vorher → nachher | Gesamtdauer vorher → nachher |
| ----------------- | ----: | -------------------: | ---------------------------: |
| SQLite            |    10 |              80 → 60 |             57,43 → 55,63 ms |
| SQLite            |   100 |            800 → 600 |           331,24 → 322,16 ms |
| SQLite            |  1000 |          8000 → 6000 |         2656,80 → 2605,19 ms |
| PostgreSQL/PGlite |    10 |              80 → 60 |             91,49 → 81,32 ms |
| PostgreSQL/PGlite |   100 |            800 → 600 |           644,70 → 606,76 ms |
| PostgreSQL/PGlite |  1000 |          8000 → 6000 |         5862,13 → 5593,92 ms |

Die Rohdaten trennen Graph-Laden, Rendern, Dateisystem, Syntaxprüfung und Sperrwartezeit. SQL-Zeit ist zugleich
Teil der Graph- beziehungsweise Schreibarbeit und darf nicht zur Gesamtdauer addiert werden. `filesMs` misst
die Vereinigung aktiver Dateisystemintervalle; `filesCumulativeMs` summiert auch überlappende Operationen. Die
Sperrwartezeit wurde ohne konkurrierenden Auftrag gemessen und belegt keine Verbesserung unter Lock-Konkurrenz.

## Reproduktion

Voraussetzungen sind die eingefrorenen Projektabhängigkeiten sowie Node.js 26 und Yarn Classic 1.22.22.

```bash
# Im Verzeichnis backend:
BENCHMARK_MONITOR_HISTORY=1 node node_modules/vitest/vitest.mjs run \
  test/internal/proxy-host-monitor-history.spec.js \
  --maxWorkers=2 --disableConsoleIntercept

# Im Repository-Root:
node scripts/benchmarks/nginx-generation.mjs
```

Das Nginx-Profil meldet ohne externe Binary und Master-Konfiguration ausdrücklich `validation: not-run` und
`nginxTestMs: null`. Für eine echte Syntaxprüfung werden beide Pfade gesetzt:

```bash
SHIELDPM_NGINX_BENCHMARK_BINARY=/absolute/path/to/nginx \
SHIELDPM_NGINX_BENCHMARK_CONFIG=/absolute/path/to/master.template.conf \
  node scripts/benchmarks/nginx-generation.mjs
```

Die Master-Vorlage muss `include {{HOST_CONFIG_DIRECTORY}}/*.conf;` innerhalb ihres HTTP-Blocks enthalten. Der
Runner ersetzt diesen Platzhalter durch das tatsächlich erzeugte Verzeichnis und kopiert das neben der Vorlage
liegende `conf.d/` einschließlich `include/proxy-headers.conf` in den temporären Präfix. Für die vollständigen
TLS-/Access-List-Testhosts sind ausschließlich in einer isolierten Testumgebung synthetische Zertifikate unter
`/data/tls/custom/npm-1/`, eine Basic-Auth-Testdatei `/data/access/1` und die leere Include-Datei
`/data/custom_nginx/server_proxy.conf` bereitzustellen. Es wird kein Nginx-Dienst gestartet.

`SHIELDPM_NGINX_BENCHMARK_SIZES`, `SHIELDPM_NGINX_BENCHMARK_ROUNDS` und
`SHIELDPM_NGINX_BENCHMARK_ENGINES` begrenzen bei Bedarf die Standardmatrix `10,100,1000`, drei Wiederholungen
und `sqlite,postgres`. Die normalen Tests starten diese Profile nicht.

Die tatsächlichen lokalen Syntaxprüfungen verwendeten folgende Master-Vorlage:

```nginx
user root;
worker_processes 1;
error_log stderr warn;
pid nginx-benchmark.pid;
events { worker_connections 1024; }
http {
    default_type application/octet-stream;
    access_log off;
    server_names_hash_max_size 8192;
    server_names_hash_bucket_size 128;
    map $http_upgrade $connection_upgrade {
        default upgrade;
        '' close;
    }
    include {{HOST_CONFIG_DIRECTORY}}/*.conf;
}
```

## Prüfnachweise und Grenzen

- Backend: 2176 Tests bestanden, sieben konfigurierte Skips; Backend-Typprüfung bestanden.
- Frontend: 943 Tests bestanden; Locale-Prüfung, TypeScript/Produktionsbuild und Bundle-Budget bestanden.
- Biome-Prüfungen für Backend und Frontend bestanden; bestehende Hinweise bleiben sichtbar.
- TScanner: keine neuen Fehler, keine Baselinefehler, keine beratenden Befunde und keine Scannerfehler.
- Unabhängige Prüfung der Implementierungen und Messmethodik ohne weitere Befunde.

Die Stichproben ersetzen keine Produktionslasttests. PostgreSQL verwendet die eingebettete Single-Connection-
Engine PGlite; ein echter PostgreSQL-Mehrverbindungsbetrieb und MySQL wurden hier nicht gemessen. Ergebnisse
begründen keine allgemeine Beschleunigung von Netzwerkchecks, Proxyverkehr, Datenbankkonkurrenz oder Kaltstarts.

## Verwandte Seiten

- [Proxy-Host](../module/proxy-host.md)
- [Proxy-Host-Überwachung](../module/proxy-host-monitor.md)
- [Nginx-Engine](../module/nginx-engine.md)
- [Tests](./tests.md)
