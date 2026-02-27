# Glossary

Common terms used in ShieldPM and networking.

---

## A

- **A Record:** A DNS record that points a domain name to an IPv4 address.
- **AAAA Record:** A DNS record that points a domain name to an IPv6 address.
- **Access List (ACL):** A set of rules (Basic Auth, IP Allow/Deny, mTLS) that controls who can access a proxy host.
- **ACME:** Automated Certificate Management Environment. The protocol used by Let's Encrypt to issue and renew certificates automatically.
- **Anubis:** An AI-powered firewall that blocks automated crawlers and bots using proof-of-work challenges.

## C

- **CGNAT:** Carrier-Grade NAT. Means your ISP shares one public IP among many customers, making port forwarding impossible. Use Cloudflare Tunnels or IPv6 as alternatives.
- **CNAME:** Canonical Name. A DNS record that creates an alias pointing one domain to another.
- **CrowdSec:** An open-source IPS that detects and blocks malicious IPs using community-driven threat intelligence.
- **CRS:** Core Rule Set. The OWASP-maintained set of rules used by ModSecurity to detect attacks.

## D

- **Dead Host:** A ShieldPM host type that returns a 404 error for specified domains, blocking access.
- **DDNS:** Dynamic DNS. Automatically updates DNS records when your public IP address changes.
- **DNS-01 Challenge:** Proving domain ownership to Let's Encrypt via a DNS TXT record. Required for wildcard certificates.
- **Docker:** A platform for developing, shipping, and running applications in containers.

## G

- **GitOps:** A methodology where infrastructure configuration is stored in a Git repository. ShieldPM supports GitOps for automatic backup and restore.

## H

- **HSTS:** HTTP Strict Transport Security. Forces browsers to only connect via HTTPS, preventing downgrade attacks.
- **HTTP/3 (QUIC):** The latest HTTP protocol, based on UDP. Faster connection setup and better performance on mobile networks.

## I

- **IPS:** Intrusion Prevention System. Actively monitors and blocks detected threats in real-time (e.g., CrowdSec).

## J

- **JWT:** JSON Web Token. A compact, signed token used for API authentication in ShieldPM.

## L

- **Let's Encrypt:** A free, automated certificate authority that issues SSL/TLS certificates.
- **Location:** An Nginx configuration block that processes requests for specific URL paths (e.g., `/api`).

## M

- **ML-KEM-768:** A post-quantum key exchange algorithm (also known as Kyber) used by ShieldPM's Internal PKI for future-proof TLS handshakes.
- **ModSecurity:** An open-source Web Application Firewall (WAF) that inspects HTTP traffic for malicious payloads.
- **mTLS:** Mutual TLS. Both client and server verify each other's certificates. Used for Zero Trust access in ShieldPM.

## O

- **OIDC:** OpenID Connect. An identity layer on top of OAuth 2.0 used for Single Sign-On (SSO) authentication.
- **OWASP:** Open Web Application Security Project. A nonprofit that produces security standards and tools, including the CRS.

## P

- **Proxy Host:** A ShieldPM configuration that forwards HTTP/HTTPS traffic from a domain to a backend service.

## R

- **Reverse Proxy:** A server that sits between clients and backend services, forwarding requests and handling SSL termination.
- **Redirection Host:** A ShieldPM host type that redirects traffic from one domain to another URL (301/302).

## S

- **Stream Host:** A ShieldPM host type that forwards raw TCP/UDP traffic (Layer 4) — used for databases, game servers, VPNs.

## W

- **WAF:** Web Application Firewall. Protects web applications by inspecting and filtering HTTP traffic for attacks.
- **Wildcard Certificate:** An SSL certificate that covers a domain and all its subdomains (e.g., `*.example.com`).

---

[🏠 Home](Home) | [🐞 Report a Bug](https://github.com/shedowe19/ShieldPM/issues)
