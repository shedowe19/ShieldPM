# AI Agent Guidelines — ShieldPM

> **Read `.cursorrules` first** for detailed coding standards and architecture reference.  
> **Read `GEMINI.md` for** the authoritative project context (versions, paths, integrations).

> [!CAUTION]
> **`agent.md` ist PFLICHTLEKTÜRE!** Diese Datei enthält die verbindlichen Regeln für das interne LLM-Wiki (`docs/wiki-intern/`).
> Jeder Agent **MUSS** `agent.md` vor jeder Arbeitssitzung lesen und die darin definierten Wiki-Pflichtprüfungen (vor und nach jeder Aufgabe) einhalten.
> Bei Nichtbeachtung wird die Wiki-Wissensbasis veralten und unbrauchbar.

## 🎯 Available Skills

> [!IMPORTANT]
> **Skills are constantly updated!** Before any task:
>
> 1. Open `.agent/skills/CATALOG.md`
> 2. Search for skills matching your current task
> 3. Read the relevant `SKILL.md` files
> 4. Follow the best practices described

### How to Find Skills

1. **By keyword search**: Search CATALOG.md for relevant terms
2. **By category**: Browse the categorized skill list
3. **By trigger**: Look at the "Triggers" column for matching keywords

### Helpful Keywords for This Project

| Area           | Keywords to Search                                           |
| -------------- | ------------------------------------------------------------ |
| Backend API    | `nodejs`, `backend`, `express`, `api`, `rest`                |
| Database       | `database`, `sql`, `migration`, `knex`, `objection`          |
| Frontend UI    | `react`, `typescript`, `tailwind`, `radix`, `ui`, `frontend` |
| State Mgmt     | `react`, `query`, `state`, `zustand`                         |
| Testing        | `testing`, `vitest`, `jest`, `e2e`, `playwright`             |
| Docker & Infra | `docker`, `deployment`, `ci`, `cd`, `bash`, `linux`          |
| Security       | `security`, `auth`, `jwt`, `waf`                             |
| AI Integration | `ai`, `llm`, `gemini`, `agent`, `prompt`                     |
| Telegram Bot   | `telegram`, `bot`, `chatops`                                 |
| Git / DevOps   | `git`, `gitops`, `deployment`, `bash`, `scripting`           |
| Nginx / Config | `bash`, `linux`, `performance`, `deployment`                 |
| Code Quality   | `refactor`, `clean`, `code`, `review`, `audit`, `biome`      |
| Error Handling | `error`, `handling`, `debugging`                             |
| i18n           | `i18n`, `localization`                                       |

## Project Context

### Overview

ShieldPM is a security-focused Nginx Proxy Manager fork (v4.3.2). It manages reverse proxies via a web UI, with deep integrations for WAF (ModSecurity, OpenAppSec), IPS (CrowdSec), ChatOps (Telegram), AI assistants, GitOps, Tor onion services, Cloudflare Tunnels, and DDNS.

### Key Files

| File                             | Purpose                                                                   |
| -------------------------------- | ------------------------------------------------------------------------- |
| `GEMINI.md`                      | **Source of truth** for AI agent context                                  |
| `agent.md`                       | **PFLICHT** — Wiki-Pflege-Regeln, Pflichtprüfungen vor/nach jeder Aufgabe |
| `docs/wiki-intern/`              | **Internes LLM-Wiki** — Langzeitgedächtnis des Projekts (Deutsch)         |
| `backend/internal/nginx.js`      | Nginx config generation engine                                            |
| `backend/internal/proxy-host.js` | Proxy host CRUD logic                                                     |
| `backend/models/proxy_host.js`   | Objection.js model for proxy hosts                                        |
| `backend/templates/*.conf`       | EJS templates for Nginx vhosts                                            |
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

- **External database rollback**: Application rollback cannot restore MySQL/PostgreSQL; operators need a verified native dump.
- **Base image ownership**: Nginx binary/compile changes belong to `shieldpm-nginx`. A moving base-image tag cannot be
  made reproducible here until the external image publishes a supported digest.
- **Provider controls**: GitHub branch protection and rulesets are configured in GitHub, not from repository code.

### Gotchas

- Boolean fields in SQLite are stored as `0`/`1` integers — the Objection.js model handles conversion. Don't pass `true`/`false` to raw queries.
- The `domain_names` field on proxy hosts is derived from the `host_domains` relation in `$afterGet()`. Don't write to `domain_names` directly in the DB.
- Candidate Nginx configuration is staged and checked with `nginx -t` before reload; mutations compensate on failure.
- `install.sh` must handle both Debian and Ubuntu variants — test parser/collection downloads with raw GitHub URLs.

### Avoid

- Introducing new UI component libraries (use shadcn/ui + Radix)
- Using `require()` anywhere (the project is ESM)
- Storing state outside `/data/` (Docker volumes expect it)
- Writing raw SQL in service code (use Objection.js query builder)
- Skipping the `access` parameter in internal service methods
