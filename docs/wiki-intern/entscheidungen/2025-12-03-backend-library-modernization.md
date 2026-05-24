# ADR: Backend-Bibliotheken Modernisierung (Day.js & Native Crypto)

## Titel

Ersatz von `moment` durch `dayjs` und `node-rsa` durch native `node:crypto`.

## Status

`Akzeptiert` (Implementiert am 03.12.2025 in Commit 16063d5a)

## Kontext

Das Backend verwendete historisch die Bibliotheken `moment` für die Datumsverarbeitung und `node-rsa` für kryptografische Operationen.

- `moment` gilt in der JavaScript-Community seit längerem als "Legacy" (wartungsmodus), ist sehr groß und mutiert Objekte.
- `node-rsa` ist eine reine JavaScript-Implementierung von RSA, die im Vergleich zu nativen Modulen in Node.js langsam und fehleranfälliger ist.

## Entscheidung

1. **`moment` wurde durch `dayjs` ersetzt.** Day.js bietet eine weitgehend kompatible API zu Moment.js, ist aber vollständig unveränderlich (immutable) und hat einen winzigen Footprint (2kB).
2. **`node-rsa` wurde durch `node:crypto` ersetzt.** Statt einer externen JS-Bibliothek wird das in Node.js integrierte, in C/C++ geschriebene `crypto`-Modul verwendet.

## Begründung

- **Performance & Sicherheit:** Native Node.js-Kryptografie (`node:crypto` basierend auf OpenSSL) ist um ein Vielfaches schneller und sicherer gegen Side-Channel-Attacken als reine JavaScript-Bibliotheken (`node-rsa`).
- **Wartbarkeit & Größe:** Der Austausch von `moment` zu `dayjs` reduziert die Größe des Backends, beschleunigt `yarn install` und beugt Fehlern durch mutierte Datumsobjekte vor.
- **Zukunftssicherheit:** Veraltete Abhängigkeiten wurden aus dem `package.json` entfernt.

## Alternativen

- Beibehaltung der alten Bibliotheken (abgelehnt wegen Tech-Debt).
- `date-fns` anstelle von `dayjs` (abgelehnt, da die Migration von `moment` zu `dayjs` aufgrund der ähnlichen API deutlich einfacher und weniger fehleranfällig war).

## Konsequenzen

### Positiv

- Reduzierte Abhängigkeiten.
- Schnellere Krypto-Operationen (wichtig für JWT und TLS-Zertifikat-Parsing).
- Leichtere Wartbarkeit.

### Negativ

- Entwickler müssen sich daran gewöhnen, dass `dayjs`-Objekte immutable sind (Methoden wie `.add()` verändern nicht das Originalobjekt, sondern geben ein neues zurück).

## Verwandte Seiten

- [ADR-Übersicht](./README.md)
