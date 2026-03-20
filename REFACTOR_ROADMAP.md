# ShieldPM Refactor Roadmap

## ✅ Phase 1: Backend-Modularisierung — ABGESCHLOSSEN

Die gesamte `internal/`-Schicht wurde in fachlich geschnittene `modules/`-Unterordner aufgeteilt.
`backend/internal/` ist vollständig gelöscht — alle Imports zeigen direkt auf `modules/`.

### Modularisierte Domänen (34 Module)

| Domäne | Dateien |
|---|---|
| analytics | service |
| auth | 2fa, backup-codes, duo, login-attempts, passkeys, pending-2fa, totp, yubikey, token-response, service |
| token | auth, constants, issue, service |
| auth-session | builders, constants, service |
| proxy-host | helpers, lifecycle, mutations, reads, service |
| certificate | downloads, helpers, mutations, reads, renewal, service |
| certbot | paths, service |
| pki | ca, leaf, service |
| gitops | exporter, helpers, sync, service |
| git-deploy | config, helpers, polling, sync, service |
| setting | mutations, reads, service |
| user | avatar, constants, mutations, reads, service |
| access-list | helpers, mutations, reads, service |
| dead-host | helpers, lifecycle, mutations, reads, service |
| redirection-host | helpers, lifecycle, mutations, reads, service |
| stream | helpers, lifecycle, mutations, reads, service |
| ddns-provider | mutations, reads, service |
| ddns | helpers, providers, service |
| nginx | files, helpers, render, runtime, service |
| host | certificate, domains, service |
| docker | state, service |
| cloudflared | state, service |
| oauth2-proxy | state, service |
| maintenance | state, service |
| ai | config, models, chat, executor, prompt, providers, tools, service |
| chat | helpers, state, service |
| terminal | ssh, service |
| tor | helpers, service |
| anubis | policy, service |
| audit-log | mutations, reads, service |
| dashboard-note | service |
| report | service |
| remote-version | service |
| ip-ranges | service |

### Verifizierung

- Backend: **61/61 Tests grün** nach jeder Änderung
- Frontend: Build erfolgreich
- Alle Imports zeigen direkt auf `modules/` — keine Indirektion mehr

---

## Phase 2: Nächste Schritte (offen)

### 1. Frontend Performance Runde 2
**Ziel:** nach Backend-Konsolidierung weitere Bundle-/UX-Optimierungen.

**Schwerpunkte:**
- nächste schwere Seiten identifizieren
- Lazy-Splits erweitern
- React Query/Data-Flows weiter vereinheitlichen
- gezielte Bundle-Analyse

### 2. Route-Layer Konsolidierung
**Ziel:** Routes direkt an Module binden statt über flache Service-Objekte.

**Schwerpunkte:**
- Router-Middleware vereinheitlichen
- Request-Validierung zentralisieren
- Error-Handling-Pattern konsolidieren

### 3. Test-Coverage erweitern
**Ziel:** bestehende 61 Tests als Basis, Coverage auf kritische Module ausweiten.

**Schwerpunkte:**
- AI-Modul (Chat-Loop, Tool-Execution)
- Zertifikatsmanagement (Certbot, PKI)
- Host-Lifecycle-Flows

### 4. Shared Infrastructure
**Ziel:** Querschnittsthemen sauber kapseln.

**Schwerpunkte:**
- Logger-Instanz-Management
- Encryption-/Config-Helpers
- Model-Layer Patterns

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
