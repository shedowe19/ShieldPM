# Glossary

Common terms used in NPMplus and networking.

## A
*   **A Record:** A DNS record that points a domain name to an IPv4 address.
*   **AAAA Record:** A DNS record that points a domain name to an IPv6 address.
*   **Access List (ACL):** A set of rules (Basic Auth, IP Allow/Deny) that controls who can access a proxy host.
*   **ACME:** Automated Certificate Management Environment. The protocol used by Let's Encrypt to issue certificates.

## C
*   **CNAME:** Canonical Name. A DNS record that points one domain name to another domain name.
*   **CrowdSec:** An open-source intrusion prevention system (IPS) that detects and blocks malicious IP addresses.

## D
*   **DNS-01 Challenge:** A method for proving domain ownership to Let's Encrypt by creating a specific DNS TXT record. Required for wildcard certificates.
*   **Docker:** A platform for developing, shipping, and running applications in containers.

## H
*   **HSTS:** HTTP Strict Transport Security. A web security policy mechanism that forces browsers to interact with it using only HTTPS.
*   **HTTP/3 (QUIC):** The latest version of the HTTP protocol, based on UDP, offering better performance and security.

## I
*   **IPS:** Intrusion Prevention System. A system that actively blocks detected threats (e.g., CrowdSec).

## J
*   **JWT:** JSON Web Token. A compact, URL-safe means of representing claims to be transferred between two parties. Used for API authentication in NPMplus.

## L
*   **Let's Encrypt:** A free, automated, and open certificate authority (CA).
*   **Location:** In Nginx, a configuration block that processes requests for specific URI paths (e.g., `/api`).

## M
*   **ModSecurity:** An open-source Web Application Firewall (WAF).
*   **Mutual TLS (mTLS):** Authentication where both the client and the server verify each other's certificates.

## O
*   **OIDC:** OpenID Connect. An identity layer on top of the OAuth 2.0 protocol, dealing with authentication.
*   **OWASP CRS:** OWASP Core Rule Set. A set of generic attack detection rules for use with ModSecurity.

## R
*   **Reverse Proxy:** A server that sits between client devices and backend application servers, forwarding requests and handling SSL termination.

## W
*   **WAF:** Web Application Firewall. Protects web applications by filtering and monitoring HTTP traffic (e.g., ModSecurity).
*   **Wildcard Certificate:** An SSL certificate that covers a domain and all its subdomains (e.g., `*.example.com`).

---
[🏠 Home](Home) | [🐞 Report a Bug](https://github.com/shedowe19/NPMplus/issues)
