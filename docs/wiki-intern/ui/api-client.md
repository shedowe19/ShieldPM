# Frontend API-Client

## Zweck

Dokumentation der 109 API-Client-Dateien unter `frontend/src/api/backend/`.

## Kontext

Jede Datei repräsentiert einen einzelnen API-Aufruf. Die Hooks in `frontend/src/hooks/` nutzen diese Dateien, um React Query Queries und Mutations zu definieren.

## Verhalten

- Jede Datei exportiert eine Funktion, die einen HTTP-Aufruf an die Backend-API macht
- Gruppiert nach CRUD-Operationen (create, get, getAll, update, delete, toggle)
- Verwendet einen zentralen API-Client (Basis-URL, Auth-Header, etc.)

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

`createCertificate.ts`, `getCertificate.ts`, `getCertificates.ts`, `updateCertificate.ts`, `deleteCertificate.ts`, `renewCertificate.ts`, `uploadCertificate.ts`, `validateCertificate.ts`, `getDnsProviders.ts`, `downloadCertificate.ts`, `testHttpChallenge.ts`

### Access-Lists

`createAccessList.ts`, `getAccessList.ts`, `getAccessLists.ts`, `updateAccessList.ts`, `deleteAccessList.ts`

### Benutzer

`createUser.ts`, `getUser.ts`, `getUsers.ts`, `updateUser.ts`, `deleteUser.ts`, `toggleUser.ts`, `updateAuth.ts`, `uploadUserAvatar.ts`

### Cloudflare Tunnels

`createCloudflaredTunnel.ts`, `getCloudflaredTunnel.ts`, `getCloudflaredTunnels.ts`, `updateCloudflaredTunnel.ts`, `deleteCloudflaredTunnel.ts`

### Tor Onion

`torOnionActions.ts`, `getTorOnions.ts`, `updateTorOnion.ts`

### WireGuard

`wireguardPeerActions.ts`, `getWireguardPeers.ts`, `updateWireguardPeer.ts`, `wireguardSettings.ts`

### DDNS

`createDdnsProvider.ts`, `getDdnsProviders.ts`, `updateDdnsProvider.ts`, `deleteDdnsProvider.ts`, `testDdnsProvider.ts`

### Dashboard

`createDashboardNote.ts`, `getDashboardNotes.ts`, `updateDashboardNote.ts`, `deleteDashboardNote.ts`

### Auth & Tokens

`login.ts`, `refreshToken.ts`, `logout.ts`, `setup2fa.ts`, `verify2fa.ts`, `disable2fa.ts`, `get2faMethods.ts`, `get2faBackupCodes.ts`, `getAuthSessions.ts`, `deleteAuthSession.ts`

### Einstellungen & System

`getSetting.ts`, `getSettings.ts`, `updateSetting.ts`, `getHealth.ts`, `checkVersion.ts`, `getHostReport.ts`

### AI

`aiChat.ts`, `getAiConfig.ts`, `getAiModels.ts`

### ChatOps

`chatIntegrations.ts`

### GitOps

`gitopsActions.ts`, `getGitStatus.ts`, `updateGitStatus.ts`, `syncGit.ts`

### Analytics

`getAnalytics.ts`, `getAnalyticsCounts.ts`

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

- Keine

## Verwandte Seiten

- [Frontend-Internas](./frontend-internas.md)
- [API-Überblick](../api/ueberblick.md)
- [API-Routen](../api/routen.md)
