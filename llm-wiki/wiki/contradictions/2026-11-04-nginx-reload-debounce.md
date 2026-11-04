# Nginx-Reload: Debounce gegen Sperre

Status: superseded
Last verified: 2026-11-04
Confidence: high

## Zweck

Diese Seite hält einen offenen Widerspruch fest: zwei Dokumente beschreiben das
Reload-Verhalten von Nginx unterschiedlich. Sie bewertet ihn anhand des Codes,
ohne eine der Quellen zu löschen.

## Behauptung A — Reloads sind verzögert

`.cursorrules:134`: „**Nginx operations**: Are async with debounced reload (2s
delay) to avoid CPU spikes.“ und `.cursorrules:188`: „Always debounce Nginx reloads“.

## Behauptung B — Schreibvorgänge sind serialisiert, nicht verzögert

- `backend/internal/nginx.js` enthält weder `setTimeout` noch einen Debounce; die
  Serialisierung läuft über `withConfigurationLock` und einen asynchronen Kontext
  (`nginx.js:68-69,77-81`, `nginx.js:228-232`).
- `GEMINI.md:219-220`: „Serializes host configuration writes; bulk operations use
  `skip_reload` and a final validated reload.“
- **Der einzige 2-Sekunden-Debounce für Nginx-Änderungen** sitzt in
  `backend/internal/docker.js:377-407`: Dort bündelt die Docker-Erkennung **ihre
  eigenen** Änderungen, bevor sie die Engine aufruft. Andere Timer
  (`anubis.js:149`, `cloudflared.js:126`, `host-traffic-policy.js:81`) betreffen
  nicht den Nginx-Reload; `gitops.js:2048` debounced Auto-Push über 5 Sekunden.

## Bewertung

Behauptung B entspricht dem Code. Der 2-Sekunden-Debounce ist eine Eigenschaft der
Docker-Discovery, nicht der Engine. Wer sich auf A verlässt, erwartet eine
Verzögerung, die es nicht gibt, und kann falsche Annahmen über Lastspitzen treffen.

## Offen

- Behoben am 2026-11-04: `.cursorrules` beschreibt jetzt serielle Schreibvorgänge
  und den Docker-Debounce statt eines Engine-Debounces. Aufgabe **T-002** erledigt.

## Verwandte Seiten

- [Widersprüche](./README.md)
- [Nginx-Engine](../architecture/nginx-engine.md)
- [Hintergrundjobs](../architecture/background-jobs.md)
- [Docker-Discovery (Tiefe)](../reference/module/docker.md)
