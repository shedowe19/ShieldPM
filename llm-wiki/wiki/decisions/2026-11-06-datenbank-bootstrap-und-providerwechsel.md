# DB-unabhängiger Bootstrap und verifizierter Providerwechsel

Status: active
Last verified: 2026-11-06
Confidence: high

## Zweck

Die Datenbank soll bei der Ersteinrichtung wählbar sein und später ohne stillen
Datenverlust gewechselt werden können. Die Umsetzung gehört auf ausdrücklichen
Nutzerwunsch in denselben Feature-PR wie die Traffic-Einstellungen.

## Titel

2026-11-06 Datenbankauswahl vor Modellimporten und kontrollierter Providerwechsel

## Status

ADR-Zustand: accepted für den Feature-Branch; kein Merge und keine Bereitstellung.

## Kontext

`lib/config.js` und `db.js` halten beim Import gebundene Singletons. Modelle binden
Knex, und Hintergrunddienste beginnen vor dem normalen Listen zu schreiben. Ein
Wechsel eines Settings-Werts reicht deshalb nicht. Der bestehende SQLite-Import
kennt keinen sicheren Rückweg und Instanz-Restore ist providergebunden.

## Entscheidung

Ein DB-unabhängiger Bootstrap wartet vor allen Anwendungsimporten auf eine sichere
Auswahl. Spätere Wechsel starten den Backend-Prozess in Wartung neu. Ein privates,
atomar geflushtes Journal steuert Snapshot, Backup, Übertragung, unabhängige
Verifikation und Aktivierung. Erst die verifizierte Zielauswahl wird außerhalb der
Anwendungsdatenbank privat persistiert. Quellschreibsperren bleiben bis zur
Aktivierung gehalten. Nach Aktivierung ist das Ziel verbindlich; ein Rückwechsel
ist eine neue Migration aktueller Daten in ein neues Ziel.

Die initiale Matrix ist SQLite ↔ MySQL/MariaDB und SQLite ↔ PostgreSQL. Ziele
müssen leer und exklusiv sein. Alle anderen Instanzen und externen Schreiber müssen
vom Betreiber gestoppt werden. Ein separates Kontrollfile mit OS-Sperre schützt
Prozesse auf demselben Datenvolume, keine unabhängig betriebenen Instanzen.

## Alternativen

- Knex im laufenden Prozess austauschen: Modelle und aktive Schreiber behalten
  alte Bindungen; unvollständige Quiesce-Registries riskieren geteilte Daten.
- Alte SQLite-Datei wieder öffnen: verliert alle nach dem Serverwechsel neu
  akzeptierten Schreibvorgänge.
- Generische Settings für Verbindungsdaten: vor DB-Verbindung nicht verfügbar und
  ungeeignet für Secrets im generischen Auditpfad.
- Direktes Server-zu-Server-Kopieren: erst nach eigener, real geprüfter Matrix;
  aktuell ausdrücklich abgewiesen statt ungeprüft angeboten.

## Konsequenzen

- Bestehende explizite oder unlesbare Konfiguration darf keinen frischen Wizard
  eröffnen. Legacy-ENV bleibt ohne verwaltete Auswahl kompatibel.
- Historische Schema-Migrationen dürfen beim getrennten Zielschemaaufbau keine
  Modelle oder Nginx-Dienste importieren.
- Konvertierung prüft Bigint, Dezimal-/JSON-Zahlen, SQL-NULL, Datum/Zeitzone,
  Boolean, Binärdaten, Schlüssel, Sequenzen und tatsächliche Zielpräzision.
  Inkompatibilität verhindert Aktivierung.
- Ein vollständiger privater kanonischer Export entsteht vor Zieldatenschreibungen.
  Dies ist kein verschlüsseltes Instanzbackup und ersetzt unabhängige Sicherungen
  nicht. Voraktivierungsfehler sind bestätigbar; Aktivierungsunsicherheit bleibt
  gesperrt, bis Zielidentität und Daten verifiziert sind.
- SQLite-Wartung, Passwort-Wiederherstellung und Instanz-Restore müssen die
  verwaltete Auswahl berücksichtigen und dürfen keine archivierte Datenbank
  versehentlich wieder aktivieren.

## Verifikation

Die aktuelle Kette mit 92 Migrationen wurde auf echten SQLite-, MariaDB- und
PostgreSQL-Datenbanken aufgebaut; Oracle MySQL 8.4.13 wurde zusätzlich mit der kompletten Kette geprüft. Alle unterstützten Richtungen übertrugen jeweils
42 Anwendungstabellen und bestanden unabhängige Verifikation einschließlich
zusammengesetzter Schlüssel, Sitzungsverweise, Login-Throttles und eines Integers
über der JavaScript-Präzisionsgrenze. Die Testmatrix fand und behob eine
providerabhängige Sortierung der Migrationsdateinamen, MySQL-Default-Ausdrücke und Metadaten-Großschreibung. Weitere Betriebs-/UI-Belege
stehen nach Abschluss im [Log](../log.md).

## Offene Fragen

Zusätzliche Server-zu-Server-Richtungen und koordinierte Mehrinstanz-Migrationen
sind außerhalb dieser initialen Matrix; dafür ist neue Implementierung samt
realen Prüfungen erforderlich.

## Verwandte Seiten

- [Datenbank und Migrationen](../data/migrations.md)
- [Datenbank-Referenz](../reference/daten/datenbank.md)
- [Konfiguration](../infrastructure/configuration.md)
- [Entscheidungen](./README.md)
- [Index](../index.md)
