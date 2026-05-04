# ChatOps (Telegram)

## Zweck

Verwaltung von ShieldPM über den Telegram-Messenger mit AI-Unterstützung.

## Kontext

ChatOps ermöglicht die Steuerung von ShieldPM über einen Telegram-Bot. Der Bot nutzt den integrierten AI-Agenten für natürlichsprachliche Befehle.

## Wichtige Dateien

- `backend/internal/chat.js` (7 KB) — Telegram-Bot-Logik
- `backend/models/chat_integration.js` (1.5 KB) — Konfigurationsmodell
- `backend/routes/chat.js` (3 KB) — API-Routen

## Verhalten

- Bot läuft via `telegraf` im Backend-Prozess
- Authentifizierung über Whitelist von Telegram User-IDs (`allowed_ids`)
- Synthetisiert temporäre JWT-Tokens (`ctx.shieldAccess`) für API-Aufrufe
- Leitet Nachrichten an den AI-Agenten weiter

## Abhängigkeiten

- `telegraf` — Telegram-Bot-Framework
- `internal/ai/` — AI-Agent für Sprachverarbeitung
- `internal/token.js` — JWT-Token-Erzeugung

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

## Verwandte Seiten

- [AI-Agent](./ai-agent.md)
- [Modulübersicht](./README.md)
