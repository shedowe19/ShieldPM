# AI-Agent

## Zweck

Der AI-Agent übersetzt natürliche Sprache in serverseitig autorisierte ShieldPM-Tool-Aufrufe. Das Modell ist
untrusted: Prompt, Providerantwort und Toolargumente erteilen keine Berechtigung.

## Provider

- Google Gemini über `@google/genai`
- Ollama Native API
- OpenAI-kompatible Chat-Completions

API-Keys werden verschlüsselt gespeichert und nie an Tool-Schemas oder Tool-Ergebnisse angehängt. Providerantworten
werden normalisiert; unbekannte Tools oder Argumentformate werden abgewiesen.

## Tool-Grenze

`backend/internal/ai/tools.js` härtet jedes JSON-Schema rekursiv:

- `additionalProperties: false`, maximale Verschachtelung und Property-Anzahl;
- begrenzte Stringlängen, Arrays und Zahlenbereiche;
- AJV-Validierung gegen exakt das Schema, das dem Provider angeboten wurde;
- Capability-/Owner-Prüfung sowohl beim Offer als auch unmittelbar vor Ausführung.

Legacy-Aliasse, die gefährliche Systemaktionen ohne denselben Vertrag erreichbar machten, sind entfernt.

## Serverseitige Safety-Limits

`backend/internal/ai/safety.js` erzwingt unabhängig vom Prompt:

- höchstens 4 Tool-Calls pro Providerantwort;
- höchstens 8 Tool-Calls pro User-Turn;
- höchstens 2 mutierende Aktionen pro Turn;
- höchstens 1 destruktive Aktion pro Turn;
- höchstens 32 KiB serialisiertes Tool-Ergebnis.

Nach dem Lesen untrusted Logs, Audit- oder Analytics-Daten ist im selben Turn keine Mutation erlaubt.

## Bestätigung

Destruktive und sicherheitssensitive Tools verlangen einen serverseitig ausgegebenen One-Time-HMAC-Token. Er bindet
Actor, Toolname, kanonisierte Argumente, Nonce und Ablauf. Das Modell muss die konkrete Aktion anzeigen und den Nutzer
um Zustimmung bitten. Nur derselbe Aufruf mit unveränderten Argumenten kann den Token einmal verbrauchen; Modelltext
oder ein erfundener Token genügt nicht.

## Ablauf

1. Web-Chat oder ChatOps liefert Userinput plus ein echtes `Access`-Principal-Objekt.
2. Der Executor filtert Tools anhand aktueller Capabilities.
3. Der Provider liefert Text und optional native Tool-Calls.
4. Strikte Schema-, Limit-, Confirmation-, Ownership- und Capability-Prüfung läuft serverseitig.
5. Interne Services führen Aktionen aus und schreiben Audit-Events.
6. Bounded/redigierte Ergebnisse gehen zurück zum Provider.

## Wichtige Dateien

- `backend/internal/ai/executor.js`
- `backend/internal/ai/tools.js`
- `backend/internal/ai/safety.js`
- `backend/internal/ai/providers.js`
- `backend/internal/ai/prompt.js`
- `backend/routes/ai.js`

## Verwandte Seiten

- [ChatOps](./chatops.md)
- [Benutzer & Auth](./benutzer-auth.md)
- [Audit Log](../verwaltung/audit-log.md)
- [Security-Modernisierung](../entscheidungen/2026-08-31-security-modernisierung.md)
