# Frontend API-Client

## Zweck

Dokumentation der React-Query-basierten API-Hooks in `frontend/src/api/backend/`.

## Kontext

Alle API-Aufrufe vom Frontend zum Backend laufen über diese Hooks. Sie verwenden TanStack React Query für Caching und State-Management.

## Struktur

```
frontend/src/api/backend/
├── index.ts           # Haupt-Exports
├── base.ts            # Basis-API-Funktion
├── helpers.ts         # Hilfsfunktionen
├── models.ts          # TypeScript-Typen
├── responseTypes.ts   # API-Antwort-Typen
├── expansions.ts      # Expansion-Parameter
└── [entity]/
    ├── get*.ts        # GET-Operationen
    ├── create*.ts     # POST-Operationen
    ├── update*.ts     # PUT-Operationen
    ├── delete*.ts     # DELETE-Operationen
    └── *.ts           # Sonstige Operationen
```

## Dateien (104 .ts Dateien)

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

### Monitoring

| Datei                           | Beschreibung                    |
| ------------------------------- | ------------------------------- |
| `getMonitors.ts`                | Monitore listen                 |
| `getMonitor.ts`                 | einzelnen Monitor abrufen       |
| `createMonitor.ts`              | Monitor erstellen               |
| `updateMonitor.ts`              | Monitor aktualisieren           |
| `deleteMonitor.ts`              | Monitor löschen                 |
| `getMonitorChecks.ts`           | Check-Historie abrufen          |
| `testMonitor.ts`                | manuellen Check auslösen        |
| `createMonitorFromProxyHost.ts` | Monitor aus Proxy Host erzeugen |

### GitOps & Docker

| Datei        | Beschreibung                |
| ------------ | --------------------------- |
| `gitops.ts`  | GitOps-Operationen          |
| `gitSync.ts` | Git-Sync für einzelne Hosts |

## Pattern

```typescript
// Typisches GET-Hook
export function useEntity() {
  return useQuery({
    queryKey: ["entity"],
    queryFn: () => api.get("/api/entity"),
  });
}

// Typisches CREATE-Mutation
export function useCreateEntity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.post("/api/entity", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["entity"] }),
  });
}
```

## Verwandte Seiten

- [Frontend-Internas](./frontend-internas.md)
- [API-Überblick](../api/ueberblick.md)
