# ADR: Integration des AI Agenten (Gemini / Local LLM)

## Titel

Einführung eines intelligenten AI-Agenten im Backend zur automatisierten Verwaltung von Proxy-Hosts und System-Konfigurationen über Natural Language.

## Status

`Akzeptiert` (Implementiert am 03.01.2026 in Commit ea6a4f6c)

## Kontext

Die Konfiguration eines Reverse Proxys erfordert tiefes technisches Verständnis (Zertifikate, DNS, Routing, Nginx-Direktiven). Um ShieldPM auch für Einsteiger zugänglich zu machen und Administratoren zu entlasten, sollte ein System geschaffen werden, das natürliche Sprachkommandos ("Erstelle einen Proxy für meine Nextcloud auf Port 8080") direkt in lauffähige Konfigurationen umsetzt.

## Entscheidung

Ein nativer AI-Agent wurde tief in das ShieldPM-Backend (`backend/internal/ai.js`) integriert.

- **Provider:** Es werden sowohl die offizielle Google Gemini API (via `@google/generative-ai`) als auch lokale/OpenAI-kompatible LLMs (z.B. Ollama) via nativem Fetch unterstützt.
- **Tools / Function Calling:** Das Backend stellt dem LLM über ein massives Toolset (CRUD-Operationen für Hosts, Zertifikate, User, Nginx-Reloads) eine API zur Verfügung.
- **Sicherheit & Anti-Halluzination:** Strikte Regeln (Prompting) und ein "Hallucination Detector" verhindern, dass die AI Änderungen behauptet, ohne das entsprechende Tool ausgeführt zu haben. Bei Delete-Operationen wurde ein zwingender Verifikations-Schritt eingebaut.
- **ChatOps:** Die AI wurde später (29.01.2026) nahtlos an den Telegram-Bot gekoppelt.

## Begründung

- **Innovation:** ShieldPM ist damit einer der ersten Reverse Proxy Manager weltweit, der autonom durch eine KI konfiguriert werden kann.
- **Produktivität:** Drastische Reduzierung der Klickwege im UI bei komplexen Setups.

## Konsequenzen

### Positiv

- Revolutionäre User Experience.
- Zukunftssichere Plattform für autonome "SRE-Agents" (Self-Healing, automatische DDOS-Abwehr).

### Negativ

- Extreme Anforderungen an die Sicherheit der Tool-Implementierungen (z.B. Injection-Prävention, da User-Input nun indirekt über ein LLM das System steuert).
- Komplexes Fehler-Handling bei falschen Tool-Aufrufen durch das LLM.

## Verwandte Seiten

- [ADR-Übersicht](./README.md)
