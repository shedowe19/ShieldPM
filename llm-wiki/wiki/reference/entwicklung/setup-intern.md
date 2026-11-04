# Setup & Initialisierung

## Zweck

`backend/setup.js` führt Initialisierungsaufgaben bei jedem Backend-Start aus; bestehende Benutzer und Einstellungen bleiben erhalten.

## Kontext

Wird bei jedem Backend-Start aus `backend/index.js` oder `backend/index-dev.js` aufgerufen. Führt folgende Setup-Funktionen aus:

## Wichtige Dateien

- `backend/setup.js`

## Setup-Funktionen

### `setupDefaultUser()`

Erstellt einen Admin-Benutzer beim ersten Start, wenn:

- **Noch kein Benutzer existiert** (`isSetup() === false`)
- `INITIAL_ADMIN_EMAIL` gesetzt ist
- `INITIAL_ADMIN_PASSWORD` gesetzt ist

**Validierung** (aus `backend/validate-env.cjs` und `backend/lib/auth-password.js`):

- `INITIAL_ADMIN_EMAIL` muss `@` und `.` enthalten
- `INITIAL_ADMIN_PASSWORD` muss mindestens acht Zeichen und höchstens 72 UTF-8-Bytes enthalten. Beim Einfügen in `auth.secret` hasht `backend/models/auth.js` den Wert mit bcrypt (Kostenfaktor 13); `auth.meta` bleibt leer. Das Passwort wird nicht ausgegeben.

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

### `setupDefaultSettings()`

Erstellt zwei Settings wenn nicht vorhanden:

- `default-site` — Was bei unbekanntem Host angezeigt wird (Wert: `INITIAL_DEFAULT_PAGE`)
- `oidc-config` — OIDC-Konfiguration (Wert: `metadata`)

Anschließend erzeugt die Funktion die Nginx-Konfiguration der Standardseite erneut.

### `setupCertbotPlugins()`

- Erstellt Certbot-Verzeichnisse unter `/data/`
- Symlink `/tmp/certbot-credentials` → `/data/certbot-credentials`
- Liest Let's-Encrypt-Zertifikate mit DNS-Challenge und installiert zugehörige Plugins

### `regenerateAllHosts()`

Wird nur ausgeführt wenn `REGENERATE_ALL=true`:

- Generiert Nginx-Configs für alle aktiven Hosts (Proxy, Redirection, Dead, Stream) als Gruppen und aktualisiert anschließend den Fingerabdruck der Nginx-Vorlagen.
- `rootfs/usr/local/bin/envs.sh` setzt `REGENERATE_ALL=true`, wenn der gespeicherte Fingerabdruck fehlt oder sich Vorlagen beziehungsweise relevante Umgebungswerte geändert haben.

## Umgebungsvariablen für Setup

| Variable                 | Pflicht | Validierung                                             |
| ------------------------ | ------- | ------------------------------------------------------- |
| `INITIAL_ADMIN_EMAIL`    | Nein\*  | Muss `@` und `.` enthalten                              |
| `INITIAL_ADMIN_PASSWORD` | Nein\*  | Mindestens 8 Zeichen, höchstens 72 UTF-8-Bytes          |
| `INITIAL_DEFAULT_PAGE`   | Nein    | Nur `404`, `444`, `redirect`, `congratulations`, `html` |

\*Nur für automatische Admin-Erstellung bei erstem Start

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

## Verwandte Seiten

- [Umgebungsvariablen](../konfiguration/umgebungsvariablen.md)
- [Benutzer & Auth](../module/benutzer-auth.md)
- [Einstellungen](../verwaltung/einstellungen.md)
- [Entwicklung-Setup](./setup.md)
