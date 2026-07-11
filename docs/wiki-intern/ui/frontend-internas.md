# Frontend-Internas

## Zweck

Dokumentation der internen Frontend-Architektur: Hooks, Contexts, Modules, Modals, Types und Lib.

## Kontext

Das Frontend verwendet React 19 mit TypeScript. Die interne Architektur folgt dem Prinzip der Trennung von Zustand (Contexts/Modules), Datenzugriff (Hooks), UI-Logik (Modals) und Hilfsmodulen (Lib).

## Lokalisierung und Entwicklungswerkzeuge

- `locale/IntlProvider.tsx` behält Englisch und die Sprachbezeichnungen im Start-Bundle; die übrigen Sprachdateien werden erst für die ausgewählte Sprache geladen. `main.tsx` wartet vor dem ersten Render auf `initializeLocale()`, damit keine englische Zwischenansicht erscheint.
- `components/LocaleRefreshBoundary.tsx` aktualisiert nach einem Sprachwechsel den `RawIntlProvider` und rendert den UI-Unterbaum neu, ohne das Dokument neu zu laden. Die gemeinsame `queryClient`-Instanz bleibt dabei erhalten; bereits geladene React-Query-Daten werden nicht verworfen.
- `context/AuthContext.tsx` leert vor einem direkten Passwort-Login, einem beanspruchten OIDC-Token oder einem erfolgreich verifizierten 2FA-Token den gemeinsamen React-Query-Cache und übernimmt den Token anschließend in `AuthStore` sowie den Auth-Status. Bei einem Benutzerwechsel oder der Wiederherstellung der Administrator-Sitzung wird der Cache ebenfalls geleert und der Session-Unterbaum per versioniertem React-Fragment neu gemountet. Bei einer nicht stillen 401-Antwort veröffentlicht `api/backend/base.ts` nach dem Leeren von `AuthStore` und Cache das Ereignis `shieldpm:authentication-expired`; der `AuthProvider` wechselt dadurch ohne Dokument-Reload zur Login-Ansicht. Der öffentliche Pfad `/duo-callback` bleibt auch ohne Authentisierung im Router erreichbar und übergibt einen erfolgreichen Duo-Token an `completeLogin`, bevor er per React-Router-Navigation ersetzend zu `/` wechselt. Diese Login-, Wechsel- und Ablauf-Flows aktualisieren damit den angemeldeten UI-Zustand ohne Dokument-Reload.
- `components/QueryDevtools.tsx` lädt die React-Query-Devtools nur im Entwicklungsmodus dynamisch. Der Produktions-Build enthält keinen Devtools-Import.
- `modals/account-lazy.ts` lädt `UserModal.tsx` und `ChangePasswordModal.tsx` erst bei einer Kontoaktion. `SiteHeader.tsx` verwendet diesen kleinen Konto-Loader, damit die global eingebundene Kopfzeile keine Metadaten für andere Dialoge enthält. Alle übrigen Dialogaktionen sind in route- oder featureeigenen `lazy.ts`- bzw. `*.lazy.ts`-Loadern gekapselt (`Users`, `Certificates`, `Access`, `AuditLog`, `Dashboard` und Nginx-Seiten). Diese speichern den jeweiligen Import-Promise, verwerfen ihn bei Ladefehlern und verwenden die bestehende Fehler-Toast-Schicht. Dadurch bleiben die Dialogimporte an Nutzeraktionen gebunden und von den initialen Routen-Chunks getrennt.
- Das ungenutzte exportierende Modal-Barrel `modals/index.ts` und der nicht mehr referenzierte generische Loader `modals/lazy.ts` existieren nicht mehr. Ein Regressionstest verhindert ihre Wiedereinführung, damit künftige statische Importe nicht versehentlich wieder mehrere Dialogmodule koppeln.
- `Nginx/DeadHosts/lazy.ts` kapselt die Dead-Host-, Lösch- und Hilfe-Aktionen. `Nginx/DeadHosts/TableWrapper.tsx` bindet nur diesen Routen-Loader ein; die Dialogimporte bleiben an die jeweiligen Nutzeraktionen gebunden.
- `Nginx/ProxyHosts/lazy.ts` kapselt die Proxy-Host-, Access-List-, Lösch- und Hilfe-Aktionen. Der wiederverwendbare `AccessListFormatter` delegiert seine Aktion an die Routen-Tabelle, sodass die Proxy-Host-Route nur ihren eigenen Loader nutzt.
- `Nginx/RedirectionHosts/lazy.ts` kapselt die Redirect-Host-, Lösch- und Hilfe-Aktionen. `Nginx/RedirectionHosts/TableWrapper.tsx` bindet nur diesen Routen-Loader ein; die Dialogimporte bleiben an die jeweiligen Nutzeraktionen gebunden.
- `Nginx/DdnsProviders/lazy.ts` kapselt die DDNS-Provider-, Lösch- und Hilfe-Aktionen. `Nginx/DdnsProviders/TableWrapper.tsx` bindet nur diesen Routen-Loader ein; die Dialogimporte bleiben an die jeweiligen Nutzeraktionen gebunden.
- `Dashboard/lazy.ts` kapselt den Dashboard-Notiz-Dialog. `DashboardNotesWidget.tsx` bindet nur diesen Routen-Loader ein; der Notiz-Dialog wird weiterhin erst bei einer Nutzeraktion importiert.
- `Nginx/Streams/lazy.ts` kapselt die Stream-, Lösch- und Hilfe-Aktionen. `Nginx/Streams/TableWrapper.tsx` bindet nur diesen Routen-Loader ein; die drei Dialogimporte bleiben an Nutzeraktionen gebunden.
- `Router.tsx` importiert die Komponenten der dauerhaft gerenderten Anwendungshülle direkt statt über `components/index.ts`; ein Regressionstest verhindert die erneute statische Abhängigkeit vom Komponenten-Barrel.

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

`hooks/pollingPolicy.ts` bündelt die Intervallentscheidung für wiederkehrende React-Query-Abfragen. Sie pausiert bei
ausgeblendeter Seite oder Offline-Status und verdoppelt das Intervall nach Fehlern bis zum jeweiligen Maximum.
`hooks/usePollingEnvironment.ts` aktualisiert diesen Browser-Zustand bei Sichtbarkeits- sowie Online-/Offline-Ereignissen,
damit ein pausiertes Intervall beim Wiederherstellen der Verbindung erneut geplant wird. `useHealth`, `useHostReport`
und `useGitSyncStatus` nutzen die Policy bereits; die reine Intervallfunktion bleibt unabhängig vom Browser-Zustand
testbar, damit weitere Polling-Hooks dieselbe Entscheidung übernehmen können.

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

| Modal                    | Datei                          | Größe  | Zweck                                           |
| ------------------------ | ------------------------------ | ------ | ----------------------------------------------- |
| ProxyHostModal           | `ProxyHostModal.tsx`           | 53 KB  | Proxy-Host erstellen/bearbeiten (größte Datei)  |
| AccessListModal          | `AccessListModal.tsx`          | 30 KB  | Access-List Verwaltung                          |
| UserModal                | `UserModal.tsx`                | 17 KB  | Benutzer erstellen/bearbeiten und Avatar-Upload |
| PermissionsModal         | `PermissionsModal.tsx`         | 14 KB  | Berechtigungen setzen                           |
| RedirectionHostModal     | `RedirectionHostModal.tsx`     | 13 KB  | Redirect erstellen/bearbeiten                   |
| CustomCertificateModal   | `CustomCertificateModal.tsx`   | 12 KB  | Custom-Zertifikat hochladen                     |
| DdnsProviderModal        | `DdnsProviderModal.tsx`        | 12 KB  | DDNS-Provider konfigurieren                     |
| StreamModal              | `StreamModal.tsx`              | 9 KB   | Stream erstellen/bearbeiten                     |
| InternalCertificateModal | `InternalCertificateModal.tsx` | 9 KB   | Internes Zertifikat                             |
| ChangePasswordModal      | `ChangePasswordModal.tsx`      | 9 KB   | Passwort ändern                                 |
| DeadHostModal            | `DeadHostModal.tsx`            | 7 KB   | Dead-Host erstellen/bearbeiten                  |
| HTTPCertificateModal     | `HTTPCertificateModal.tsx`     | 6 KB   | HTTP-Challenge-Zertifikat                       |
| DashboardNoteModal       | `DashboardNoteModal.tsx`       | 6 KB   | Dashboard-Notiz bearbeiten                      |
| SetPasswordModal         | `SetPasswordModal.tsx`         | 5 KB   | Passwort setzen                                 |
| DNSCertificateModal      | `DNSCertificateModal.tsx`      | 4 KB   | DNS-Challenge-Zertifikat                        |
| EventDetailsModal        | `EventDetailsModal.tsx`        | 3.5 KB | Audit-Event-Details                             |
| DeleteConfirmModal       | `DeleteConfirmModal.tsx`       | 3 KB   | Lösch-Bestätigung                               |
| RenewCertificateModal    | `RenewCertificateModal.tsx`    | 3 KB   | Zertifikat erneuern                             |
| HelpModal                | `HelpModal.tsx`                | 2.4 KB | Hilfe-Dialog                                    |

Schlägt der Avatar-Upload nach dem Speichern eines Benutzers fehl, bleibt der Dialog geöffnet und zeigt die
Fehlermeldung an. Erfolgsmeldung und Schließen des Dialogs erfolgen erst nach einem erfolgreichen Avatar-Upload,
sodass der Upload direkt erneut versucht werden kann.

Die Demo-Sperre sowie die Avatar- und Sicherheits-Tabs des `UserModal` verwenden ausschließlich lokalisierte
Nachrichten; `user.security` ist in allen 13 unterstützten Locale-Dateien hinterlegt.

Der Avatar-Bereich des `UserModal` lokalisiert Vorschau, Quelle, Gravatar-Hinweis, URL- und Upload-Felder über
`user.avatar.*`. Die 13 Locale-Dateien enthalten auch lokalisierte Platzhalter und Upload-Hinweise; bei einem
unbekannten Ladefehler nutzt der Dialog `error.unknown` statt eines fest codierten englischen Texts.

`SetPasswordModal.tsx` beschriftet die Icon-Aktionen zum Anzeigen/Verstecken und Generieren eines Passworts über die
vorhandenen lokalisierten Schlüssel `password.show`, `password.hide` und `password.generate`. Der
Sichtbarkeitsumschalter veröffentlicht seinen Zustand zusätzlich mit `aria-pressed` und bleibt per Tastatur erreichbar.

`ChangePasswordModal.tsx` verwendet dieselben lokalisierten Schlüssel für die Umschalter des aktuellen, neuen und
wiederholten Passworts sowie für den Generator. Alle drei Umschalter veröffentlichen ihren Zustand mit `aria-pressed`
und sind nicht mehr aus der Tab-Reihenfolge ausgeschlossen.

`Form/LocationsFields.tsx` verwendet für die Icon-Aktion zum Ein- und Ausblenden der erweiterten Standortoptionen den
in allen 13 Locales vorhandenen Schlüssel `action.advanced-settings` als sichtbaren Tooltip und zugänglichen Namen.

`Certificates/TableWrapper.tsx` beschriftet seine Icon-Aktion für die Hilfe mit dem in allen 13 Locales vorhandenen
Schlüssel `action.help` als zugänglichen Namen.

`Access/TableWrapper.tsx` verwendet für seine gleichartige Hilfe-Icon-Aktion ebenfalls den vorhandenen lokalisierten
Schlüssel `action.help` als zugänglichen Namen.

Die Nginx-Tabellen für DDNS-Anbieter, Dead Hosts, Proxy Hosts, Redirection Hosts und Streams verwenden für ihre
Hilfe-Icon-Aktionen ebenfalls `action.help`. Dadurch haben die fünf gleichartigen Controls in allen 13 Locales einen
zugänglichen Namen; `table-help-controls.test.tsx` sichert die deutsche Screenreader-Ausgabe als Regressionstest ab.

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
