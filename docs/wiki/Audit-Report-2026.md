# ShieldPM Audit Notes (January 2026)

**Original snapshot date:** 2026-01-15 (labelled v3.5.1 in the original report). **Documentation review:** September 2026 against the current repository. This page records a historical assessment, not a current complete security audit. The original letter grade and blanket “zero vulnerabilities” verdict were not supported by reproducible test results on this page and should not be used as a security guarantee.

The current application has since changed substantially. Use the current [Security](Security), [Architecture](Architecture) and [API Documentation](API-Docs) pages, the source code and CI results for current behavior.

## Authentication and request protection

| Component                                                                                      | Verified behavior in the current source                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Token service](https://github.com/shedowe19/ShieldPM/blob/develop/backend/internal/token.js)  | Dummy bcrypt comparison helps reduce user-enumeration timing differences for absent users. This alone does not establish timing safety of the entire login path.                                                                                                                |
| [Password model](https://github.com/shedowe19/ShieldPM/blob/develop/backend/models/auth.js)    | bcryptjs hashes passwords with cost 13.                                                                                                                                                                                                                                         |
| [Token routes](https://github.com/shedowe19/ShieldPM/blob/develop/backend/routes/tokens.js)    | Failed attempts are tracked in `login_attempts` by IP and normalized login identity; blocking begins at five failures in a 15-minute window. A separate 30-request/15-minute rate limiter covers sensitive auth endpoints; the API has a global 500-request/15-minute IP limit. |
| [Access layer](https://github.com/shedowe19/ShieldPM/blob/develop/backend/lib/access.js)       | Applies resource permissions after loading current token and user state.                                                                                                                                                                                                        |
| [CSRF in the Express app](https://github.com/shedowe19/ShieldPM/blob/develop/backend/app.js)   | Uses `csrf-csrf` double-submit protection for state-changing requests with specific setup and auth exceptions. The browser client sends `X-XSRF-TOKEN` for applicable requests.                                                                                                 |
| [Auth cookies](https://github.com/shedowe19/ShieldPM/blob/develop/backend/lib/auth-cookies.js) | Access and refresh cookies are HttpOnly and SameSite Strict; `secure` depends on the effective HTTPS request. The UI does not store its access token in localStorage.                                                                                                           |
| [Encryption](https://github.com/shedowe19/ShieldPM/blob/develop/backend/lib/encryption.js)     | AES-256-GCM uses persistent key material from `/data/shieldpm/keys.json`.                                                                                                                                                                                                       |

## Architecture and operations

- Express routes validate applicable inputs, check permissions and call services and Objection.js models. Counts of files and lines recorded in the original report were specific to that time and are not a stable architecture property.
- The [Nginx configuration engine](https://github.com/shedowe19/ShieldPM/blob/develop/backend/internal/nginx.js) renders LiquidJS templates. It validates with `nginx -tq` before signaling a reload. Host changes are serialized; a failed host file is moved aside and its prior backup restored. There is **no global two-second reload debounce**; Docker auto discovery batches its own changes separately.
- The default SQLite database lives at `/data/shieldpm/database.sqlite`. MySQL/MariaDB and PostgreSQL are supported alternatives; moving existing data between engines has an explicit, schema-checked import path, not an automatic migration for every deployment.
- Analytics uses local JSON access logs and stores detailed request data, including client IPs, plus aggregates in the database. Retention and Nginx log rotation are separate mechanisms.

## Scope of the original recommendations

The original document suggested reviewing access-list password hashing, encrypted AI key rotation and Cloudflared token storage. These were recommendations, not verified vulnerabilities. Its statements about “all CRUD operations” being audited, a fixed memory cap on the rate limiter, a 2-second Nginx reload delay and blanket resilience ratings were not substantiated for current code. A real security assessment would need a defined commit, threat model, test evidence and retesting of each affected integration.

---

[🏠 Home](Home) | [🐞 Report a Bug](https://github.com/shedowe19/ShieldPM/issues)
