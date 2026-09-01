# Security Policy

## Supported releases

Security fixes are coordinated for the maintained ShieldPM `4.x` line. Deploy the latest available release in that
line and keep all runtime and base-image components current.

## Report a vulnerability privately

Report suspected vulnerabilities exclusively through
[GitHub Private Vulnerability Reporting](https://github.com/shedowe19/ShieldPM/security/advisories/new).

Do not open a public issue, discussion or pull request containing exploit details, credentials, private deployment
data or proof-of-concept code. Include the affected component, prerequisites, impact, reproducible steps and a safe way
to validate a fix. Remove real secrets and personal data from logs and attachments.

Maintainers will acknowledge the report when it is reviewed, clarify missing information, assess affected releases and
coordinate remediation and disclosure with the reporter. Timing depends on severity, complexity and upstream
dependencies; this policy does not promise a fixed response or release SLA. Please allow a coordinated fix before
publishing technical details.

## Operational incidents

If a token, password or private key may be exposed, revoke or rotate it immediately and inspect the audit trail. The
private advisory is for product vulnerabilities, not emergency access to an individual deployment.
