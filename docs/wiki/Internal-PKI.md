# Internal PKI & Post-Quantum Security

NPMplus includes a built-in Internal Certificate Authority (CA) that allows you to issue trusted certificates for your internal services without relying on external providers like Let's Encrypt. This is particularly useful for services that are not exposed to the public internet.

## Features

*   **Self-Hosted Root CA**: Automatically generated ECDSA P-384 (secp384r1) Root CA.
*   **Long Validity**: Root CA is valid for 10 years.
*   **Customizable Leaf Certificates**: Issue certificates valid for 1, 5, or 10 years.
*   **Post-Quantum Key Exchange**: Uses **ML-KEM-768 (Kyber)** for quantum-safe TLS handshakes while maintaining compatibility with standard ECDSA certificates.
*   **Secure Storage**: Private keys are stored with strict `0600` permissions.

## How to Use

### 1. Download Root CA
Before your browser or devices will trust these certificates, you must install the Root CA.

1.  Go to the **SSL Certificates** page.
2.  Click the **Root CA** button at the top (key icon).
3.  Download the `root_ca.crt` file.
4.  Install/Import this file into your operating system's or browser's Trusted Root Certification Service store.

### 2. Create an Internal Certificate
1.  On the **SSL Certificates** page, click **Add Certificate** and select **Internal (ECDSA)**.
2.  **Domain Names**: Enter the domains you want to cover (e.g., `web.internal`, `*.svc.local`). Wildcards are supported.
3.  **Validity Duration**: Select how long the certificate should be valid (1, 5, or 10 years).
4.  Click **Save**.

### 3. Assign to Host
1.  Go to **Proxy Hosts** (or any other host type).
2.  Edit or Create a host.
3.  In the **SSL** tab, select your newly created certificate from the dropdown.

## Technical Details

*   **Key Algorithm**: ECDSA P-384 (secp384r1) - Matches standard Let's Encrypt security level.
*   **Key Exchange**: `X25519MLKEM768` (Post-Quantum Hybrid) prioritized, falling back to `X25519`.
*   **Storage Path**: `/data/tls/internal/`

## mTLS Client Verification

You can also use the Internal Root CA to verify client certificates (mTLS).

1.  **Generate a Client Certificate**:
    *   Go to **SSL Certificates** -> **Add Certificate** -> **Internal (ECDSA)**.
    *   Select **Certificate Type**: **Client Identity (mTLS)**.
    *   **Identity Name**: Enter a name (e.g., `my-laptop`, `iphone-user`).
    *   **P12 Export Password**: Set a password. This is required to import the certificate securely.
    *   Click **Save**. Your browser will automatically download a `.p12` file.
2.  Install this client certificate (and the Root CA) on your device/browser.
3.  Create an **Access List**, enable **mTLS**, and switch on **"Use Internal CA"**.
4.  Assign this Access List to a Proxy Host.

Only clients with a valid certificate signed by your Internal CA will be allowed access.
