# GitOps Synchronization

GitOps stores a deliberately limited, secret-free representation of ShieldPM runtime configuration in a Git
repository. The database remains the source of truth; importing a snapshot is an explicit, validated operation.

## Supported scope

Snapshot v2 exports only public fields for these object types:

- Proxy Hosts
- Redirection Hosts
- Dead Hosts
- Streams

It does **not** export passwords, access-list credentials, API tokens, private keys, certificate material, DDNS secrets,
Terminal credentials, user authentication, AI provider keys or Git credentials. Values that look secret-bearing cause
the export to fail instead of being replaced with a reusable placeholder.

## Repository layout

```text
shieldpm-config/
├── manifest.json
├── proxy-hosts/
├── redirection-hosts/
├── dead-hosts/
└── streams/
```

Each object is written to a deterministic `<id>.yaml` file (JSON is used as the YAML-compatible serialization). The
manifest declares `version: 2`, projection `shieldpm-public-config-v2`, completeness, counts, file size and a SHA-256
digest for every artifact.

## Configuration

Open **Settings → GitOps**.

| Setting        | Description                                               |
| :------------- | :-------------------------------------------------------- |
| Repository URL | HTTPS repository URL without embedded credentials         |
| Branch         | Explicit branch name                                      |
| Authentication | HTTPS Personal Access Token (PAT)                         |
| Auto-push      | Debounced export, commit and push after supported changes |
| Auto-pull      | Pull and verify on startup when deliberately enabled      |

Use a narrowly scoped token that can access only the intended repository. ShieldPM encrypts the PAT at rest and never
returns it to the UI. SSH remotes, local/file remotes, URL user information and unsafe branch names are rejected.

> [!IMPORTANT]
> A private repository is still recommended because snapshots reveal hostnames, upstream addresses, ports and routing
> relationships even though credentials are excluded.

## Export and push

1. ShieldPM reads all supported records in a database transaction.
2. It projects allow-listed fields into a new private temporary directory.
3. Every file and the manifest are durably written and then re-read through the import validator.
4. The verified snapshot directory is swapped into place with a recovery journal.
5. Only `shieldpm-config/` paths are staged; unrelated pre-staged changes abort the operation.
6. The commit is pushed over verified HTTPS.

An interrupted directory swap is completed or rolled back from the journal on the next start. Export permits at most
1,000 files and 32 MiB in total; individual artifacts are bounded by the manifest schema.

## Pull and verify

Remote content is cloned into a new temporary directory. Before it can replace the local snapshot ShieldPM verifies:

- the exact snapshot-v2 manifest shape and projection;
- allow-listed directories and regular files only;
- normalized, contained paths (no traversal, symlinks or special files);
- file count, per-file and total size limits;
- declared object kind/ID and strict JSON schema;
- SHA-256 digest and size for every artifact;
- absence of extra, missing, duplicate, secret-bearing or redaction-marker content.

The checked temporary tree is installed only after all validation succeeds, limiting path traversal, archive-bomb and
time-of-check/time-of-use risks.

## Dry run and import

Run **Dry Run** before applying a pulled snapshot. It executes the same validation and database/runtime preparation,
reports create/update/delete counts, then rolls back the transaction and restores staged runtime directories. It does
not reload Nginx.

A real import:

1. captures a bounded database recovery set;
2. stages the affected Nginx runtime directories;
3. writes a crash-recovery journal;
4. applies all database changes in one transaction under the importing user's ownership;
5. renders and validates the complete Nginx configuration;
6. reloads Nginx only after validation;
7. commits runtime directories and clears the journal.

If a step fails, ShieldPM restores database rows and runtime directories and revalidates/reloads the recovered Nginx
configuration when needed. On process interruption, startup recovery restores the pre-import state before accepting a
new GitOps operation. Recovery state is bounded to prevent an untrusted snapshot from causing unlimited memory or disk
use.

## Commit history and restore

History is bounded to the latest 50 commits. Restoring a commit checks out only the selected verified snapshot, runs
the same import transaction and reports rollback errors separately. A Git commit is not trusted merely because it is
present in the configured repository.

## Operational guidance

- Protect the target repository and branch with your Git provider's branch/ruleset controls.
- Store the PAT in ShieldPM only; never include it in the remote URL or snapshot.
- Keep independent `/data` and database-native backups. GitOps is a public configuration projection, not a full backup.
- Re-enter excluded credentials and certificate/private-key material after disaster recovery.
- Review the dry-run summary and the Git diff before applying an import.

Provider-side branch protection and rulesets must be configured in the Git host; ShieldPM cannot enforce them. For an
external MySQL/PostgreSQL database, retain an operator-verified native dump because an application payload rollback
cannot reverse an external database migration.

## Troubleshooting

### Connection failed

- Confirm the URL is HTTPS and contains no username/password.
- Verify the PAT is current and restricted to the intended repository.
- Confirm the branch exists and the deployment can reach the Git provider with valid TLS.

### Snapshot rejected

Do not bypass validation. Inspect the reported manifest/path/schema/digest error, regenerate the snapshot from a known
ShieldPM instance and review the diff. Hand-edited files must still satisfy the exact v2 schema.

### Recovery journal remains

Stop further imports, preserve `/data/gitops` and review backend logs. ShieldPM retries safe journal recovery at startup;
do not delete the journal or its referenced staging/backup directories while recovery is pending.

---

[🏠 Home](Home) | [🔒 Security](Security) | [💾 Backup & Restore](Backup-Restore)
