# Frontend API-Client

## Zweck

Dokumentation der API-Client-Dateien unter `frontend/src/api/backend/`.

## Kontext

Jede Datei repräsentiert einen einzelnen API-Aufruf. Die Hooks in `frontend/src/hooks/` nutzen diese Dateien, um React Query Queries und Mutations zu definieren.

## Verhalten

- Jede Datei exportiert eine Funktion, die einen HTTP-Aufruf an die Backend-API macht
- Gruppiert nach CRUD-Operationen (create, get, getAll, update, delete, toggle)
- JSON-Anfragen werden rekursiv nach `snake_case`, Antworten nach `camelCase` konvertiert. Die Frontend-Modelle und Formularwerte für KI, DDNS und ChatOps verwenden deshalb unter anderem `apiKey`, `baseUrl`, `numCtx`, `ipVer`, `zoneId` und `allowedIds`. Integrationstests mit unveränderten Backend-JSON-Antworten sichern das Lesen und Zurückschreiben dieser Felder.
- Header-Wörterbücher (`headers`, `headers_regex` beziehungsweise `headersRegex`) bewahren ihre enthaltenen Schlüssel in beiden Richtungen. So wird beispielsweise eine Anubis-Regel für `User-Agent` beim Bearbeiten nicht versehentlich zu einer Regel für `user_agent`; umgebende API-Felder werden weiterhin konvertiert. Ein API-Roundtrip-Test prüft auch mehrere verschachtelte Regeln.
- POST-Aufrufe können `rawResponse: true` setzen, wenn Antwortschlüssel Nutzdaten darstellen. Der HTTP-Zertifikatstest erhält damit Domainnamen einschließlich Bindestrichen unverändert. Authentisierung, CSRF und Fehlerbehandlung bleiben weiterhin zentral; `rawKeys` steuert separat die Schlüssel der Anfrage.
- Verwendet einen zentralen API-Client (Basis-URL, Auth-Header, etc.)
- `api/queryClient.ts` erzeugt genau einen React-Query-Client. Sowohl der Provider in `App.tsx` als auch die zentrale Antwortverarbeitung nutzen diese Instanz; ein 401 leert damit den tatsächlich sichtbaren Cache vor einer möglichen neuen Anmeldung.
- Die zentrale Antwortverarbeitung akzeptiert erfolgreiche HTTP-204-/205-Antworten ohne JSON-Body, insbesondere beim Abmelden. HTTP-Fehler ohne JSON oder ohne das erwartete Fehlerobjekt behalten ihren Status im Fehlermeldungstext. Ein 401 räumt Sitzung und Cache bereits vor dem Einlesen des Bodys auf; HTML-Fehlerseiten eines vorgeschalteten Proxys können diesen Schritt daher nicht verhindern. `silentAuth` unterdrückt dabei nur das Ablaufereignis. `base.test.ts` prüft diese Fälle einschließlich JSON-`null` und lokalisierter Backend-Fehlerschlüssel.
- Jeder Transportweg hält vor dem Senden die aktuelle `AuthStore.sessionRevision` fest. Eine verspätete 401-Antwort darf nur die Sitzung dieser Revision abmelden; nach einem inzwischen erfolgreichen Login, Refresh oder Benutzerwechsel bleiben die neue Sitzung und ihr Cache erhalten. Auch CSRF-Token aus verspäteten Antworten werden verworfen, einschließlich eines Sitzungswechsels während des asynchronen JSON-Lesens. Der HTTP-Fehler wird weiterhin an den ursprünglichen Aufrufer zurückgegeben. `base.session.test.ts` prüft GET, POST, PUT, DELETE und beide Download-Helfer mit dem echten AuthStore.
- `refreshToken.ts` teilt einen laufenden Refresh-Aufruf zwischen gleichzeitig anfragenden Verbrauchern. Damit lösen unter anderem die wiederholten Mount-Effekte von React StrictMode keine parallele Rotation desselben Refresh-Cookies aus. Nach Erfolg oder Fehler darf der nächste Aufruf wieder eine neue Anfrage starten; `refreshToken.test.ts` prüft beide Übergänge.
- `api/backend/base.ts` lädt GET- und POST-Downloads als `Blob`, startet sie über einen temporären Link und gibt jeweils genau die erzeugte Blob-URL wieder frei, damit wiederholte Exporte keinen Browser-Speicher belegen.
- Beide Download-Helfer prüfen HTTP-Fehler vor der Blob-Erzeugung über die zentrale Antwortverarbeitung. Dadurch wird bei einer abgelehnten oder abgelaufenen Sitzung kein Fehler-Response als Datei gespeichert; das 401-Verhalten einschließlich `silentAuth` bleibt mit den übrigen API-Aufrufen konsistent.
- Der Client-Zertifikatsdialog nutzt `downloadPost` für `/nginx/certificates/internal/client`; damit erhält auch dieser passwortgeschützte `.p12`-Download die zentrale Cookie-/CSRF-Übergabe und Fehlerbehandlung statt eines eigenen `fetch`-Aufrufs.
- `getDbStats.ts` delegiert an den zentralen GET-Client statt einen eigenen `fetch`-Aufruf zu verwenden. Analytics-Datenbankstatistiken erhalten damit dieselbe Cookie-/CSRF-Übergabe, Schlüsselkonvertierung und 401-Behandlung wie andere API-Aufrufe.

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

`createCertificate.ts`, `getCertificate.ts`, `getCertificates.ts`, `deleteCertificate.ts`, `renewCertificate.ts`, `uploadCertificate.ts`, `validateCertificate.ts`, `getDnsProviders.ts`, `getCertificateDNSProviders.ts`, `downloadCertificate.ts`, `downloadRootCa.ts`, `testHttpCertificate.ts`

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
