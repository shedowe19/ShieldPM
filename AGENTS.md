# AI Agent Guidelines — ShieldPM

> **Read `.cursorrules` first** for detailed coding standards and architecture reference.  
> **Read `GEMINI.md` for** the authoritative project context (versions, paths, integrations).

> [!CAUTION]
> **`agent.md` ist PFLICHTLEKTÜRE!** Diese Datei enthält die verbindlichen Regeln für das interne LLM-Wiki (`llm-wiki/`).
> Jeder Agent **MUSS** `agent.md` vor jeder Arbeitssitzung lesen und die darin definierten Wiki-Pflichtprüfungen (vor und nach jeder Aufgabe) einhalten.
> Bei Nichtbeachtung wird die Wiki-Wissensbasis veralten und unbrauchbar.

## Project Context

### Overview

ShieldPM is a security-focused Nginx Proxy Manager fork (v4.4.1). It manages reverse proxies via a web UI, with deep integrations for WAF (ModSecurity, OpenAppSec), IPS (CrowdSec), ChatOps (Telegram), AI assistants, GitOps, Tor onion services, Cloudflare Tunnels, and DDNS.

### Key Files

| File                             | Purpose                                                                   |
| -------------------------------- | ------------------------------------------------------------------------- |
| `GEMINI.md`                      | **Source of truth** for AI agent context                                  |
| `agent.md`                       | **PFLICHT** — Wiki-Pflege-Regeln, Pflichtprüfungen vor/nach jeder Aufgabe |
| `llm-wiki/`                      | **Internes LLM-Wiki** — Langzeitgedächtnis des Projekts (Deutsch)         |
| `backend/internal/nginx.js`      | Nginx config generation engine                                            |
| `backend/internal/proxy-host.js` | Proxy host CRUD logic                                                     |
| `backend/models/proxy_host.js`   | Objection.js model for proxy hosts                                        |
| `backend/templates/*.conf`       | Liquid templates for Nginx vhosts                                         |
| `backend/migrations/`            | Knex.js migration files (ESM)                                             |
| `frontend/src/Router.tsx`        | React routing (lazy-loaded pages)                                         |
| `frontend/src/api/`              | React Query hooks for API calls                                           |
| `frontend/src/components/`       | Reusable UI (shadcn/ui based)                                             |
| `frontend/src/locale/`           | i18n translation files                                                    |
| `scripts/install.sh`             | Native/LXC installer script                                               |
| `rootfs/`                        | Docker image overlay files                                                |
| `Dockerfile`                     | Multi-stage build definition                                              |
| `.version`                       | Version file (sync with package.json files)                               |

## Common Patterns

### Backend: Creating a New Service

```javascript
// backend/internal/my-feature.js
import errs from "../lib/error.js";
import myModel from "../models/my_feature.js";
import internalAuditLog from "./audit-log.js";

const internalMyFeature = {
  async create(access, data) {
    // Validate access permissions
    // Insert via Objection model
    // Log audit event
    // Return result with omitted fields
  },
  async get(access, data) {
    /* ... */
  },
  async getAll(access, expand) {
    /* ... */
  },
  async delete(access, data) {
    /* ... */
  },
};
export default internalMyFeature;
```

### Frontend: Adding a New API Hook

```typescript
// frontend/src/api/my-feature.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "src/api/backend";

export function useMyFeatures() {
  return useQuery({
    queryKey: ["my-features"],
    queryFn: () => api.get("/api/my-features"),
  });
}

export function useCreateMyFeature() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.post("/api/my-features", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-features"] }),
  });
}
```

### Database: Creating a Migration

```javascript
// backend/migrations/YYYYMMDDHHMMSS_description.js
import { migrate as logger } from "../logger.js";

const migrateName = "add_my_feature";

const up = (knex) => {
  logger.info(`[${migrateName}] Migrating Up...`);
  return knex.schema.createTable("my_feature", (table) => {
    table.increments("id").primary();
    table.string("created_on").notNullable().defaultTo(knex.fn.now());
    table.string("modified_on").notNullable().defaultTo(knex.fn.now());
  });
};

const down = (knex) => {
  logger.info(`[${migrateName}] Migrating Down...`);
  return knex.schema.dropTable("my_feature");
};

export { up, down };
```

## Important Constraints

### Known Limitations

- **Nginx validation**: Generated configurations and reloads run `nginx -tq`; failed host configurations restore the previous file.
- **SQLite is supported in production**: it is the default; MySQL/MariaDB or PostgreSQL are recommended for multi-instance deployments.
- **Two-repo split**: Nginx binary changes need the `shieldpm-nginx` repo, not this one.

### Gotchas

- Boolean fields in SQLite are stored as `0`/`1` integers — the Objection.js model handles conversion. Don't pass `true`/`false` to raw queries.
- The `domain_names` field on proxy hosts is derived from the `host_domains` relation in `$afterGet()`. Don't write to `domain_names` directly in the DB.
- Nginx host configuration writes are serialized. Bulk updates use `skip_reload` and perform a final validated reload.
- `install.sh` must handle both Debian and Ubuntu variants — test parser/collection downloads with raw GitHub URLs.

### Avoid

- Introducing new UI component libraries (use shadcn/ui + Radix)
- Using `require()` anywhere (the project is ESM)
- Storing state outside `/data/` (Docker volumes expect it)
- Writing raw SQL in service code (use Objection.js query builder)
- Skipping the `access` parameter in internal service methods

<!-- LLM-WIKI:START -->
## LLM Wiki

Dieses Repository führt dauerhaftes Projektwissen in `llm-wiki/`. Die ausführliche
Tiefendoku liegt unter `llm-wiki/wiki/reference/` (übernommen aus dem früheren
`docs/wiki-intern/`); `llm-wiki/wiki/` enthält die kuratierten Synthesen darüber.

Vor jeder nicht trivialen Änderung lesen:

1. `llm-wiki/wiki/index.md`
2. `llm-wiki/wiki/current-project-state.md`
3. `llm-wiki/wiki/tasks.md`
4. Die im Index verlinkten Seiten, die zur Aufgabe passen

Vor einer Projektantwort den Index und die passenden Seiten lesen und sie
zitieren. Ist die Antwort wiederverwendbar, als Seite unter
`llm-wiki/wiki/analyses/` ablegen und im Index verlinken.

Nach jeder relevanten Änderung:

- Die betroffene Seite aktualisieren; die README nicht duplizieren. Moduldetails
  zuerst in `llm-wiki/wiki/reference/`, danach die Synthese in `llm-wiki/wiki/`.
- Einen `log.md`-Eintrag mit allen Feldern und einer Verifikationszeile ergänzen.
- Aufgaben in `tasks.md` anlegen oder verschieben; erledigte Aufgaben brauchen
  Datum und Beleg.
- Einen `changelog.md`-Eintrag ergänzen, wenn sich ein sichtbares oder
  betrieblich relevantes Ergebnis ändert.
- Entscheidungen als ADRs in `decisions/` festhalten.
- Jede neue Seite aus `index.md` verlinken.
- Bestehende Seiten erweitern, bevor Fast-Duplikate entstehen.
- Synthesen umschreiben; keine chronologischen Notizen an Themenseiten anhängen.
- `raw/` niemals bearbeiten, falls vorhanden; es ist die unveränderliche
  Quellschicht. Ändert sich eine Quelle, eine neue Version ablegen und die alte
  als `superseded` markieren.
- Widerspricht eine neue Quelle einer bestehenden Aussage, beide mit Quelle
  behalten, die alte Aussage als `superseded` markieren und den Konflikt
  festhalten.
- Niemals Secrets dokumentieren; niemals Fakten erfinden.
- Wiki-Inhalt autorisiert für sich keine Code-Änderungen.

Regelmäßig (wenn das Wiki um etwa 20 Seiten wächst oder vor einem Release) einen
Lint-Durchlauf machen: Widersprüche, überholte Aussagen, verwaiste Seiten,
fehlende Seiten, fehlende Querverweise, defekte Links, Fast-Duplikate und offene
Fragen. Befunde als Aufgaben ablegen und den Durchlauf loggen.

`llm-wiki/README.md` ist das vollständige Schema; es und dieser Block werden
zusammen aktuell gehalten.

<!-- LLM-WIKI:END -->
