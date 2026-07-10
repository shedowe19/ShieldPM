# Frontend API-Client

## Zweck

Dokumentation der API-Client-Dateien unter `frontend/src/api/backend/`.

## Kontext

Jede Datei repräsentiert einen einzelnen API-Aufruf. Die Hooks in `frontend/src/hooks/` nutzen diese Dateien, um React Query Queries und Mutations zu definieren.

## Verhalten

- Jede Datei exportiert eine Funktion, die einen HTTP-Aufruf an die Backend-API macht
- Gruppiert nach CRUD-Operationen (create, get, getAll, update, delete, toggle)
- Verwendet einen zentralen API-Client (Basis-URL, Auth-Header, etc.)
- `api/backend/base.ts` lädt GET- und POST-Downloads als `Blob`, startet sie über einen temporären Link und gibt jeweils genau die erzeugte Blob-URL wieder frei, damit wiederholte Exporte keinen Browser-Speicher belegen.

## API-Dateien nach Entität

### Proxy-Hosts

`createProxyHost.ts`, `getProxyHost.ts`, `getProxyHosts.ts`, `updateProxyHost.ts`, `deleteProxyHost.ts`, `toggleProxyHost.ts`

### Redirection-Hosts

`createRedirectionHost.ts`, `getRedirectionHost.ts`, `getRedirectionHosts.ts`, `updateRedirectionHost.ts`, `deleteRedirectionHost.ts`, `toggleRedirectionHost.ts`

### Dead-Hosts

`createDeadHost.ts`, `getDeadHost.ts`, `getDeadHosts.ts`, `updateDeadHost.ts`, `deleteDeadHost.ts`, `toggleDeadHost.ts`

### Streams

`createStream.ts`, `getStream.ts`, `getStreams.ts`, `updateStream.ts`, `deleteStream.ts`, `toggleStream.ts`

### Zertifikate

`createCertificate.ts`, `getCertificate.ts`, `getCertificates.ts`, `updateCertificate.ts`, `deleteCertificate.ts`, `renewCertificate.ts`, `uploadCertificate.ts`, `validateCertificate.ts`, `getDnsProviders.ts`, `getCertificateDNSProviders.ts`, `downloadCertificate.ts`, `downloadRootCa.ts`, `testHttpCertificate.ts`

### Access-Lists

`createAccessList.ts`, `getAccessList.ts`, `getAccessLists.ts`, `updateAccessList.ts`, `deleteAccessList.ts`

### Benutzer

`createUser.ts`, `getUser.ts`, `getUsers.ts`, `updateUser.ts`, `deleteUser.ts`, `toggleUser.ts`, `updateAuth.ts`, `uploadUserAvatar.ts`, `setPermissions.ts`, `loginAsUser.ts`

### Cloudflare Tunnels

`createCloudflaredTunnel.ts`, `getCloudflaredTunnel.ts`, `getCloudflaredTunnels.ts`, `updateCloudflaredTunnel.ts`, `deleteCloudflaredTunnel.ts`

### Tor Onion

`createTorOnion.ts`, `deleteTorOnion.ts`, `getTorOnions.ts`, `torOnionActions.ts`, `updateTorOnion.ts`

### WireGuard

`createWireguardPeer.ts`, `deleteWireguardPeer.ts`, `getWireguardPeerConfig.ts`, `getWireguardPeerQRCode.ts`, `getWireguardPeers.ts`, `updateWireguardPeer.ts`, `wireguardPeerActions.ts`, `wireguardSettings.ts`

### DDNS

`createDdnsProvider.ts`, `getDdnsProviders.ts`, `updateDdnsProvider.ts`, `deleteDdnsProvider.ts`, `testDdnsProvider.ts`

### Dashboard

`createDashboardNote.ts`, `getDashboardNotes.ts`, `updateDashboardNote.ts`, `deleteDashboardNote.ts`

### Auth & Tokens

`getToken.ts`, `loginAsUser.ts`, `refreshToken.ts`, `restoreSession.ts`, `claimOidcToken.ts`, `updateAuth.ts`

### 2FA

`get2fa.ts`, `setup2faTotp.ts`, `setup2faPasskey.ts`, `setup2faDuo.ts`, `setup2faYubikey.ts`, `verify2fa.ts`, `remove2fa.ts`, `backupCodes2fa.ts`

### Einstellungen & System

`getSetting.ts`, `getSettings.ts`, `updateSetting.ts`, `getHealth.ts`, `checkVersion.ts`, `getHostsReport.ts`, `getDbStats.ts`

### AI

`ai.ts`

### ChatOps

`chatIntegrations.ts`

### GitOps

`gitops.ts`, `gitSync.ts`

### Analytics

`getAnalyticsSeries.ts`, `getAnalyticsSummary.ts`

### Audit-Log

`getAuditLog.ts`, `getAuditLogs.ts`

### Docker

`getDockerContainers.ts`

### Permissions

`setUserPermissions.ts`

## Abhängigkeiten

- Zentraler API-Client aus `api/backend/` Root
- React Query Hooks in `hooks/`

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

## Verwandte Seiten

- [Frontend-Internas](./frontend-internas.md)
- [API-Überblick](../api/ueberblick.md)
- [API-Routen](../api/routen.md)
