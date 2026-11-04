# Analysen

Status: active
Last verified: 2026-11-04
Confidence: high

## Zweck

Ablage für wiederverwendbare Antworten, die mehrere Wiki-Seiten oder Quellen
zusammenführen — zum Beispiel „warum braucht Host X zwei Reloads?“ oder „welche
Module hängen an `meta`?“. Eine Analyse ist keine Themenseite: Sie beantwortet
eine konkrete Frage und veraltet, wenn sich die Grundlagen ändern.

## Wie eine Analyse entsteht

1. Frage und Antwort in einer Datei `YYYY-MM-DD-kurzer-titel.md` ablegen.
2. Metadatenblock wie auf jeder kuratierten Seite (`Status`, `Last verified`,
   `Confidence`), dann `## Zweck` mit der Frage in einem Satz, danach Kurzantwort,
   Belege (`pfad:zeile`), betroffene Seiten und Gültigkeitsgrenzen, am Ende
   `## Verwandte Seiten`.
3. Im [Index](../index.md) unter „Analysen“ verlinken.
4. Im [Log](../log.md) und bei dauerhaftem Ergebnis im
   [Changelog](../changelog.md) vermerken.
5. Wird die Analyse durch eine neuere Quelle überholt, `Status: superseded`
   setzen und die neue Seite verlinken — nicht löschen.

## Regeln

- Keine Kopie einer Themenseite; höchstens Zusammenfassung plus Links.
- Jede Aussage braucht eine Quelle.
- Keine Secrets, keine internen Infrastrukturwerte (Sichtbarkeit `public`).

## Verwandte Seiten

- [Index](../index.md)
- [Aufgaben](../tasks.md)
- [Log](../log.md)
- [Tiefendoku](../reference/index.md)
