# Two-Factor Authentication (2FA)

Protect your ShieldPM account with an additional verification step. When enabled, users must provide a second factor alongside their password to sign in.

---

## 🏗️ Architecture

```
  ┌─────────────────────────────────────────────────────────┐
  │                   Login Flow with 2FA                   │
  │                                                         │
  │  ┌──────────┐    ┌──────────────┐    ┌──────────────┐  │
  │  │ Username │───▶│  Password    │───▶│  2FA Verify  │  │
  │  │ + Pass   │    │  Validated   │    │  (2nd Factor)│  │
  │  └──────────┘    └──────────────┘    └──────┬───────┘  │
  │                                             │          │
  │                    ┌────────────────────────┐│          │
  │                    │ TOTP │ YubiKey │Passkey││          │
  │                    │      │        │  Duo  ││          │
  │                    └────────────────────────┘│          │
  │                                             ▼          │
  │                                      ┌────────────┐   │
  │                                      │  Logged In  │   │
  │                                      └────────────┘   │
  └─────────────────────────────────────────────────────────┘
```

---

## 🔐 Supported Methods

ShieldPM supports **four** 2FA methods plus backup codes as a fallback:

| Method | Type | Description |
|--------|------|-------------|
| **Authenticator App (TOTP)** | Software | Google Authenticator, Authy, or any TOTP-compatible app |
| **YubiKey** | Hardware | Hardware security key from Yubico (OTP mode) |
| **Passkey (FIDO2/WebAuthn)** | Hardware/Biometric | Fingerprint, Face ID, or FIDO2 hardware key |
| **Duo Security** | Enterprise | Duo Universal Prompt for enterprise environments |
| **Backup Codes** | Fallback | 8 one-time-use codes generated during setup |

> **Tip:** You can enable multiple methods simultaneously. For maximum security, combine a hardware key (YubiKey/Passkey) with an authenticator app as fallback.

---

## ⚙️ Setting Up 2FA

### Prerequisites

- You must be logged in to your ShieldPM account
- Navigate to **Users** → Click on your user → **Security** tab

### Authenticator App (TOTP)

1. Click **Authenticator App** in the "Add a New Method" section
2. Scan the QR code with your authenticator app:
   - [Google Authenticator](https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2)
   - [Authy](https://authy.com/)
   - [Microsoft Authenticator](https://www.microsoft.com/en-us/security/mobile-authenticator-app)
   - Any TOTP-compatible app
3. Enter the 6-digit verification code from the app
4. Click **Verify & Enable**
5. **Save your backup codes** — these are your emergency fallback

### YubiKey (Hardware OTP)

1. Click **YubiKey** in the "Add a New Method" section
2. Optionally give it a label (e.g., "Office YubiKey")
3. Click the OTP input field
4. **Touch your YubiKey** — it will auto-type a one-time password
5. Click **Add YubiKey**

> **How it works:** Each YubiKey has a unique device ID embedded in the first 12 characters of every OTP it generates. ShieldPM validates the OTP against the Yubico API and stores the device ID. During login, only a YubiKey with a matching device ID is accepted.

#### Self-Hosted Yubico Validation Server

By default, ShieldPM validates YubiKey OTPs against `api.yubico.com`. For air-gapped or on-premise setups, configure a local validation server:

```env
YUBICO_CLIENT_ID=1
YUBICO_SECRET_KEY=your-secret
YUBICO_API_URL=your-local-server.example.com
```

### Passkey (FIDO2/WebAuthn)

1. Click **Passkey** in the "Add a New Method" section
2. Optionally give it a label (e.g., "MacBook Touch ID")
3. Click **Register Passkey**
4. Follow the browser prompt:
   - **Biometric:** Use your fingerprint or face
   - **Hardware key:** Insert and touch your FIDO2 key
   - **Platform authenticator:** Windows Hello, Touch ID, etc.
5. **Save your backup codes** if this is your first 2FA method

> **Note:** Passkeys are bound to the origin (domain + protocol) you access ShieldPM from. If you access ShieldPM from multiple domains, register a passkey for each.

#### Environment Variables

Passkey settings are auto-detected from the request, but can be overridden:

```env
# Override WebAuthn Relying Party ID (default: auto-detected from request hostname)
PASSKEY_RP_ID=shield.example.com

# Override expected origin (default: auto-detected from request)
PASSKEY_ORIGIN=https://shield.example.com

# Override display name shown in browser prompts
PASSKEY_RP_NAME=ShieldPM
```

### Duo Security (Enterprise)

1. Create a **Web SDK** application in your [Duo Admin Panel](https://admin.duosecurity.com/)
2. Click **Duo Security** in the "Add a New Method" section
3. Enter your Duo credentials:
   - **Client ID** — starts with `DI...`
   - **Client Secret**
   - **API Hostname** — e.g., `api-XXXXXXXX.duosecurity.com`
   - **Redirect URL** — your ShieldPM URL + `/duo-callback`
4. Click **Save & Verify Duo Configuration**

---

## 🔑 Signing In with 2FA

After entering your username and password:

1. ShieldPM shows your available 2FA methods
2. Choose a method:
   - **TOTP:** Enter the 6-digit code from your authenticator app
   - **YubiKey:** Touch your YubiKey to auto-fill the OTP
   - **Passkey:** Follow the browser biometric/hardware prompt
   - **Duo:** You'll be redirected to the Duo Universal Prompt
3. If all else fails, click **"Use a backup code instead"**

---

## 🆘 Backup Codes

Backup codes are generated automatically when you set up your first 2FA method.

- **8 codes** are generated per user
- Each code can only be used **once**
- After using a code, it is permanently consumed

### Regenerating Backup Codes

1. Go to **Users** → Your user → **Security** tab
2. Click **Regenerate Backup Codes**
3. Save the new codes — **the old ones are invalidated**

> ⚠️ **Warning:** Regenerating backup codes immediately invalidates all previous codes. Make sure to save the new ones.

---

## 🗑️ Removing a 2FA Method

1. Go to **Users** → Your user → **Security** tab
2. Find the method under "Active Methods"
3. Click the **trash icon** (🗑️) next to it

> **Note:** Removing all 2FA methods disables 2FA for your account entirely. You will only need a password to sign in.

---

## 🌐 Internationalization

The 2FA interface is fully translated in all supported languages:

🇬🇧 English · 🇩🇪 Deutsch · 🇪🇸 Español · 🇮🇹 Italiano · 🇯🇵 日本語 · 🇰🇷 한국어 · 🇷🇺 Русский · 🇨🇳 中文 · 🇳🇱 Nederlands · 🇵🇱 Polski · 🇧🇬 Български · 🇸🇰 Slovenčina · 🇻🇳 Tiếng Việt

Change your language in the ShieldPM settings — the 2FA pages will automatically adapt.

---

## 🔧 Troubleshooting

### "Invalid TOTP code"
- Ensure your device's clock is synchronized (TOTP is time-based)
- Check that you're using the correct account in your authenticator app

### "rp.id cannot be used with the current origin"
- Your Passkey RP ID doesn't match the domain you're accessing ShieldPM from
- Either access from the correct domain or set `PASSKEY_RP_ID` and `PASSKEY_ORIGIN` environment variables

### "Credential ID was not base64url-encoded"
- Ensure both frontend and backend are on the same version
- This can happen with version mismatches in `@simplewebauthn`

### YubiKey OTP not accepted
- Make sure you're touching the correct YubiKey (each has a unique device ID)
- Verify network connectivity to `api.yubico.com` (or your custom validation server)
- Check that `YUBICO_CLIENT_ID` is configured if using a self-hosted validator

### Locked out of account
- Use a backup code to sign in
- If no backup codes remain, an admin can remove 2FA from your account via the database
- As a last resort, use the ShieldPM CLI to reset user credentials

---

## 📡 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/users/:id/2fa` | GET | List active 2FA methods |
| `/api/users/:id/2fa/totp/setup` | POST | Generate TOTP secret + QR |
| `/api/users/:id/2fa/totp/enable` | POST | Verify code and enable TOTP |
| `/api/users/:id/2fa/yubikey/add` | POST | Register a YubiKey |
| `/api/users/:id/2fa/passkey/register/begin` | POST | Start passkey registration |
| `/api/users/:id/2fa/passkey/register/complete` | POST | Complete passkey registration |
| `/api/users/:id/2fa/duo/setup` | POST | Configure Duo Security |
| `/api/users/:id/2fa/:methodId` | DELETE | Remove a 2FA method |
| `/api/users/:id/2fa/backup-codes/regenerate` | POST | Regenerate backup codes |
| `/api/tokens/2fa/verify` | POST | Verify 2FA during login |
| `/api/tokens/2fa/passkey/begin` | POST | Start passkey authentication |
| `/api/tokens/2fa/passkey/complete` | POST | Complete passkey authentication |
| `/api/tokens/2fa/duo/begin` | POST | Start Duo authentication |
| `/api/tokens/2fa/duo/complete` | POST | Complete Duo authentication |

> Use `:id` = `me` to reference the currently authenticated user.

---

[🏠 Home](Home) | [👥 User Management](User-Management) | [🔒 Security Overview](Security)
