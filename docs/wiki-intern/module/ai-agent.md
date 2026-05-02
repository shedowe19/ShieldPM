# AI-Agent

## Zweck

Dokumentation des integrierten AI-Assistenten.

## Kontext

Der AI-Agent ermöglicht natürlichsprachliche Interaktion mit ShieldPM — sowohl über die Web-UI als auch über Telegram (ChatOps).

## Wichtige Dateien

| Datei | Beschreibung |
|---|---|
| `backend/internal/ai.js` (14 KB) | AI-Verwaltung (Einstellungen, Provider-Config) |
| `backend/internal/ai/executor.js` (33 KB) | Chat-Loop-Orchestrator |
| `backend/internal/ai/providers.js` (9 KB) | Provider-Abstraktion (Gemini, Ollama, OpenAI) |
| `backend/internal/ai/tools.js` (27 KB) | Ausführbare Funktionen für den AI-Agent |
| `backend/internal/ai/prompt.js` (10 KB) | System-Prompt |

## Provider

| Provider | Paket | Beschreibung |
|---|---|---|
| Google Gemini | `@google/generative-ai` | Cloud-AI |
| Ollama | HTTP API (node-fetch) | Lokale LLMs |
| OpenAI-kompatibel | HTTP API | Beliebiger OpenAI-kompatibler Server |

## Tools

Der AI-Agent kann Aktionen im System ausführen (Tool-Calling). Die verfügbaren Tools sind in `tools.js` definiert.

## Integration mit ChatOps

Über Telegram kann der AI-Agent gesteuert werden. Dafür synthetisiert `chat.js` temporäre JWT-Tokens (`ctx.shieldAccess`) für authentifizierte Interaktion.

## Verwandte Seiten

- [ChatOps](./chatops.md)
- [Modulübersicht](./README.md)
