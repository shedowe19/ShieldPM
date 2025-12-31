# Internal PKI & Post-Quantum Security

NPMplus includes a built-in Internal Certificate Authority (CA) that allows you to issue trusted certificates for your internal services without relying on external providers like Let's Encrypt. This is particularly useful for services that are not exposed to the public internet.

## Features

*   **Self-Hosted Root CA**: Automatically generated Ed25519 Root CA.
*   **Long Validity**: Root CA is valid for 10 years.
*   **Customizable Leaf Certificates**: Issue certificates valid for 1, 5, or 10 years.
*   **Post-Quantum Security**: All internal certificates automatically enable **ML-KEM (Kyber)** key exchange for quantum-safe TLS handshakes (requires Nginx with BoringSSL/QuicTLS support).
*   **Secure Storage**: Private keys are stored with strict `0600` permissions.

## How to Use

### 1. Download Root CA
Before your browser or devices will trust these certificates, you must install the Root CA.

1.  Go to the **SSL Certificates** page.
2.  Click the **Root CA** button at the top (key icon).
3.  Download the `root_ca.crt` file.
4.  Install/Import this file into your operating system's or browser's Trusted Root Certification Service store.

### 2. Create an Internal Certificate
1.  On the **SSL Certificates** page, click **Add Certificate** and select **Internal (ML-KEM)**.
2.  **Domain Names**: Enter the domains you want to cover (e.g., `web.internal`, `*.svc.local`). Wildcards are supported.
3.  **Validity Duration**: Select how long the certificate should be valid (1, 5, or 10 years).
4.  Click **Save**.

### 3. Assign to Host
1.  Go to **Proxy Hosts** (or any other host type).
2.  Edit or Create a host.
3.  In the **SSL** tab, select your newly created certificate from the dropdown.

## Technical Details

*   **Key Algorithm**: Ed25519 (Edwards-curve Digital Signature Algorithm) for high performance and security.
*   **Key Exchange**: `X25519Kyber768Draft00` (Post-Quantum) prioritized, falling back to `X25519`.
*   **Storage Path**: `/data/tls/internal/`
