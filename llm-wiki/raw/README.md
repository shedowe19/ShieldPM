# Raw-Quellen

Unveränderliche Quelldokumente. Das kuratierte Wiki ist die Interpretation;
diese Dateien sind Belege. **Nichts in diesem Verzeichnis bearbeiten.** Ändert
sich eine Quelle, wird eine neue Version abgelegt und die alte hier als
`superseded` markiert.

| Pfad                            | Ursprünglicher Pfad            | Herkunft   | Hinzugefügt | Lizenz     | Status     | Git-Blob   | Notizen                                                                                                                                                                                                   |
| ------------------------------- | ------------------------------ | ---------- | ----------- | ---------- | ---------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `legacy-agent-md-2026-11-04.md` | `agent.md` (Commit `9c434181`) | Repository | 2026-11-04  | UNLICENSED | superseded | `51d9a5c3` | Frühere Wiki-Pflege-Anleitung; ersetzt durch die Fassung im Repository-Wurzelverzeichnis. Enthält noch die generische Vorlage eines fremden Android-Projekts; sie bleibt als Teil des Belegs unverändert. |

## Warum das frühere Wiki nicht hier liegt

`docs/wiki-intern/` war kein abgeschlossenes Archiv, sondern die aktiv gepflegte
Tiefendoku. Sie wurde deshalb nicht eingefroren, sondern als
`llm-wiki/wiki/reference/` in das Wiki übernommen und bleibt dort pflegbar.
Siehe [Wiki-Struktur](../wiki/decisions/2026-11-04-wiki-struktur.md).

## Regeln

- Jede Datei hier ist unveränderlich. Korrekturen gehören in eine neue Version
  oder in die kuratierte Wiki-Seite.
- Keine Secrets; dieses Verzeichnis folgt derselben Redaktionsregel wie das Wiki.
- Neue Einträge brauchen eine Zeile in der Tabelle oben.

## Verwandte Seiten

- [Schema](../README.md)
- [Index](../wiki/index.md)
- [Wiki-Struktur](../wiki/decisions/2026-11-04-wiki-struktur.md)
