# Setup & Initialisierung

## Zweck

`backend/setup.js` führt alle Initialisierungsaufgaben beim ersten Start durch.

## Kontext

Wird beim Backend-Start einmalig aufgerufen (`backend/index.js` importiert es als Default-Export). Führt folgende Setup-Funktionen aus:

## Wichtige Dateien

- `backend/setup.js` (236 Zeilen)

## Setup-Funktionen

### `setupDefaultUser()` (Zeile 26-74)

Erstellt einen Admin-Benutzer beim ersten Start, wenn:

- **Noch kein Benutzer existiert** (`isSetup() === false`)
- `INITIAL_ADMIN_EMAIL` gesetzt ist
- `INITIAL_ADMIN_PASSWORD` gesetzt ist

**Validierung** (aus `validate-env.cjs`):

- `INITIAL_ADMIN_EMAIL` muss `@` und `.` enthalten
- `INITIAL_ADMIN_PASSWORD` wird als Klartext in `auth.meta` gespeichert (bcrypt-Hashing passiert beim Login)

**Erstellter User:**

```javascript
{
  email: INITIAL_ADMIN_EMAIL,
  name: "Administrator",
  nickname: "Admin",
  roles: ["admin"]
}
```

**Berechtigungen:**

```javascript
{
  visibility: "all",
  proxy_hosts: "manage",
  redirection_hosts: "manage",
  dead_hosts: "manage",
  streams: "manage",
  access_lists: "manage",
  certificates: "manage"
}
```

### `setupDefaultSettings()` (Zeile 81-108)

Erstellt zwei Settings wenn nicht vorhanden:

- `default-site` — Was bei unbekanntem Host angezeigt wird (Wert: `INITIAL_DEFAULT_PAGE`)
- `oidc-config` — OIDC-Konfiguration (Wert: `metadata`)

### `setupCertbotPlugins()` (Zeile 115-178)

- Erstellt Certbot-Verzeichnisse unter `/data/`
- Symlink `/tmp/certbot-credentials` → `/data/certbot-credentials`
- Liest Let's-Encrypt-Zertifikate mit DNS-Challenge und installiert zugehörige Plugins

### `regenerateAllHosts()` (Zeile 185-229)

Wird nur ausgeführt wenn `REGENERATE_ALL=true`:

- Generiert Nginx-Configs für alle aktiven Hosts (Proxy, Redirection, Dead, Stream)
- Wird bei `REGENERATE_ALL=true` genutzt (z.B. nach Nginx-Upgrade)

## Umgebungsvariablen für Setup

| Variable                 | Pflicht | Validierung                                             |
| ------------------------ | ------- | ------------------------------------------------------- |
| `INITIAL_ADMIN_EMAIL`    | Nein\*  | Muss `@` und `.` enthalten                              |
| `INITIAL_ADMIN_PASSWORD` | Nein\*  | —                                                       |
| `INITIAL_DEFAULT_PAGE`   | Nein    | Nur `404`, `444`, `redirect`, `congratulations`, `html` |

\*Nur für automatische Admin-Erstellung bei erstem Start

## Offene Fragen

- TODO: Warum wird `auth.meta` als Plain-Objekt gespeichert und nicht verschlüsselt?

## Verwandte Seiten

- [Umgebungsvariablen](../konfiguration/umgebungsvariablen.md)
- [Benutzer & Auth](../module/benutzer-auth.md)
- [Einstellungen](../verwaltung/einstellungen.md)
- [Entwicklung-Setup](./setup.md)
