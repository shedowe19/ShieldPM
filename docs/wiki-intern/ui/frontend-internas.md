# Frontend-Internas

## Zweck

Dokumentation der internen Frontend-Architektur: Hooks, Contexts, Modules, Modals, Types und Lib.

## Kontext

Das Frontend verwendet React 19 mit TypeScript. Die interne Architektur folgt dem Prinzip der Trennung von Zustand (Contexts/Modules), Datenzugriff (Hooks), UI-Logik (Modals) und Hilfsmodulen (Lib).

## Lokalisierung und Entwicklungswerkzeuge

- `locale/IntlProvider.tsx` behält Englisch und die Sprachbezeichnungen im Start-Bundle; die übrigen Sprachdateien werden erst für die ausgewählte Sprache geladen. `main.tsx` wartet vor dem ersten Render auf `initializeLocale()`, damit keine englische Zwischenansicht erscheint.
- `components/QueryDevtools.tsx` lädt die React-Query-Devtools nur im Entwicklungsmodus dynamisch. Der Produktions-Build enthält keinen Devtools-Import.
- `modals/lazy.ts` lädt `ProxyHostModal.tsx`, `AccessListModal.tsx`, `UserModal.tsx`, `ChangePasswordModal.tsx`, `PermissionsModal.tsx`, `SetPasswordModal.tsx`, `StreamModal.tsx`, `DashboardNoteModal.tsx`, `DeleteConfirmModal.tsx`, `HelpModal.tsx` sowie `RedirectionHostModal.tsx` erst bei einer Anforderung. Die Wrapper speichern je Import-Promise; bei Ladefehlern verwerfen sie es und nutzen die vorhandene Fehler-Toast-Schicht. `ProxyHosts/TableWrapper.tsx`, `Access/TableWrapper.tsx`, `AccessListformatter.tsx`, `Users/TableWrapper.tsx`, `SiteHeader.tsx`, `DashboardNotesWidget.tsx`, `Nginx/RedirectionHosts/TableWrapper.tsx` und `Nginx/Streams/TableWrapper.tsx` verwenden diese Wrapper statt des `modals`-Barrels, damit die Dialoge nicht über gemeinsame Barrel-Abhängigkeiten bereits mit dem jeweiligen Routen-Chunk geladen werden.

## Custom Hooks (`frontend/src/hooks/`)

32 Hooks für Server-State-Management (React Query):

### CRUD Hooks (Entitäten)

| Hook                                         | Datei                                              | Zweck                  |
| -------------------------------------------- | -------------------------------------------------- | ---------------------- |
| `useProxyHost` / `useProxyHosts`             | `useProxyHost.ts` / `useProxyHosts.ts`             | Proxy-Host CRUD        |
| `useRedirectionHost` / `useRedirectionHosts` | `useRedirectionHost.ts` / `useRedirectionHosts.ts` | Redirect CRUD          |
| `useDeadHost` / `useDeadHosts`               | `useDeadHost.ts` / `useDeadHosts.ts`               | Dead-Host CRUD         |
| `useStream` / `useStreams`                   | `useStream.ts` / `useStreams.ts`                   | Stream CRUD            |
| `useCertificate` / `useCertificates`         | `useCertificate.ts` / `useCertificates.ts`         | Zertifikat CRUD        |
| `useAccessList` / `useAccessLists`           | `useAccessList.ts` / `useAccessLists.ts`           | Access-List CRUD       |
| `useUser` / `useUsers`                       | `useUser.ts` / `useUsers.ts`                       | Benutzer CRUD          |
| `useAuditLog` / `useAuditLogs`               | `useAuditLog.ts` / `useAuditLogs.ts`               | Audit-Log Abfrage      |
| `useCloudflaredTunnel`                       | `useCloudflaredTunnel.ts`                          | CF-Tunnel CRUD         |
| `useTorOnion`                                | `useTorOnion.ts`                                   | Tor-Service CRUD       |
| `useWireguardPeer`                           | `useWireguardPeer.ts`                              | WireGuard CRUD         |
| `useDashboardNotes`                          | `useDashboardNotes.ts`                             | Dashboard-Notizen CRUD |
| `useDnsProviders`                            | `useDnsProviders.ts`                               | DNS-Provider           |

### Utility Hooks

| Hook              | Datei                | Zweck                                                   |
| ----------------- | -------------------- | ------------------------------------------------------- |
| `useSetting`      | `useSetting.ts`      | Einstellungen laden/speichern                           |
| `useGitOps`       | `useGitOps.ts`       | GitOps-Operationen                                      |
| `useGitSync`      | `useGitSync.ts`      | Git-Sync für einzelne Hosts                             |
| `useHealth`       | `useHealth.ts`       | Health-Check                                            |
| `useHostReport`   | `useHostReport.ts`   | Host-Reports                                            |
| `useCheckVersion` | `useCheckVersion.ts` | Versionsprüfung                                         |
| `useTheme`        | `useTheme.ts`        | Theme-Zugriff                                           |
| `useObjectUrl`    | `useObjectUrl.ts`    | Verwaltet und bereinigt Blob-URLs für lokale Vorschauen |
| `use-toast`       | `use-toast.ts`       | Toast-Benachrichtigungen                                |

## React-Kontexte (`frontend/src/context/`)

| Context         | Datei                      | Zweck                                                 |
| --------------- | -------------------------- | ----------------------------------------------------- |
| `AuthContext`   | `AuthContext.tsx` (3.3 KB) | Authentifizierungszustand (User, Token, Login/Logout) |
| `LocaleContext` | `LocaleContext.tsx` (1 KB) | Sprachwahl-Zustand (i18n)                             |
| `ThemeContext`  | `ThemeContext.tsx` (2 KB)  | Dark/Light-Mode Zustand                               |

## Frontend-Module (`frontend/src/modules/`)

| Modul         | Datei                      | Zweck                            |
| ------------- | -------------------------- | -------------------------------- |
| `AuthStore`   | `AuthStore.ts` (1.7 KB)    | Token-Speicherung (localStorage) |
| `Permissions` | `Permissions.ts` (1.8 KB)  | Berechtigungslogik               |
| `Validations` | `Validations.tsx` (2.8 KB) | Formular-Validierungsregeln      |

## Modals (`frontend/src/modals/`)

21 Dialog-Komponenten für CRUD-Operationen:

| Modal                    | Datei                          | Größe  | Zweck                                          |
| ------------------------ | ------------------------------ | ------ | ---------------------------------------------- |
| ProxyHostModal           | `ProxyHostModal.tsx`           | 53 KB  | Proxy-Host erstellen/bearbeiten (größte Datei) |
| AccessListModal          | `AccessListModal.tsx`          | 30 KB  | Access-List Verwaltung                         |
| UserModal                | `UserModal.tsx`                | 17 KB  | Benutzer erstellen/bearbeiten                  |
| PermissionsModal         | `PermissionsModal.tsx`         | 14 KB  | Berechtigungen setzen                          |
| RedirectionHostModal     | `RedirectionHostModal.tsx`     | 13 KB  | Redirect erstellen/bearbeiten                  |
| CustomCertificateModal   | `CustomCertificateModal.tsx`   | 12 KB  | Custom-Zertifikat hochladen                    |
| DdnsProviderModal        | `DdnsProviderModal.tsx`        | 12 KB  | DDNS-Provider konfigurieren                    |
| StreamModal              | `StreamModal.tsx`              | 9 KB   | Stream erstellen/bearbeiten                    |
| InternalCertificateModal | `InternalCertificateModal.tsx` | 9 KB   | Internes Zertifikat                            |
| ChangePasswordModal      | `ChangePasswordModal.tsx`      | 9 KB   | Passwort ändern                                |
| DeadHostModal            | `DeadHostModal.tsx`            | 7 KB   | Dead-Host erstellen/bearbeiten                 |
| HTTPCertificateModal     | `HTTPCertificateModal.tsx`     | 6 KB   | HTTP-Challenge-Zertifikat                      |
| DashboardNoteModal       | `DashboardNoteModal.tsx`       | 6 KB   | Dashboard-Notiz bearbeiten                     |
| SetPasswordModal         | `SetPasswordModal.tsx`         | 5 KB   | Passwort setzen                                |
| DNSCertificateModal      | `DNSCertificateModal.tsx`      | 4 KB   | DNS-Challenge-Zertifikat                       |
| EventDetailsModal        | `EventDetailsModal.tsx`        | 3.5 KB | Audit-Event-Details                            |
| DeleteConfirmModal       | `DeleteConfirmModal.tsx`       | 3 KB   | Lösch-Bestätigung                              |
| RenewCertificateModal    | `RenewCertificateModal.tsx`    | 3 KB   | Zertifikat erneuern                            |
| HelpModal                | `HelpModal.tsx`                | 2.4 KB | Hilfe-Dialog                                   |

## Types (`frontend/src/types/`)

| Datei             | Zweck                                               |
| ----------------- | --------------------------------------------------- |
| `enums.ts` (8 KB) | Zentrale Enum-Definitionen für das gesamte Frontend |

## Lib (`frontend/src/lib/`)

| Datei                    | Zweck                             |
| ------------------------ | --------------------------------- |
| `serviceIcons.ts` (9 KB) | Mapping von Servicenamen zu Icons |
| `utils.ts` (168 B)       | Tailwind `cn()` Utility           |

## Notifications (`frontend/src/notifications/`)

Beinhaltet Hilfsfunktionen für Toast-Benachrichtigungen.

- `helpers.tsx`: Enthält `showSuccess`, `showError` und `showObjectSuccess`, welche die Toast-API (`use-toast`) und Internationalisierung (`intl`) nutzen.

## Weitere Komponenten-Strukturen

- `frontend/src/components/Nginx/`: Modale Komponenten für Nginx-Erweiterungen — `CloudflaredTunnelModal.tsx`, `TorOnionModal.tsx`, `WireguardConfigModal.tsx`, `WireguardPeerModal.tsx`.
- `frontend/src/components/Form/`: Wiederverwendbare Formularfelder — `AccessClientFields.tsx`, `AccessField.tsx`, `BasicAuthFields.tsx`, `DNSProviderFields.tsx`, `DomainNamesField.tsx`, `LocationsFields.tsx`, `NginxConfigField.tsx`, `SSLCertificateField.tsx`, `SSLOptionsFields.tsx`.

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

## Verwandte Seiten

- [Komponenten](./komponenten.md)
- [Screens & Pages](./screens.md)
- [Theme & Styling](./theme.md)
