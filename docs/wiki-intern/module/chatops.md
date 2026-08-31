# ChatOps (Telegram)

## Zweck

ChatOps nimmt private Telegram-Nachrichten allow-gelisteter externer Benutzer entgegen und leitet sie mit den aktuellen
Berechtigungen des Integration-Owners an den AI-Agenten weiter.

## Principal statt synthetischem JWT

`backend/lib/integration-access.js` baut ein serverseitiges `Access`-Objekt, das Integration-ID, Owner-ID und stabile
Telegram-User-ID bindet. Es erzeugt **kein** JWT/Bearer-Token und übernimmt keine vom Telegram-Text gelieferten
Authorization-Claims.

Vor jeder Nachricht werden live geprüft:

- private Chat-Art und numerische Sender-ID;
- Integration vorhanden, aktiviert und nicht gelöscht;
- Owner vorhanden, aktiv und nicht gelöscht;
- Sender weiterhin in `allowed_ids`;
- aktuelle Owner-Rollen, Permissions und Visibility.

Damit wirken Deaktivierung, Owner-Sperre oder Allowlist-Entzug sofort. Owner-Scope wird in Query-Modifiern angewendet;
ChatOps kann weder fremde Objekte sehen noch den Principal wechseln.

## Nachrichtenfluss

1. `backend/internal/chat.js` verwaltet genau eine Telegraf-Instanz pro aktivierter Integration.
2. Middleware validiert den Telegram-Principal und erzeugt den live Access-Context.
3. `backend/internal/ai/executor.js` erhält denselben Context wie ein autorisierter API-Aufruf.
4. Tool-Schemas, Capabilities, Owner-Grenzen, Limits und Confirmations gelten unverändert.
5. Antworten werden für Telegram MarkdownV2 escaped; bei Parserfehler folgt ein Plain-Text-Fallback.

## Secrets und Audit

Bot-Token werden verschlüsselt gespeichert und weder im API-Response noch in Logs ausgegeben. Audit-Einträge ordnen
Aktionen dem Integration-Owner zu und erhalten den Integration-/externen Principal-Kontext. Token bei Verdacht sofort
über BotFather widerrufen und die Integration deaktivieren.

## Wichtige Dateien

- `backend/internal/chat.js`
- `backend/lib/integration-access.js`
- `backend/models/chat_integration.js`
- `backend/routes/chat.js`
- `backend/internal/ai/`

## Verwandte Seiten

- [AI-Agent](./ai-agent.md)
- [Benutzer & Auth](./benutzer-auth.md)
- [Audit Log](../verwaltung/audit-log.md)
- [Security-Modernisierung](../entscheidungen/2026-08-31-security-modernisierung.md)
