# Security Policy

## Supported versions

Security fixes are provided for the current `4.4.x` release line. Older release lines are not maintained. Because ShieldPM is self-hosted, operators are responsible for applying updates and for the security of their own deployment.

## Reporting a vulnerability

Please report suspected vulnerabilities privately through GitHub Security Advisories:

- https://github.com/shedowe19/ShieldPM/security/advisories/new

Do not open a public issue for a suspected vulnerability. Include:

- the affected version and deployment method (Docker, LXC, native),
- the affected component and, if possible, the file or endpoint,
- reproduction steps or a proof of concept,
- the impact you believe is possible,
- any suggested fix or mitigation.

The PGP key published in `.well-known/security.txt` can be used for encrypted reports.

## Response targets

| Step | Target |
|---|---|
| Acknowledge receipt | 3 working days |
| Initial triage and severity assessment | 7 working days |
| Fix or documented mitigation for critical/high issues | 30 days |
| Coordinated disclosure | 90 days after triage, or earlier by agreement |

These are targets, not a warranty. Complex issues that require an upstream fix (for example in Nginx, CrowdSec, OpenAppSec or a base image) may take longer; the reporter will be kept informed.

## Scope

In scope:

- the ShieldPM backend, frontend, templates and installers in this repository,
- the published ShieldPM container images and release artefacts,
- authentication, authorization, session handling and the management API,
- proxy-host configuration, Nginx/Lua rendering and certificate handling.

Out of scope:

- vulnerabilities in third-party services or in the operator's own infrastructure,
- misconfigurations that are explicitly documented as unsafe,
- social engineering and physical attacks,
- denial-of-service tests against systems you do not own,
- reports that require a compromised administrator account unless the report shows a privilege boundary being crossed.

## Safe harbour

Good-faith research that follows this policy, avoids privacy violations and does not degrade service for others will not be pursued legally by the project. Test only against your own installation or a dedicated test system.

## No certification claim

ShieldPM is not certified under ISO 27001, SOC 2, PCI DSS or the EU Cyber Resilience Act. This policy describes the project's vulnerability-handling process; it is not a compliance certificate. Operators in regulated environments remain responsible for their own controls, contracts and audit evidence.
