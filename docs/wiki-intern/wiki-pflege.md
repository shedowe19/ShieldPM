# Wiki-Pflege

## Zweck

Regeln und Konventionen für die Pflege dieses internen Wikis.

## Grundprinzip

- **Code ist die Quelle der Wahrheit.** Das Wiki erklärt die Quelle der Wahrheit.
- **Produktiver Code wird nicht aus Wiki-Inhalten verändert.**
- **Das Wiki wird bei jeder Agent-Ausführung geprüft.**

## Wann aktualisieren?

Das Wiki muss aktualisiert werden bei:

- Neuen Features
- Architekturänderungen
- Neuen Modulen oder Services
- Neuen APIs, Endpunkten, Events
- Neuen Datenmodellen, Tabellen, Migrationen
- Neuen Konfigurationen oder Umgebungsvariablen
- Build-, Setup-, Test- oder Deployment-Änderungen
- Wichtigen technischen Entscheidungen
- Neuen Abhängigkeiten
- Entfernten Funktionen
- Bekannten Einschränkungen oder Risiken

## Wie aktualisieren?

1. Prüfen, ob eine bestehende Seite aktualisiert werden kann
2. Keine doppelte Dokumentation erstellen
3. Links im `index.md` ergänzen, wenn neue Seiten entstehen
4. Verwandte Seiten am Ende jeder Seite aktualisieren

## Neue Seiten benennen

- Kleinbuchstaben mit Bindestrichen: `mein-modul.md`
- Unterordner nutzen, wenn thematisch sinnvoll
- Seitenvorlage verwenden (siehe unten)

## Unterordner nutzen

- Thematisch zusammengehörige Seiten in eigene Ordner gruppieren
- Jeder Ordner sollte ein `README.md` oder eine Hauptseite haben
- Bestehende Ordnerstruktur: `projekt/`, `architektur/`, `entwicklung/`, `module/`, `ui/`, `api/`, `daten/`, `konfiguration/`, `entscheidungen/`, `features/`
- Neue Ordner nur anlegen, wenn mindestens 2-3 zusammengehörige Seiten entstehen

## Seitenvorlage

```markdown
# Seitentitel

## Zweck

Kurze Erklärung.

## Kontext

Wo wird es verwendet?

## Wichtige Dateien

- `backend/internal/mein-modul.js`
- `backend/models/mein_modell.js`

## Verhalten

Was macht dieser Teil des Systems?

## Abhängigkeiten

Welche Module werden verwendet?

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](./offene-fragen.md).

## Verwandte Seiten

- [Offene Fragen](./offene-fragen.md)
- [Index](./index.md)
```

## Unsicherheiten markieren

- `TODO:` — Noch zu untersuchen
- `Unklar:` — Nicht eindeutig aus dem Code ableitbar
- `Annahme:` — Basiert auf Vermutung

## Verlinkung

- **Nur relative Markdown-Links** verwenden (Format: link text in eckigen Klammern, dann Pfad in runden Klammern)
- **Keine** Wiki-Syntax
- **Keine** echten Secrets dokumentieren

## Formatierung

- Markdown mit Prettier formatieren: `npx prettier --write "docs/wiki-intern/**/*.md"`
- Biome wird im Repo verwendet, ist aber für Markdown nicht zuständig.

## Werkzeuge

- **Beziehungsgraph**: `python3 scripts/wiki-graph.py` erzeugt `docs/wiki-intern/wiki-graph.html` — eine eigenständige, offline-fähige interaktive Visualisierung aller Wiki-Seiten und ihrer Verlinkungen. Nach jeder größeren Wiki-Änderung neu generieren, um die aktuelle Vernetzung zu inspizieren.
- **Alternative Tools**: Obsidian (Vault auf `docs/wiki-intern/` setzen, `Strg+G`) oder die VS-Code-Extension "Foam" zeigen den gleichen Graph live.

## Verwandte Seiten

- [Offene Fragen](./offene-fragen.md)
- [Index](./index.md)
