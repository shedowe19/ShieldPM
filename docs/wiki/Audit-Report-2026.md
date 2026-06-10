# 🛡️ ShieldPM Full-System Audit Report

| Field | Value |
| --- | --- |
| Date | 2026-06-10 16:05 UTC |
| Audited revision | `develop` @ `8fd87597c5953ce561b765be89f851c518687832` |
| ShieldPM version | `4.3.2` |
| Report status | Complete point-in-time source, dependency, test, deployment, and documentation audit for the public wiki. |
| Supersedes | The old 2026 report dated 2026-01-15. That report claimed no Critical/High issues; this refreshed audit does **not** support that conclusion for the current `develop` branch. |

---

## Executive Summary

ShieldPM has a strong functional base: authentication, CSRF handling, refresh-token rotation, route-level permission checks, OpenAPI schema validation, frontend tests, backend tests, locale coverage, and production build all passed during this audit.

However, the full-system review found several **deployment and runtime-safety risks** that must be treated as release blockers or hardening priorities before calling the current `develop` state production-hardened.

| Severity    | Count |
| ----------- | ----: |
| Critical    |     1 |
| High        |     4 |
| Medium/High |     2 |
| Medium      |     7 |
| Low/Medium  |     3 |

**Overall verdict:** **B / Needs hardening before production-default claims**

- ✅ Application-level auth/session fundamentals are good.
- ✅ Automated tests and schema/build checks are green.
- ✅ i18n key parity is good across all shipped locale files.
- ⚠️ Nginx validation is currently disabled and invalid config rollback is therefore not real.
- ⚠️ Default/easy deployments are root + host-network oriented.
- ⚠️ Native installer/updater and supply-chain inputs are too mutable for a hardened release path.
- ⚠️ Several operational features are powerful enough to require clearer opt-in boundaries.

---

## Audit Scope

This audit covered the current repository checkout, not a live production instance.

### Included

- Backend routes, internals, models, migrations, permissions, OpenAPI schema.
- Auth flows: login, JWT, refresh-token rotation, logout, 2FA, passkeys, Duo, cookies, CSRF.
- Nginx config generation, templates, reload flow, Docker auto-discovery, GitOps, DDNS, WireGuard.
- Frontend routing, API client, tests, build output, i18n/locales, hardcoded text scan.
- Dockerfile, Compose files, rootfs scripts, native installer, updater, systemd service, optional sidecars.
- GitHub workflows and public wiki/documentation consistency.
- Static pattern scans for secrets, shell execution, SQL/raw interpolation, DOM injection, storage usage, and i18n gaps.

### Not included / limitations

- No authenticated live penetration test against a running ShieldPM deployment.
- No container runtime smoke test because Docker Compose CLI/plugin was not available in the audit environment.
- No external bug-bounty style exploit chain was attempted.
- No secrets from local production data were read or included.
- Some findings are risk-based source-code observations; exploitability depends on deployment mode, enabled integrations, and operator configuration.

---

## Codebase Inventory

| Metric                                        |                                                     Value |
| --------------------------------------------- | --------------------------------------------------------: |
| Counted files excluding dependency/build dirs |                                                      1210 |
| Pygount-counted files                         |                                                     1,199 |
| Code lines                                    |                                                    57,740 |
| Comment lines                                 |                                                    14,929 |
| Backend dependencies                          |                                        42 runtime / 7 dev |
| Frontend dependencies                         |                                       63 runtime / 27 dev |
| API mounts                                    |                                                        26 |
| Extracted Express routes                      |                                                       123 |
| OpenAPI paths                                 |                                                        63 |
| Migrations                                    |                                                        76 |
| Internal backend modules                      |                                                        39 |
| ORM models                                    |                                                        27 |
| Env variables inventoried                     |                                                        99 |
| Locale files                                  | 13 (`bg, de, en, es, it, ja, ko, nl, pl, ru, sk, vi, zh`) |
| Flattened locale keys per locale              |                                                       652 |

### Largest code categories from `pygount`

| Language/category      | Files | Code lines |
| ---------------------- | ----: | ---------: |
| TSX                    |   159 |     17,107 |
| JSON                   |   194 |     15,523 |
| JavaScript+Genshi Text |   131 |     12,210 |
| JavaScript             |   100 |      5,159 |
| TypeScript             |   161 |      3,433 |
| Bash                   |     9 |      1,217 |
| YAML                   |    22 |      1,193 |

---

## Verification Matrix

| Check                     | Result                                                                  | Evidence                                                    |
| ------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------- |
| Git baseline              | ✅ Clean source baseline before report work; `develop` @ `8fd87597c595` | `git rev-parse HEAD`, `git status`                          |
| OpenAPI schema validation | ✅ Pass                                                                 | `backend/node validate-schema.js` → `❯ Schema is valid`     |
| Backend tests             | ✅ Pass                                                                 | `yarn test --run` → 22 files / 119 tests passed             |
| Frontend locale check     | ✅ Pass                                                                 | `node check-locales.cjs` → `Locale check passed`            |
| Frontend tests            | ✅ Pass                                                                 | `yarn test --run` → 7 files / 36 tests passed               |
| Frontend production build | ✅ Pass                                                                 | `yarn build` succeeded                                      |
| Frontend dependency audit | ✅ Pass                                                                 | `yarn npm audit --recursive --all` → no audit suggestions   |
| Backend dependency audit  | ⚠️ Advisory                                                             | `prebuild-install` deprecation via `better-sqlite3@12.10.0` |
| Biome check               | ⚠️ 3 info-level findings                                                | Node built-in imports without `node:` protocol              |
| Static app DOM scan       | ✅ No app `dangerouslySetInnerHTML`                                     | frontend scan found 0 in `frontend/src`                     |
| i18n parity               | ✅ Equal key counts                                                     | 13 locale files × 652 flattened keys                        |
| Bundle size               | ⚠️ Warning                                                              | main `index` chunk 2,257.12 kB minified / 702.04 kB gzip    |

---

## Strengths Confirmed

### Authentication and authorization

- Password-login timing mitigation exists via valid cost-13 dummy bcrypt hash in `backend/internal/token.js:13-17` and fake compare paths for missing users/auth rows.
- Login attempts are persisted and rate-limited by IP and login identifier in `backend/routes/tokens.js:33-159`.
- Access tokens are short-lived (`15m`) and refresh tokens rotate (`30d`) in `backend/internal/auth-session-service.js:10-11`.
- Refresh-token replay detection revokes the whole token family in `backend/internal/auth-session-service.js:176-204`.
- Permission checks load token user, validate roles/scopes, and use AJV schema-backed `access.can(...)` in `backend/lib/access.js:41-92` and `222-286`.
- Many routes call `res.locals.access.can(...)` before CRUD actions; permission visibility is used for owned-resource filtering in several Nginx/integration routes.

### CSRF, cookies, and headers

- Global Helmet middleware is active in `backend/app.js:146-166`.
- CSRF uses `csrf-csrf` double-submit cookie with 64-byte token size in `backend/app.js:168-185`.
- Mutating API calls include `X-XSRF-TOKEN` from the frontend API client in `frontend/src/api/backend/base.ts:38-45` and `194-196`.
- Access/refresh cookies are HTTP-only and SameSite=strict; refresh cookie is scoped to `/api/tokens` in `backend/lib/auth-cookies.js:24-40`.

### 2FA / passkeys

- TOTP, YubiKey OTP, backup codes, passkeys/WebAuthn, and Duo are implemented in `backend/internal/2fa-service.js`.
- 2FA management routes require auth and enforce self-or-admin semantics in `backend/routes/2fa.js:31-60`.
- Passkey registration/authentication verifies challenge, origin, RP ID, and counter in `backend/internal/2fa-service.js:339-468`.
- Backup codes are bcrypt-hashed and consumed one time.

### API/schema/test health

- OpenAPI schema compiles and validates.
- Backend tests cover DDNS SSRF, tokens, 2FA, GitOps validation, Nginx helpers, zstd proxy host behavior, auth sessions, and token hashing.
- Frontend tests cover login 2FA, security UI, localization utilities, analytics utilities, table formatters, footer, and dashboard certificate widget.
- Locale files are key-complete across 13 languages.

### GitOps/export safeguards

- GitOps public config API redacts encrypted credentials in `backend/internal/gitops.js:177-182`.
- Import uses an allowlist per model in `backend/internal/gitops.js:31-92`.
- GitOps warns when a configured remote appears public in `backend/internal/gitops.js:287-306`.
- Certificate export excludes private key files in `backend/internal/gitops.js:472-480`, `499-516`, and `531-560`.

---

## Prioritized Findings

| ID   | Severity        | Finding                                                                                                               | Recommendation                                                                                                                              |
| ---- | --------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| F-01 | **Critical**    | Nginx runtime validation disabled; rollback/success metadata can be wrong                                             | Re-enable nginx -t before marking configs online/reloading; stage+validate+rollback.                                                        |
| F-02 | **High**        | WireGuard init flushes global iptables chains under host/root deployment                                              | Gate WireGuard explicitly; use ShieldPM-owned chains instead of global flushes.                                                             |
| F-03 | **High**        | Mutable/unverified supply-chain inputs across images, binaries, updater, installer and actions                        | Pin by digest/SHA, verify checksums/signatures, separate develop/nightly from stable docs.                                                  |
| F-04 | **High**        | Native installer/updater perform broad root-level OS and filesystem mutations with limited rollback                   | Make OS upgrade explicit; add dry-run, backups, rollback and systemd hardening.                                                             |
| F-05 | **High**        | Default/easy Docker deployment uses host networking and root-first runtime                                            | Provide hardened bridge-network compose as default; host/root as advanced profile.                                                          |
| F-06 | **Medium/High** | Tracked runtime .env path and compose inline secret model need hardening                                              | Remove tracked rootfs/data/.env; generate runtime env; add .dockerignore; support \_FILE/Docker secrets; require CSRF_SECRET in production. |
| F-07 | **Medium/High** | GitOps export may publish sensitive operational configuration if remote repo is public                                | Keep strong public-repo warning; redact tokens/secrets in all exported settings; add allowlist and private-repo enforcement option.         |
| F-08 | **Medium**      | Custom DDNS SSRF validation does not resolve hostnames or block all IPv6/link-local/private DNS targets               | Resolve DNS and validate every A/AAAA result before fetch; block private/reserved/link-local/metadata ranges and redirects.                 |
| F-09 | **Medium**      | Docker auto-discovery is opt-in by environment but still auto-adds local socket and accepts plain tcp:// Docker hosts | Require explicit enable flag; reject plain tcp:// unless unsafe flag set; prefer TLS/SSH; document host-root impact.                        |
| F-10 | **Medium**      | Demo-mode SSRF protections are not production controls and do not resolve DNS                                         | Document as demo-only; add production validation for high-risk custom upstream/URL features where appropriate.                              |
| F-11 | **Medium**      | CSRF and auth cookies are solid but production setup allows missing persistent CSRF_SECRET                            | Fail/warn harder for production when CSRF_SECRET is unset; consider always secure cookies when public URL is HTTPS.                         |
| F-12 | **Medium**      | Frontend still contains hardcoded English UI strings and native confirm dialogs despite full locale files             | Replace native confirms with localized modal component and move labels/errors to locale keys.                                               |
| F-13 | **Medium**      | Frontend bundle builds but main chunks are large                                                                      | Add route/component-level dynamic imports for chart-heavy/admin pages; enforce bundle budget.                                               |
| F-14 | **Medium**      | 2FA/WebAuthn/Duo flows are comprehensive but Duo state is not persisted/verified in the shown backend flow            | Persist Duo state bound to pending token/session and verify returned state/code pairing server-side.                                        |
| F-15 | **Low/Medium**  | Biome reports 3 style infos for Node built-in import protocol                                                         | Apply safe node: import protocol fixes.                                                                                                     |
| F-16 | **Low/Medium**  | Backend dependency audit reports maintainedness advisory via better-sqlite3 dependency chain                          | Track upstream better-sqlite3/prebuild-install replacement; no direct exploit found by Yarn audit.                                          |
| F-17 | **Low/Medium**  | No .dockerignore found                                                                                                | Add .dockerignore for .git, node_modules, local env/secrets, caches, planning/output artifacts.                                             |

---

## Detailed Findings

### F-01 — Critical — Nginx runtime validation disabled; rollback/success metadata can be wrong

**Area:** Runtime / Nginx safety
**Impact:** Bad generated or custom Nginx config can be accepted as online; rollback metadata can show success even though real Nginx reload/test would fail.
**Evidence:**

- `backend/internal/nginx.js:48-89`
- `backend/internal/nginx.js:96-100`
- `backend/internal/nginx.js:140-141`
- `backend/templates/_proxy_logic.conf:471`
- `backend/templates/proxy_host.conf:358`

**Recommendation:** Re-enable nginx -t before marking configs online/reloading; stage+validate+rollback.

### F-02 — High — WireGuard init flushes global iptables chains under host/root deployment

**Area:** Network / firewall safety
**Impact:** On host-network/root/native installs, startup can disrupt firewall/NAT rules outside ShieldPM and affect unrelated services.
**Evidence:**

- `backend/index.js:57-59`
- `backend/internal/wireguard.js:331-361`
- `backend/internal/wireguard.js:224-227`
- `compose.yaml:21`
- `compose.yaml:141-158`

**Recommendation:** Gate WireGuard explicitly; use ShieldPM-owned chains instead of global flushes.

### F-03 — High — Mutable/unverified supply-chain inputs across images, binaries, updater, installer and actions

**Area:** Supply chain
**Impact:** A changed upstream tag, binary, script, or workflow action can alter builds/releases without an auditable digest/checksum boundary.
**Evidence:**

- `Dockerfile:31-38`
- `Dockerfile:52`
- `compose.yaml:18`
- `compose.easy.yaml:4`
- `rootfs/usr/local/bin/update-shieldpm:98-121`
- `scripts/install.sh:294,315-316,369-379,443-450,537-551`
- `.github/workflows/wiki-sync.yml:26-31`

**Recommendation:** Pin by digest/SHA, verify checksums/signatures, separate develop/nightly from stable docs.

### F-04 — High — Native installer/updater perform broad root-level OS and filesystem mutations with limited rollback

**Area:** Native install/update safety
**Impact:** Native/LXC install/update failures can leave the host with mixed versions or unexpectedly upgraded OS packages.
**Evidence:**

- `scripts/install.sh:25-33`
- `scripts/install.sh:81-94`
- `scripts/install.sh:629-637`
- `rootfs/usr/local/bin/update-shieldpm:125-186`
- `rootfs/usr/lib/systemd/system/shieldpm.service:6-16`

**Recommendation:** Make OS upgrade explicit; add dry-run, backups, rollback and systemd hardening.

### F-05 — High — Default/easy Docker deployment uses host networking and root-first runtime

**Area:** Deployment hardening
**Impact:** A compromise in the app container has a larger blast radius because the default path combines host networking, root-first entrypoint, and optional elevated capabilities.
**Evidence:**

- `compose.yaml:21`
- `compose.easy.yaml:6`
- `compose.easy.yaml:15-16`
- `rootfs/usr/local/bin/envs.sh:17-22`
- `Dockerfile:95`

**Recommendation:** Provide hardened bridge-network compose as default; host/root as advanced profile.

### F-06 — Medium/High — Tracked runtime .env path and compose inline secret model need hardening

**Area:** Secrets / configuration
**Impact:** Runtime secrets can be accidentally baked/copied/exposed; missing persistent CSRF secret invalidates tokens after restarts and is weak production hygiene.
**Evidence:**

- `rootfs/data/.env`
- `Dockerfile:66`
- `rootfs/usr/local/bin/envs.sh:32-52`
- `backend/app.js:41-46`
- `rootfs/usr/local/bin/start.sh:556-560`

**Recommendation:** Remove tracked rootfs/data/.env; generate runtime env; add .dockerignore; support \_FILE/Docker secrets; require CSRF_SECRET in production.

### F-07 — Medium/High — GitOps export may publish sensitive operational configuration if remote repo is public

**Area:** GitOps / backup safety
**Impact:** GitOps is powerful and useful, but exported operational config can become sensitive if the target repository is public or loosely permissioned.
**Evidence:**

- `backend/internal/gitops.js:177-182`
- `backend/internal/gitops.js:399-420`
- `backend/internal/gitops.js:451-565`
- `backend/internal/gitops.js:287-306`

**Recommendation:** Keep strong public-repo warning; redact tokens/secrets in all exported settings; add allowlist and private-repo enforcement option.

### F-08 — Medium — Custom DDNS SSRF validation does not resolve hostnames or block all IPv6/link-local/private DNS targets

**Area:** SSRF / outbound network
**Impact:** Custom DDNS URLs that resolve to internal addresses after DNS lookup or redirects can bypass the current hostname-only/IP-literal checks.
**Evidence:**

- `backend/internal/ddns.js:13-47`
- `backend/internal/ddns.js:138-154`

**Recommendation:** Resolve DNS and validate every A/AAAA result before fetch; block private/reserved/link-local/metadata ranges and redirects.

### F-09 — Medium — Docker auto-discovery is opt-in by environment but still auto-adds local socket and accepts plain tcp:// Docker hosts

**Area:** Docker daemon control
**Impact:** Docker daemon access is host-root equivalent; accepting plain TCP or local socket access should require explicit risk acknowledgement.
**Evidence:**

- `backend/internal/docker.js:43-57`
- `backend/internal/docker.js:97-114`
- `compose.yaml:125-127`

**Recommendation:** Require explicit enable flag; reject plain tcp:// unless unsafe flag set; prefer TLS/SSH; document host-root impact.

### F-10 — Medium — Demo-mode SSRF protections are not production controls and do not resolve DNS

**Area:** Demo-mode security boundary
**Impact:** Demo-mode controls prevent public demo abuse but should not be mistaken for production SSRF/network egress policy.
**Evidence:**

- `backend/lib/express/demo.js:12-47`
- `backend/lib/express/demo.js:96-126`

**Recommendation:** Document as demo-only; add production validation for high-risk custom upstream/URL features where appropriate.

### F-11 — Medium — CSRF and auth cookies are solid but production setup allows missing persistent CSRF_SECRET

**Area:** Auth / CSRF
**Impact:** The CSRF implementation exists and works, but production deployments should not depend on restart-random secrets or ambiguous HTTPS detection.
**Evidence:**

- `backend/app.js:41-46`
- `backend/app.js:168-185`
- `backend/lib/auth-cookies.js:24-40`
- `frontend/src/api/backend/base.ts:38-45,194-196`

**Recommendation:** Fail/warn harder for production when CSRF_SECRET is unset; consider always secure cookies when public URL is HTTPS.

### F-12 — Medium — Frontend still contains hardcoded English UI strings and native confirm dialogs despite full locale files

**Area:** Frontend / i18n
**Impact:** Remaining hardcoded English text breaks localization expectations and native browser confirms are not theme/i18n/a11y consistent.
**Evidence:**

- `frontend/src/modals/AccessListModal.tsx:399-684`
- `frontend/src/pages/Nginx/CloudflaredTunnels.tsx:48`
- `frontend/src/pages/Nginx/TorOnionServices.tsx:43`
- `frontend/src/pages/Nginx/WireguardTunnels.tsx:92`
- `frontend/src/pages/Dashboard/DashboardNotesWidget.tsx:29`

**Recommendation:** Replace native confirms with localized modal component and move labels/errors to locale keys.

### F-13 — Medium — Frontend bundle builds but main chunks are large

**Area:** Frontend performance
**Impact:** Large chunks increase load time and make regressions harder to spot; chart/admin code should be split more aggressively.
**Evidence:**

- `frontend-checks.log: Vite warning; index-RWlRVlzd.js 2,257.12 kB minified / 702.04 kB gzip`
- `vendor-charts-DANu0Gm6.js 484.65 kB / 145.67 kB gzip`

**Recommendation:** Add route/component-level dynamic imports for chart-heavy/admin pages; enforce bundle budget.

### F-14 — Medium — 2FA/WebAuthn/Duo flows are comprehensive but Duo state is not persisted/verified in the shown backend flow

**Area:** 2FA / Duo
**Impact:** Duo login flow generates a state, but the audited backend path does not show durable server-side state binding before code exchange.
**Evidence:**

- `backend/internal/2fa-service.js:535-545`
- `backend/routes/tokens.js:620-643`
- `backend/routes/tokens.js:658-680`

**Recommendation:** Persist Duo state bound to pending token/session and verify returned state/code pairing server-side.

### F-15 — Low/Medium — Biome reports 3 style infos for Node built-in import protocol

**Area:** Code quality
**Impact:** Style-only maintainability issue; trivial to fix with Biome-safe imports.
**Evidence:**

- `backend/db.js:2`
- `backend/internal/certificate.js:2`
- `backend/migrate.js:2`

**Recommendation:** Apply safe node: import protocol fixes.

### F-16 — Low/Medium — Backend dependency audit reports maintainedness advisory via better-sqlite3 dependency chain

**Area:** Dependency hygiene
**Impact:** No direct vulnerability was reported, but the dependency chain contains a maintainedness advisory to track.
**Evidence:**

- `backend-checks.log: prebuild-install 7.1.3 deprecation via better-sqlite3@12.10.0`

**Recommendation:** Track upstream better-sqlite3/prebuild-install replacement; no direct exploit found by Yarn audit.

### F-17 — Low/Medium — No .dockerignore found

**Area:** Build hygiene
**Impact:** Without .dockerignore, local build context can include caches, untracked artifacts, or accidental secrets.
**Evidence:**

- `repository file search: no .dockerignore`
- `Dockerfile:7,26,66`

**Recommendation:** Add .dockerignore for .git, node_modules, local env/secrets, caches, planning/output artifacts.

---

## Area-by-Area Notes

### Backend/API

**Positive:** The backend has good core auth primitives, schema validation, tests, and route-level authorization patterns. The most important tested auth paths passed.

**Main risks:** Runtime integrations are powerful and not always gated strongly enough. Nginx, WireGuard, Docker, GitOps, DDNS, and native updates can affect host/network state or external systems.

**Recommendations:**

1. Treat Nginx validation restoration as the first blocker.
2. Split high-risk integrations behind explicit feature flags and deployment-profile warnings.
3. Add route permission regression tests for every mounted API path.
4. Expand SSRF validation into shared utility with DNS resolution, IP range checks, redirect checks, timeout limits, and allow/deny policy.
5. Add stronger production-mode config validation for `CSRF_SECRET`, cookie secure behavior, and public URL/trust-proxy correctness.

### Frontend/UI/i18n

**Positive:** Frontend tests pass, production build succeeds, route-level lazy loading exists, locale key parity is complete, and no app-level `dangerouslySetInnerHTML` was found.

**Main risks:** Some recent/admin integration UI still contains hardcoded English labels and native confirm dialogs. Bundle chunks are large.

**Recommendations:**

1. Replace all native `confirm(...)` with localized modal flows.
2. Move remaining labels/help text/error titles into locale keys.
3. Add CI check for hardcoded JSX text in `frontend/src`.
4. Split chart/admin/vendor-heavy areas more aggressively and enforce bundle budgets.

### Deployment/DevOps

**Positive:** Multi-stage Docker build, healthcheck, runtime env validation, `/data` persistence model, and broad CI coverage exist.

**Main risks:** Default examples are optimized for convenience and feature coverage rather than least privilege. Native install/update scripts mutate the host broadly. Supply-chain inputs remain mutable.

**Recommendations:**

1. Provide a hardened bridge-network production compose as the default documented path.
2. Keep host-network/root/NET_ADMIN/OpenAppSec IPC examples as advanced profiles with warnings.
3. Pin images/actions/downloads and verify checksums.
4. Add Docker image smoke tests before publish/release.
5. Add `.dockerignore` and remove tracked runtime `.env` path.

### Documentation/wiki

**Positive:** Public wiki is now closer to current `develop` after the previous refresh.

**Main risks:** README/wiki/release text still needs to consistently distinguish stable vs `develop`, easy vs hardened deployment, and app-only LXC vs sidecar-enabled stacks.

**Recommendations:**

1. Add a hardening page that maps each high-risk feature to required permissions/capabilities.
2. Make installation pages explicitly label `develop` as rolling.
3. Document that Demo Mode SSRF protections are demo-only.
4. Add a checklist before users enable Docker socket, WireGuard, OpenAppSec, CrowdSec, GitOps, or native updater.

---

## Recommended Remediation Plan

### Phase 0 — Release blockers

1. Re-enable `nginx -t` validation and real rollback in `backend/internal/nginx.js`.
2. Stop global WireGuard iptables flushes; move to ShieldPM-owned chains and explicit enablement.
3. Add `.dockerignore` and remove tracked `rootfs/data/.env` from the image/source path.
4. Pin/verify supply-chain inputs for production docs and release artifacts.

### Phase 1 — Security hardening

1. Require persistent `CSRF_SECRET` or fail loudly in production mode.
2. Harden DDNS/custom URL SSRF validation with DNS resolution and redirect policy.
3. Add Docker auto-discovery explicit unsafe-mode gating for socket/plain TCP.
4. Persist and verify Duo state server-side before completing Duo login.
5. Add route permission test coverage for every API mount and mutating route.

### Phase 2 — Deployment hardening

1. Publish hardened bridge-network compose profile.
2. Add `cap_drop`, `security_opt: no-new-privileges`, resource limits, and narrower writable volumes where compatible.
3. Add native installer dry-run/rollback and avoid default OS `dist-upgrade`/full `upgrade`.
4. Add runtime smoke test in CI: boot container, healthcheck, schema endpoint, `nginx -t`, minimal login/setup path if possible.

### Phase 3 — UX/i18n/performance

1. Localize remaining hardcoded English text and native confirmation prompts.
2. Add hardcoded-text CI guard.
3. Add frontend bundle budget and split chart/vendor-heavy areas.
4. Apply Biome `node:` import protocol style fixes.

---

## Final Verdict

ShieldPM `develop` at `8fd87597c595` is **functionally healthy** based on automated schema/test/build checks, but it is **not yet production-hardened by default**.

The highest-value fixes are operational safety fixes, not basic app-auth fixes:

1. restore Nginx config validation,
2. reduce host/root/network blast radius,
3. pin and verify supply-chain inputs,
4. make powerful integrations explicit opt-ins,
5. complete remaining i18n and deployment documentation hardening.

Once the Critical/High findings are closed and CI includes runtime smoke tests, the project can credibly move back toward an A-grade security posture.
