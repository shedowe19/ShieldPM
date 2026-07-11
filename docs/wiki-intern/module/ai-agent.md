# AI-Agent

## Zweck

Dokumentation des integrierten AI-Assistenten.

## Kontext

Der AI-Agent ermöglicht natürlichsprachliche Interaktion mit ShieldPM — sowohl über die Web-UI als auch über Telegram (ChatOps).

## Wichtige Dateien

| Datei                                       | Beschreibung                                                                        |
| ------------------------------------------- | ----------------------------------------------------------------------------------- |
| `frontend/src/components/AiChat/AiChat.tsx` | Seitlicher KI-Chat mit nativem Button-Trigger und lokalisierten Screenreader-Labels |
| `backend/internal/ai.js` (14 KB)            | AI-Verwaltung (Einstellungen, Provider-Config)                                      |
| `backend/internal/ai/executor.js` (33 KB)   | Chat-Loop-Orchestrator                                                              |
| `backend/internal/ai/providers.js` (9 KB)   | Provider-Abstraktion (Gemini, Ollama, OpenAI)                                       |
| `backend/internal/ai/tools.js` (27 KB)      | Ausführbare Funktionen für den AI-Agent                                             |
| `backend/internal/ai/prompt.js` (10 KB)     | System-Prompt                                                                       |

## Provider

| Provider          | Paket                   | Beschreibung                         |
| ----------------- | ----------------------- | ------------------------------------ |
| Google Gemini     | `@google/generative-ai` | Cloud-AI                             |
| Ollama            | HTTP API (node-fetch)   | Lokale LLMs                          |
| OpenAI-kompatibel | HTTP API                | Beliebiger OpenAI-kompatibler Server |

## Tools

Der AI-Agent kann Aktionen im System ausführen (Tool-Calling). Die verfügbaren Tools sind in `tools.js` definiert (z. B. Hosts erstellen, Zertifikate erneuern, IP-Ranges aktualisieren, Status abfragen).

### Globale Systemaktionen

Die globalen Tools `test_nginx_config`, `force_nginx_reload` und `renew_ip_ranges` werden nur bei erfolgreicher
Prüfung von `settings:update` an das Modell übergeben. Der Executor prüft dieselbe Berechtigung unmittelbar vor der
Ausführung erneut. Damit können eingebettete oder halluzinierte Tool-Calls weder einen Nginx-Test/-Reload noch eine
Aktualisierung der IP-Ranges ohne Berechtigung auslösen.

## Verhalten

1. UI oder ChatOps schickt eine Nachricht an `routes/ai.js`.
2. `internal/ai/executor.js` startet den Chat-Loop: System-Prompt aus `prompt.js`, History des Threads, aktueller User-Input.
3. Der Provider (`providers.js`) ruft das LLM (Gemini, Ollama oder OpenAI-kompatibel) und liefert ggf. Tool-Calls zurück.
4. Tool-Calls werden in `tools.js` gegen die internen ShieldPM-Module ausgeführt; das Ergebnis wandert zurück in den Loop.
5. Final-Antwort wird zurück an Frontend/Telegram geschickt.

## Integration mit ChatOps

Über Telegram kann der AI-Agent gesteuert werden. Dafür synthetisiert `chat.js` temporäre JWT-Tokens (`ctx.shieldAccess`) für authentifizierte Interaktion.

## Abhängigkeiten

- `@google/generative-ai` — Gemini-SDK
- HTTP-Client für Ollama und OpenAI-kompatible APIs
- `internal/setting.js` — speichert Provider-Konfiguration (Provider, Model, API-Key, Base-URL)
- `internal/token.js` — kurzlebige Tokens für Tool-Aufrufe
- `internal/audit-log.js` — Protokollierung der AI-Aktionen
- Aufgerufen von `routes/ai.js` und `internal/chat.js` (ChatOps)

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

## Verwandte Seiten

- [ChatOps](./chatops.md)
- [Modulübersicht](./README.md)
