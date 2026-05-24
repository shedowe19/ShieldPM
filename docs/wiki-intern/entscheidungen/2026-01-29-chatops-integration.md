# ADR: ChatOps & Telegram Bot Integration

## Titel

Integration eines Telegram-Bots für ChatOps, Benachrichtigungen und AI-Interaktion.

## Status

`Akzeptiert` (Implementiert am 29.01.2026 in PR #271)

## Kontext

Die Steuerung von ShieldPM erforderte bisher stets den Zugriff auf das Web-Dashboard. Für schnelle administrative Aufgaben von unterwegs (z.B. Nginx-Neustart, Logs prüfen, Alarmierungen bei Offline-Zielen) ist das mobile Dashboard zwar nutzbar, aber nicht optimal. Ein Chat-basiertes Interface (ChatOps) wurde als effizientere Lösung identifiziert.

## Entscheidung

Ein nativer Telegram-Bot wurde ins Backend integriert.

- Die Library `telegraf` wird für die Kommunikation mit der Telegram-Bot-API genutzt.
- Administratoren können ihre Telegram-User-IDs in ShieldPM hinterlegen (Whitelisting). Nur diese IDs dürfen Befehle an den Bot senden.
- Der Bot unterstützt Befehle wie `/status`, `/logs` oder das Neustarten von Services.
- **AI-Verknüpfung:** Der Telegram-Bot leitet Nachrichten an den internen ShieldPM AI-Agenten (Gemini/Local LLM) weiter. Das Backend generiert dafür ein temporäres JWT (`ctx.shieldAccess`), sodass die AI authorisierte Aktionen (z.B. Hosts anlegen) für den Nutzer im Chat ausführen kann.

## Begründung

- **Erreichbarkeit:** Push-Benachrichtigungen und Steuerung direkt auf dem Smartphone ohne VPN oder Login-Mühen.
- **Automatisierung:** Kombination von AI und ChatOps ermöglicht natürliche Sprachkommandos für komplexe Nginx-Setups ("Leite domain.com auf Port 8080 um").

## Konsequenzen

### Positiv

- Enorme Steigerung der administrativen Effizienz von unterwegs.

### Negativ

- Das Backend muss eine konstante Long-Polling- oder Webhook-Verbindung zu Telegram halten.
- Bei Fehlkonfiguration des Whitelistings bestünde das Risiko unautorisierter Systemzugriffe (daher strikte Validierung der `allowed_ids`).

## Verwandte Seiten

- [ADR-Übersicht](./README.md)
- [ChatOps](../module/chatops.md)
