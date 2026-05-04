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
- Bot-Caching in `bots{}` Map — jede Integration wird als `Telegraf`-Instanz gecached, um Doppelstarts zu vermeiden
- Leitet Nachrichten an den AI-Agenten weiter

### smartEscape() — MarkdownV2-Escaping

`smartEscape()` (in `chat.js`, ~Zeile 25) escapet Text für Telegram MarkdownV2, **aber bewahrt Inline-Code-Blöcke** (Backticks) und **Code-Fences** (```) :

````javascript
const smartEscape = (text) => {
  const parts = text.split(/(`[^`]+`|```[\s\S]+?```)/g);
  return parts
    .map((part) => {
      if (part.startsWith("`")) return part; // Code unverändert lassen
      // Escape für MarkdownV2: _ * [ ] ( ) ~ > # + - = | { } . ! \ `
      return part.replace(/([_*[\]()~>#+\-=|{}.!\\`])/g, "\\$1");
    })
    .join("");
};
````

### ctx.shieldAccess — Automatische JWT-Synthese

Der ChatOps-Bot synthetisiert einen temporären JWT-Token für jeden eingehenden Request:

```javascript
const generatedToken = jwt.sign(
  { scope: ["user"], attrs: { id: integration.user_id } },
  getPrivateKey(),
  { algorithm: "RS256", expiresIn: "5m" },
);
ctx.shieldAccess = new access(generatedToken); // Echtes Access-Objekt mit .can()
```

Dies ermöglicht dem AI-Agenten echte Berechtigungsprüfungen durchzuführen (nicht nur simulierte), weil `access.token` gesetzt ist — wichtig für Audit-Logs und Prompt-Kontext.

### Markdown-Fallback

Beim Senden einer AI-Antwort:

1. Versucht `smartEscape()` + `parse_mode: "MarkdownV2"`
2. Bei `can't parse entities`-Fehler → Fallback auf reinen Text ohne Formatierung

## Abhängigkeiten

- `telegraf` — Telegram-Bot-Framework
- `internal/ai/` — AI-Agent für Sprachverarbeitung
- `internal/token.js` — JWT-Token-Erzeugung

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

## Verwandte Seiten

- [AI-Agent](./ai-agent.md)
- [Modulübersicht](./README.md)
