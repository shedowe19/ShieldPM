# ShieldPM Refactor Roadmap

## Status

Bereits modularisiert:

- Analytics
- Auth / 2FA
- Token-Flow
- Proxy-Host
- Certificate
- GitOps
- Git-Deploy
- Nginx

Verifiziert mit wiederholten Testläufen:

- Backend: 61/61 Tests grün
- Frontend: Build erfolgreich, Frontend-Tests zuvor grün

---

## Nächste Refactor-Blöcke

### 1. Access Lists
**Ziel:** Zugriffskontrolle, Listen, Clients, Items und Lifecycle aus breiten internen Services in fachliche Module schneiden.

**Geplante Split-Punkte:**
- reads
- mutations
- client/item helpers
- lifecycle / enable-disable / cleanup

**Nutzen:**
- wichtiger Kernbereich für Security und Host-Zugriffe
- gute Ergänzung zu Proxy-Host / Nginx / Auth

---

### 2. Streams
**Ziel:** Stream-spezifische Logik von CRUD, Nginx-Konfiguration und Spezialfällen trennen.

**Geplante Split-Punkte:**
- reads
- mutations
- lifecycle
- helpers

---

### 3. Dead Hosts / Redirection Hosts
**Ziel:** kleinere Host-Domains analog zu Proxy-Host modularisieren.

**Nutzen:**
- einheitliche Host-Architektur
- geringeres Wartungschaos

---

### 4. DDNS / Cloudflared
**Ziel:** externe Integrationen klarer kapseln.

**Nutzen:**
- stabilere Adapter-Grenzen
- sauberere Fehlerpfade
- bessere Testbarkeit

---

### 5. Frontend Performance Runde 2
**Ziel:** nach Backend-Konsolidierung weitere Bundle-/UX-Optimierungen.

**Schwerpunkte:**
- nächste schwere Seiten identifizieren
- Lazy-Splits erweitern
- React Query/Data-Flows weiter vereinheitlichen
- evtl. gezielte Bundle-Analyse

---

## Arbeitsprinzip

Jeder Block wird in dieser Reihenfolge umgesetzt:

1. Struktur lesen
2. sichere Modulgrenze einziehen
3. internen Service fachlich aufteilen
4. Tests/Build prüfen
5. committen

Keine "Big Bang"-Umbauten.
Nur inkrementelle, testgestützte Refactors.
