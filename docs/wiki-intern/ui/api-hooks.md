# Frontend API-Hooks

## Zweck

Dokumentation der React-Query-basierten API-Hooks in `frontend/src/hooks/` und ihrer API-Funktionen.

## Kontext

Die Hooks verwenden TanStack React Query für Caching und State-Management. Die HTTP-Funktionen liegen separat in
`frontend/src/api/backend/`; Dialoge und Auth-Flows können diese auch direkt verwenden.

## Struktur

```
frontend/src/
├── hooks/
│   ├── useUser.ts       # Einzelabfrage und Benutzer-Mutation
│   ├── useUsers.ts      # Benutzerlisten
│   └── use*.ts          # Weitere Query-/Mutation-Hooks
└── api/backend/
    ├── base.ts          # HTTP, Cookie-/CSRF-Übergabe, Antwortverarbeitung
    ├── models.ts        # Datenmodelle
    ├── responseTypes.ts # Antworttypen
    ├── get*.ts          # GET-Funktionen (flach im API-Ordner)
    ├── create*.ts       # POST-Funktionen
    ├── update*.ts       # PUT-Funktionen
    └── delete*.ts       # DELETE-Funktionen
```

## Verwendete API-Funktionen (Auswahl)

### Auth & User

| Datei               | Beschreibung               |
| ------------------- | -------------------------- |
| `loginAsUser.ts`    | Login als anderer Benutzer |
| `refreshToken.ts`   | Token erneuern             |
| `restoreSession.ts` | Session wiederherstellen   |
| `verify2fa.ts`      | 2FA verifizieren           |
| `claimOidcToken.ts` | OIDC-Token holen           |

### Core CRUD

| Kategorie    | Operationen                                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------------- |
| Proxy Hosts  | getProxyHost(s), createProxyHost, updateProxyHost, deleteProxyHost, toggleProxyHost                                 |
| Redirection  | getRedirectionHost(s), createRedirectionHost, updateRedirectionHost, deleteRedirectionHost, toggleRedirectionHost   |
| Dead Hosts   | getDeadHost(s), createDeadHost, updateDeadHost, deleteDeadHost, toggleDeadHost                                      |
| Streams      | getStream(s), createStream, updateStream, deleteStream, toggleStream                                                |
| Certificates | getCertificate(s), createCertificate, deleteCertificate, downloadCertificate, renewCertificate, validateCertificate |
| Access Lists | getAccessList(s), createAccessList, updateAccessList, deleteAccessList                                              |

### Tunnel & Network

| Kategorie  | Operationen                                                                                                                                                                 |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cloudflare | getCloudflaredTunnel(s), createCloudflaredTunnel, updateCloudflaredTunnel, deleteCloudflaredTunnel                                                                          |
| Tor        | getTorOnion(s), createTorOnion, updateTorOnion, deleteTorOnion, torOnionActions                                                                                             |
| WireGuard  | getWireguardPeer(s), createWireguardPeer, updateWireguardPeer, deleteWireguardPeer, getWireguardPeerConfig, getWireguardPeerQRCode, wireguardPeerActions, wireguardSettings |

### Users & Auth

| Datei                 | Beschreibung                     |
| --------------------- | -------------------------------- |
| `getUser(s).ts`       | Benutzer abrufen                 |
| `createUser.ts`       | Benutzer erstellen               |
| `updateUser.ts`       | Benutzer aktualisieren           |
| `deleteUser.ts`       | Benutzer löschen                 |
| `setPermissions.ts`   | Berechtigungen setzen            |
| `toggleUser.ts`       | Benutzer aktivieren/deaktivieren |
| `uploadUserAvatar.ts` | Avatar hochladen                 |

### 2FA

| Datei                | Beschreibung                |
| -------------------- | --------------------------- |
| `setup2faTotp.ts`    | TOTP (Google Authenticator) |
| `setup2faYubikey.ts` | YubiKey WebAuthn            |
| `setup2faPasskey.ts` | Passkey/WebAuthn            |
| `setup2faDuo.ts`     | Duo Security                |
| `backupCodes2fa.ts`  | Backup-Codes                |
| `remove2fa.ts`       | 2FA entfernen               |
| `get2fa.ts`          | 2FA-Status abrufen          |

### Settings & System

| Datei              | Beschreibung              |
| ------------------ | ------------------------- |
| `getSetting(s).ts` | Einstellungen abrufen     |
| `updateSetting.ts` | Einstellung aktualisieren |
| `getHealth.ts`     | Health-Check              |
| `checkVersion.ts`  | Versionsprüfung           |
| `getDbStats.ts`    | Datenbank-Statistiken     |

### GitOps & Docker

| Datei        | Beschreibung                |
| ------------ | --------------------------- |
| `gitops.ts`  | GitOps-Operationen          |
| `gitSync.ts` | Git-Sync für einzelne Hosts |

## Pattern

API-Funktionen übernehmen ausschließlich den Transport; Hooks legen die Cache-Schlüssel und Invalidierungen fest.
Die sieben schreibenden Detail-Hooks für Access Lists, Proxy-/Redirect-/Dead-Hosts, Streams, Benutzer und Einstellungen
verwenden `optimisticQueryUpdate.ts`. Der Helfer bricht laufende Detailabfragen vor dem Update ab und verändert nur
bereits geladene Cache-Einträge, einschließlich vorhandener Access-List-Expansionen. Ein fehlgeschlagenes Speichern
stellt den vorherigen Wert nur wieder her, solange kein neuerer Cache-Schreibvorgang oder Sitzungswechsel stattgefunden
hat. Leere Caches werden nicht mit unvollständigen Formulardaten befüllt; nach Abschluss werden die betroffenen Abfragen
auch bei Fehlern invalidiert. `optimisticMutations.test.tsx` prüft die sieben Hooks mit einem echten QueryClient,
`optimisticQueryUpdate.test.ts` zusätzlich Abbruch-, Überlappungs- und Sitzungswechsel-Fälle.

Nach Benutzeränderungen werden sowohl `["user", id]` als auch `["user", "me"]` invalidiert. Der aktuelle
Benutzer bleibt damit in Profil, Kopfzeile und Berechtigungsanzeige konsistent. Avatar-Uploads invalidieren diese
Abfragen erneut nach dem tatsächlichen Upload, da die vorausgehende Profil-Mutation bereits abgeschlossen ist.

```typescript
import { useQuery } from "@tanstack/react-query";
import { getUsers } from "src/api/backend/getUsers";

export function useUsers() {
  return useQuery({
    queryKey: ["users"],
    queryFn: () => getUsers(),
  });
}
```

Nach einem GitOps-Import invalidiert `useImportFromGit` den gesamten Query-Cache. Der Import kann neben Hosts und
Zugriffslisten auch Benutzer, Zertifikate, Einstellungen, DDNS und Tunnel verändern; einzelne Detailabfragen müssen
entsprechend ebenfalls neu geladen werden. Auch eine abgeschlossene Importantwort mit gemeldeten Teilfehlern kann
bereits Änderungen enthalten. `useGitOps.test.tsx` prüft diese Invalidierung mit einem echten Query-Client.

## Verwandte Seiten

- [Frontend-Internas](./frontend-internas.md)
- [HTTP-API-Client](./api-client.md)
- [API-Überblick](../api/ueberblick.md)
