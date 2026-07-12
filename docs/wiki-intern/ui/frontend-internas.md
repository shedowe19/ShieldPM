# Frontend-Internas

## Zweck

Dokumentation der internen Frontend-Architektur: Hooks, Contexts, Modules, Modals, Types und Lib.

## Kontext

Das Frontend verwendet React 19 mit TypeScript. Die interne Architektur folgt dem Prinzip der Trennung von Zustand (Contexts/Modules), Datenzugriff (Hooks), UI-Logik (Modals) und Hilfsmodulen (Lib).

## Lokalisierung und Entwicklungswerkzeuge

- `locale/IntlProvider.tsx` behält Englisch und die Sprachbezeichnungen im Start-Bundle; die übrigen Sprachdateien werden erst für die ausgewählte Sprache geladen. `main.tsx` wartet vor dem ersten Render auf `initializeLocale()`, damit keine englische Zwischenansicht erscheint.
- `components/LocaleRefreshBoundary.tsx` aktualisiert nach einem Sprachwechsel den `RawIntlProvider` und rendert den UI-Unterbaum neu, ohne das Dokument neu zu laden. Die gemeinsame `queryClient`-Instanz bleibt dabei erhalten; bereits geladene React-Query-Daten werden nicht verworfen.
- `components/Flag.tsx` importiert nur die 13 für `localeOptions` benötigten Länderflaggen direkt statt des vollständigen `country-flag-icons/react/3x2`-Barrels. Da `LocalePicker.tsx` dauerhaft im Header gerendert wird, bleibt die vollständige Flaggenbibliothek aus dem initialen Anwendungseinstieg; die Lookup-Tabelle akzeptiert nur eigene Flaggen-Einträge. `Flag.test.ts` sichert die direkte Importgrenze für alle unterstützten Locales.
- `context/AuthContext.tsx` leert vor einem direkten Passwort-Login, einem beanspruchten OIDC-Token oder einem erfolgreich verifizierten 2FA-Token den gemeinsamen React-Query-Cache und übernimmt den Token anschließend in `AuthStore` sowie den Auth-Status. Bei einem Benutzerwechsel oder der Wiederherstellung der Administrator-Sitzung wird der Cache ebenfalls geleert und der Session-Unterbaum per versioniertem React-Fragment neu gemountet. Bei einer nicht stillen 401-Antwort veröffentlicht `api/backend/base.ts` nach dem Leeren von `AuthStore` und Cache das Ereignis `shieldpm:authentication-expired`; der `AuthProvider` wechselt dadurch ohne Dokument-Reload zur Login-Ansicht. Der öffentliche Pfad `/duo-callback` bleibt auch ohne Authentisierung im Router erreichbar und übergibt einen erfolgreichen Duo-Token an `completeLogin`, bevor er per React-Router-Navigation ersetzend zu `/` wechselt. Diese Login-, Wechsel- und Ablauf-Flows aktualisieren damit den angemeldeten UI-Zustand ohne Dokument-Reload.
- `components/QueryDevtools.tsx` lädt die React-Query-Devtools nur im Entwicklungsmodus dynamisch. Der Produktions-Build enthält keinen Devtools-Import.
- `modals/account-lazy.ts` lädt `UserModal.tsx` und `ChangePasswordModal.tsx` erst bei einer Kontoaktion. `SiteHeader.tsx` verwendet diesen kleinen Konto-Loader, damit die global eingebundene Kopfzeile keine Metadaten für andere Dialoge enthält. Alle übrigen Dialogaktionen sind in route- oder featureeigenen `lazy.ts`- bzw. `*.lazy.ts`-Loadern gekapselt (`Users`, `Certificates`, `Access`, `AuditLog`, `Dashboard` und Nginx-Seiten). Diese speichern den jeweiligen Import-Promise, verwerfen ihn bei Ladefehlern und verwenden die bestehende Fehler-Toast-Schicht. Dadurch bleiben die Dialogimporte an Nutzeraktionen gebunden und von den initialen Routen-Chunks getrennt.
- `HelpModal.tsx` enthält nur Dialograhmen und Schließen-Aktion. Die beim Öffnen begonnene, fehlerisolierte dynamische Ladung von `HelpContent.tsx` verschiebt HelpDoc-Auflösung und Markdown-Renderer in den Inhalts-Chunk, während der Rahmen sofort angezeigt werden kann. `HelpContentBoundary` hält bei einer abgelehnten Chunk-Ladung einen lokalisierten Fehler-Fallback im Dialog sichtbar. Der Produktions-Build reduzierte den Hilfe-Dialog-Entry von 87,98 kB (35,50 kB gzip) auf 1,67 kB (0,85 kB gzip); `HelpContent` enthält die bedarfsabhängigen 87,74 kB (35,36 kB gzip). `HelpModal.lazy.test.ts`, `HelpContentBoundary.test.tsx`, `HelpContent.test.tsx` und `HelpMarkdown.test.tsx` sichern Ladegrenze, Chunk-/Fetch-Fehler, lokalisierte Dokumentauflösung, Wechsel der Sektion und Rendering ab.
- Das ungenutzte exportierende Modal-Barrel `modals/index.ts` und der nicht mehr referenzierte generische Loader `modals/lazy.ts` existieren nicht mehr. Ein Regressionstest verhindert ihre Wiedereinführung, damit künftige statische Importe nicht versehentlich wieder mehrere Dialogmodule koppeln.
- `Nginx/DeadHosts/lazy.ts` kapselt die Dead-Host-, Lösch- und Hilfe-Aktionen. `Nginx/DeadHosts/TableWrapper.tsx` bindet nur diesen Routen-Loader ein; die Dialogimporte bleiben an die jeweiligen Nutzeraktionen gebunden.
- `Nginx/ProxyHosts/lazy.ts` kapselt die Proxy-Host-, Access-List-, Lösch- und Hilfe-Aktionen. Der wiederverwendbare `AccessListFormatter` delegiert seine Aktion an die Routen-Tabelle, sodass die Proxy-Host-Route nur ihren eigenen Loader nutzt.
- `Nginx/RedirectionHosts/lazy.ts` kapselt die Redirect-Host-, Lösch- und Hilfe-Aktionen. `Nginx/RedirectionHosts/TableWrapper.tsx` bindet nur diesen Routen-Loader ein; die Dialogimporte bleiben an die jeweiligen Nutzeraktionen gebunden.
- `Nginx/DdnsProviders/lazy.ts` kapselt die DDNS-Provider-, Lösch- und Hilfe-Aktionen. `Nginx/DdnsProviders/TableWrapper.tsx` bindet nur diesen Routen-Loader ein; die Dialogimporte bleiben an die jeweiligen Nutzeraktionen gebunden.
- `Dashboard/lazy.ts` kapselt den Dashboard-Notiz-Dialog. `DashboardNotesWidget.tsx` bindet nur diesen Routen-Loader ein; der Notiz-Dialog wird weiterhin erst bei einer Nutzeraktion importiert.
- `Nginx/Streams/lazy.ts` kapselt die Stream-, Lösch- und Hilfe-Aktionen. `Nginx/Streams/TableWrapper.tsx` bindet nur diesen Routen-Loader ein; die drei Dialogimporte bleiben an Nutzeraktionen gebunden.
- `Router.tsx` importiert die Komponenten der dauerhaft gerenderten Anwendungshülle direkt statt über `components/index.ts`; ein Regressionstest verhindert die erneute statische Abhängigkeit vom Komponenten-Barrel.
- Die dauerhaft sichtbaren Header-, Berechtigungs-, Sprach- und Ladecontrols verwenden ebenfalls direkte Dateipfade statt des Komponenten-Barrels. `components/Form/index.ts` exportiert die Code-Editor-Felder `LocationsFields` und `NginxConfigField` bewusst nicht: Proxy-, Redirect- und Dead-Host-Formulare importieren sie direkt. Dadurch bleiben `@uiw/react-textarea-code-editor` und seine `refractor`-Abhängigkeiten in den jeweiligen On-Demand-Formular-Chunks statt im initialen Anwendungseinstieg; `app-shell-component-imports.test.ts` und `Form/code-editor-imports.test.ts` sichern diese Importgrenzen.
- `components/LazyCodeEditor.tsx` kapselt den Code-Editor zusätzlich hinter einem renderabhängigen `React.lazy()`-Import. `LocationsFields` fordert den Editor daher erst beim Öffnen der erweiterten Standortoptionen an; `DefaultSite` erst nach Wahl der HTML-Variante, `NginxConfigField` erst beim Rendern des erweiterten Host-Tabs und `EventDetailsModal` erst nach Auswahl eines Audit-Eintrags mit geladenen Metadaten. Der 0,80-kB-Loader übernimmt währenddessen eine höhenstabile Placeholder-Fläche, während der eigentliche Editor-Chunk (813,48 kB / 286,51 kB gzip) nur bei einer dieser Nutzeraktionen geladen wird. Dadurch hängt weder das Öffnen eines Host-Dialogs noch das Laden des Audit-Details-Dialogs direkt am großen Editor-Chunk. `Form/code-editor-imports.test.ts` sichert die dynamische Importgrenze und alle vier Konsumenten.
- Die Vite-Chunk-Regeln bündeln nur stabile React-, Daten- und Hilfsbibliotheken explizit. React Query samt Query-Core bleibt als `vendor-query` beim Start verfügbar; React Table liegt dagegen als `vendor-table` außerhalb der App-Hülle. Zod, React Hook Form und die Resolver erhalten bewusst keinen manuellen Chunk mehr, damit Rolldown sie ausschließlich an ihre bedarfsabhängigen Routen und Dialoge bindet. Radix-, Icon- und Motion-Module werden ebenfalls nicht pauschal in `vendor-ui` zusammengezogen, weil eine einzige dauerhaft benötigte UI-Abhängigkeit sonst alle route-spezifischen Controls beim Start nachlädt. In der statischen Rollup-Start-Closure des Produktions-Builds sank die JavaScript-Größe dadurch von 261.241 auf 222.012 Byte gzip (39.229 Byte weniger); `vendor-table` und der Formular-Chunk sind nicht mehr vorgeladen. `vite.config.test.ts` sichert die UI-, Query-, Tabellen- und Formulargrenzen.
- Die direkt vom Router erreichbaren Fallbacks `ErrorNotFound.tsx` und `Unhealthy.tsx` importieren `Button` beziehungsweise `Page` ebenfalls ohne `components/index.ts`. Damit zieht ein Fehler- oder Health-Fallback nicht mehr den Form-/`react-select`-Teil des Komponenten-Barrels in den initialen Einstieg. Im Produktions-Build sank dessen Entry-Chunk dadurch von 303,72 kB (91,71 kB gzip) auf 130,30 kB (38,91 kB gzip); der ausgelagerte Komponenten-Chunk wird nicht mehr per `modulepreload` geladen. Der erweiterte Test `app-shell-component-imports.test.ts` schützt alle unmittelbaren Shell- und Fallback-Abhängigkeiten gegen eine erneute Barrel-Importkette.
- `Router.tsx` sowie die dauerhaft gerenderten Komponenten `HasPermission`, `SiteHeader`, `SiteFooter` und `ThemeSwitcher` importieren ihre jeweiligen Hooks direkt statt über `hooks/index.ts`. Dadurch bleibt der vollständige Hooks-Barrel aus dem initialen Anwendungseinstieg: Im Produktions-Build sank dessen `index`-Chunk von 130,54 kB (39,00 kB gzip) auf 102,98 kB (32,66 kB gzip). Die für Lazy-Routen benötigten Hook- und Backend-Module liegen weiterhin in bedarfsabhängigen Chunks. `app-shell-hook-imports.test.ts` sichert die direkte Importgrenze; die Router- und Shell-Komponententests mocken dieselben konkreten Hook-Module.
- Auch die direkt erreichbaren öffentlichen Routen `Login` und `Setup` importieren `LocalePicker` und `ThemeSwitcher` ohne das Komponenten-Barrel. Dadurch lädt ihr erster Aufruf den weiterhin 129,62 kB (40,76 kB gzip) großen, von anderen Routen benötigten Komponenten-Chunk nicht mehr: Die eigenen Route-Chunks sanken von 7,92 auf 7,89 kB beziehungsweise von 3,57 auf 3,53 kB. `public-entry-component-imports.test.ts` sichert die beiden Importgrenzen.
- Die lazy geladene `Settings`-Route importiert `HasPermission` und `Loading` in ihrem Einstieg sowie den drei eingebetteten Tabs direkt. Damit enthält ihr Built-Chunk keine statische Referenz mehr auf den gemeinsamen Komponenten-Chunk; der separate Download entfällt beim ersten Besuch der Einstellungen. Im gemessenen Produktions-Build sank `Settings` von 25,70 kB (5,97 kB gzip) auf 25,66 kB (5,95 kB gzip) und der weiterhin für andere Routen benötigte Komponenten-Chunk von 129,65 kB (40,82 kB gzip) auf 129,38 kB (40,75 kB gzip). `pages/Settings/component-imports.test.ts` verhindert die erneute Barrel-Abhängigkeit.
- Die häufig besuchte, lazy geladene Dashboard-Route importiert `HasPermission`, `useHostReport`, `useUser`, `useCertificates` und `useDashboardNotes` in ihrem Einstieg sowie den beiden Widgets direkt. Das vermeidet die vollständigen Komponenten- und Hooks-Barrels beim Laden des Dashboards. Im gemessenen Produktions-Build sank der Dashboard-Chunk von 11,86 kB (3,40 kB gzip) auf 11,48 kB (3,22 kB gzip), der Komponenten-Chunk von 129,43 kB (40,76 kB gzip) auf 126,56 kB (39,85 kB gzip) und der Hooks-Chunk von 11,25 kB (2,84 kB gzip) auf 10,39 kB (2,63 kB gzip). `pages/Dashboard/barrel-imports.test.ts` sichert die drei Importgrenzen; die bestehenden Widget-Tests mocken die konkreten Hook-Module.
- Die lazy geladene Benutzerverwaltung importiert `HasPermission`, `LoadingPage`, ihre drei Daten-Hooks und ihre Tabellenformatierer direkt. Auch `EmptyData.tsx` nutzt `HasPermission` ohne Komponenten-Barrel; dadurch führt die leere Tabelle den Barrel nicht indirekt wieder ein. Im Produktions-Build fiel der weiterhin geteilte Komponenten-Chunk von 126,56 kB (39,85 kB gzip) auf 121,75 kB (38,29 kB gzip) und der Hooks-Chunk von 10,39 auf 10,34 kB (je 2,63 kB gzip); der `Users`-Chunk stieg dabei nur von 8,56 kB (3,00 kB gzip) auf 8,75 kB (3,08 kB gzip). Er referenziert die geteilten Chunks weiterhin für tatsächlich gemeinsam genutzte UI, lädt aber keinen vollständigen Barrel-Export mehr. `pages/Users/barrel-imports.test.ts` schützt die direkten Importgrenzen; `TableWrapper.test.tsx` mockt hierfür die konkreten Hook-Module.
- Die lazy geladene Zertifikatsverwaltung importiert Berechtigungs-, Lade-, Tabellenformatierer- und Daten-Hook-Module ebenfalls direkt. Dadurch kann die Route keine statische Abhängigkeit auf `components/index.ts` oder `hooks/index.ts` mehr einführen; `pages/Certificates/barrel-imports.test.ts` schützt diese Grenze, und `TableWrapper.test.tsx` mockt die konkreten Module. Im aktuellen Produktions-Build sank der `Certificates`-Chunk von 10,63 auf 10,60 kB bei unverändert 3,36 kB gzip; der noch von anderen Routen verwendete Komponenten-Chunk blieb bei 121,75 kB (gzip rundungsbedingt 38,29 auf 38,30 kB). Die direkte Grenze ist damit abgesichert, ohne einen nicht belegten größeren Bundlegewinn zu behaupten.
- `Router.tsx` stellt für die authentifizierte Anwendungshülle nur Framer Motions `domAnimation`-Feature-Bündel über `LazyMotion` bereit. `AnimatedPage`, der erweiterte `Button` und das Dashboard verwenden die schlanke `m`-Factory; `TableBody` behält Ein- und Ausblendungen mit demselben Bündel, verzichtet aber auf die teure Layout-Projektion. Im Produktions-Build sank die unverändert aus `index` und `avatar` vorgeladene Animationslast zusammen von 336,49 kB (108,69 kB gzip) auf 292,58 kB (97,40 kB gzip). `framer-motion-features.test.ts` sichert die Feature-Grenzen, `TableBody.test.tsx` die verwendete Factory.
- Der Audit-Log-Fehlerzustand verwendet in Tabelle und Detaildialog die vorhandenen Schlüssel `error.title` und `error.unknown`. Der Detaildialog lokalisiert außerdem die Überschrift der Metadaten sowie den in Demo-Daten maskierten Wert über `audit-log.metadata` und `audit-log.hidden-demo`; beide Schlüssel sind nativ in allen 13 Locales hinterlegt. `EventDetailsModal.test.tsx` und `AuditLog/TableWrapper.test.tsx` sichern die deutschen Fehler-, Metadaten- und Maskierungswerte gegen englische Rückfälle ab.

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

`hooks/pollingPolicy.ts` bündelt die Intervallentscheidung für wiederkehrende React-Query-Abfragen und die
Summary-/Zeitreihenabfrage der Analytics-Seite. Sie pausiert bei ausgeblendeter Seite oder Offline-Status und verdoppelt
das Intervall nach Fehlern bis zum jeweiligen Maximum; ein erfolgreicher Analytics-Lauf setzt das Grundintervall zurück.
`hooks/usePollingEnvironment.ts` aktualisiert diesen Browser-Zustand bei Sichtbarkeits- sowie Online-/Offline-Ereignissen,
damit ein pausiertes Intervall beim Wiederherstellen der Verbindung erneut geplant wird. `useHealth`, `useHostReport`,
`useGitSyncStatus`, `useCheckVersion`, `useWireguardPeers` und die Analytics-Seite nutzen die Policy bereits; die reine
Intervallfunktion bleibt unabhängig vom Browser-Zustand testbar, damit weitere Polling-Pfade dieselbe Entscheidung
übernehmen können.

`pages/Analytics/useAnalyticsLiveMetrics.ts` verwendet für Netzwerkdurchsatz und Datenbankstatistiken getrennte
Polling-Zyklen. Der Netzwerkstatus bleibt bei zwei Sekunden, während Datenbankstatistiken nur beim Start,
bei Sichtbarkeits-/Online-Reaktivierung und danach alle 30 Sekunden geladen werden. Eigene In-Flight-Sperren verhindern,
dass ein langsamer Datenbankabruf den Durchsatz-Takt verzögert.

`pages/Analytics/AnalyticsTopLists.tsx` kapselt die vier Karten für Top-IP-Adressen, Referrer, Pfade und User-Agents.
Die Komponente übernimmt die vorhandene Zusammenfassung sowie den Demo-Status unverändert, damit IP-Adressen weiterhin
maskiert und leere Listen lokalisiert dargestellt werden. `AnalyticsTopLists.test.tsx` sichert diese Datenweitergabe und
die IP-Maskierung ab.

`pages/Analytics/AnalyticsRecentRequests.tsx` kapselt die Tabelle der letzten Requests. Die Komponente übernimmt die
Zusammenfassung und den Demo-Status unverändert, behält lokalisierte Tabellenüberschriften, Statusfarben und
Request-Details bei und maskiert Client-IP-Adressen im Demo-Modus. `AnalyticsRecentRequests.test.tsx` sichert diese
Maskierung bei weiterhin sichtbaren Request-Details ab.

`pages/Analytics/AnalyticsKpis.tsx` kapselt die vier Kennzahlen für Anfragen, Erfolgsquote, Live-Bandbreite und
Datenbankstatus. Die Komponente übernimmt die bestehende Zahlenformatierung sowie alle lokalisierten Titel und
Beschreibungen unverändert; `AnalyticsKpis.test.tsx` sichert Werte und Kennzeichnungen der Karten ab.

`pages/Analytics/AnalyticsGeography.tsx` fasst die Länderübersicht aus Kartenrahmen, verzögert geladener Weltkarte und
Top-Länderliste zusammen. Beide Kindkomponenten erhalten dieselbe Analytics-Zusammenfassung; damit bleibt die Route
für Polling und Datenabruf zuständig, während die geografische Darstellung zusammenhängend bleibt.
`AnalyticsGeography.test.tsx` sichert Titel und Datenweitergabe an Karte und Länderliste ab.

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
| ProxyHostModal           | `ProxyHostModal.tsx`           | 17 KB  | Proxy-Host erstellen/bearbeiten (größte Datei)  |
| AccessListModal          | `AccessListModal.tsx`          | 14 KB  | Access-List Verwaltung                          |
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
unbekannten Lade- oder Speicherkonflikt nutzt der Dialog `error.unknown` statt eines fest codierten englischen Texts.

`UserAvatarTab.tsx` kapselt diesen Avatar-Tab als Formik-Kind. Die Auswahl einer lokalen Datei und ihre Blob-URL bleiben
im übergeordneten `UserModal`, damit die Vorschau sowie der Upload nach dem Speichern unverändert funktionieren.
`UserAvatarTab.test.tsx` sichert die temporäre Upload-Vorschau und die Rückgabe einer Ersatzdatei an den Dialog ab.

`UserDetailsTab.tsx` kapselt die Profilfelder und die Verwaltungsoptionen des `UserModal` als Formik-Kind. Name,
Nickname, E-Mail sowie die Admin- und Deaktivierungsschalter bleiben im gemeinsamen Formularzustand; die beiden
Verwaltungsoptionen erscheinen weiterhin nur beim Bearbeiten eines anderen Benutzers. `UserDetailsTab.test.tsx`
sichert Wertebindung und diese Sichtbarkeitsgrenze ab.

`UserModalSubmission.ts` serialisiert die bearbeitbaren Profildaten vor dem Speichern. Beim Bearbeiten des eigenen
Kontos lässt es Rollen und Deaktivierungsstatus weiterhin aus, damit sich Benutzer nicht selbst sperren oder ihre
Rolle ändern können. `UserModalSubmission.test.ts` sichert diese Payload-Grenze sowie die Kennzeichnung neuer
Benutzer.

`SetPasswordModal.tsx` beschriftet die Icon-Aktionen zum Anzeigen/Verstecken und Generieren eines Passworts über die
vorhandenen lokalisierten Schlüssel `password.show`, `password.hide` und `password.generate`. Der
Sichtbarkeitsumschalter veröffentlicht seinen Zustand zusätzlich mit `aria-pressed` und bleibt per Tastatur erreichbar.

`ChangePasswordModal.tsx` verwendet dieselben lokalisierten Schlüssel für die Umschalter des aktuellen, neuen und
wiederholten Passworts sowie für den Generator. Alle drei Umschalter veröffentlichen ihren Zustand mit `aria-pressed`
und sind nicht mehr aus der Tab-Reihenfolge ausgeschlossen.

Der Sicherheits-Tab des `ProxyHostModal` liegt als `ProxyHostSecurityTab.tsx` separat neben dem Dialog. Er bleibt ein
Formik-Kind und verwaltet die vorhandenen `crowdsecEnabled`-, `anubisEnabled`- sowie Rate-Limit-Felder unverändert.
Beim erstmaligen Aktivieren von Anubis werden die empfohlenen Regeln nur in ein noch leeres Regelset übernommen;
bereits konfigurierte Regeln bleiben erhalten.

Die Terminal-Verbindungsfelder des `ProxyHostModal` liegen in `ProxyHostTerminalFields.tsx`. Die Komponente bleibt ein
Formik-Kind, erscheint nur für das Forwarding-Schema `terminal` und zeigt abhängig von `terminalAuthType` unverändert
das Passwort- oder Private-Key-Feld. `ProxyHostTerminalFields.test.tsx` sichert diese drei Zustände ab.

`ProxyHostIconSettings.tsx` kapselt die Symbolauswahl des `ProxyHostModal` als weiteres Formik-Kind. Bei `iconType`
`custom` bleibt das URL-Feld sichtbar; die Vorschau erhält weiterhin Host, Port, Symboltyp und URL aus dem gemeinsamen
Formularzustand. `ProxyHostIconSettings.test.tsx` sichert beide Zustände ab.

`ProxyHostPhpSettings.tsx` kapselt die PHP-Hosting-Felder des `ProxyHostModal` als Formik-Kind. Der Bereich bleibt auf
das Forwarding-Schema `path` begrenzt; nach dem Aktivieren von PHP bleiben Versionswahl und benutzerdefinierte
`php_override_ini` aus dem gemeinsamen Formularzustand verfügbar. `ProxyHostPhpSettings.test.tsx` sichert diese
Sichtbarkeits- und Zustandsübergänge ab.

`ProxyHostAdvancedTab.tsx` kapselt den erweiterten Tab des `ProxyHostModal` als Formik-Kind. Der Turbo-Loader-Schalter
bleibt an `turboLoader` gebunden; Titel und Erläuterungen verwenden `proxy-host.turbo-loader.*` mit nativen Texten in
allen 13 Locales. `NginxConfigField` bleibt unverändert Bestandteil desselben Tabs;
`ProxyHostAdvancedTab.test.tsx` sichert Texte, Schalterbindung und Konfigurationsfeld.

`ProxyHostSslTab.tsx` kapselt die SSL-Registerkarte des `ProxyHostModal` als eigenes Formik-Kind. Die bestehende
Zertifikatsauswahl bleibt an `certificateId` gebunden, erlaubt weiterhin das Anlegen neuer Zertifikate und verwendet
unverändert die limettengrüne SSL-Optionsdarstellung. `ProxyHostSslTab.test.tsx` sichert diese Zusammensetzung ab.

`ProxyHostOptions.tsx` kapselt die fünf Detail-Optionen für Caching, Pufferung, Exploit-Schutz, WebSocket-Upgrades und
Wartung bei Fehlern als Formik-Kind. `ProxyHostOptions.test.tsx` sichert die unveränderte Bindung aller Schalter an ihre
jeweiligen Formularfelder ab.

`ProxyHostMaintenanceTab.tsx` kapselt den Wartungs-Tab des `ProxyHostModal` als Formik-Kind. Aktivierung, Start- und
Endzeit sowie Begründung bleiben an dieselben Formularfelder gebunden; `ProxyHostMaintenanceTab.test.tsx` sichert die
Werte und den Umschalter gegen Regressionsfehler ab.

`ProxyHostNotesTab.tsx` kapselt den Notiz-Tab des `ProxyHostModal` als Formik-Kind. Der editierbare Host-Hinweis bleibt
an das gemeinsame Feld `note` gebunden; `ProxyHostNotesTab.test.tsx` sichert Initialwert, lokalisierten Platzhalter und
Werteänderung gegen Regressionsfehler ab.

`ProxyHostForwardingFields.tsx` kapselt Schema, Zielhost, Zielport und das `path`-spezifische Index-Dateifeld als
Formik-Kind. Die Validierung für Host und Port sowie die Sichtbarkeit von `indexFile` bleiben aus dem Dialog erhalten;
`ProxyHostForwardingFields.test.tsx` sichert Wertebindung und die schemaabhängige Sichtbarkeit ab.

`ProxyHostDetailsTab.tsx` kapselt den Details-Tab des `ProxyHostModal` als Formik-Kind. Domain-, Weiterleitungs-,
Terminal-, Symbol-, PHP-, Zugriffs- und Optionsfelder bleiben im gemeinsamen Formularzustand; die Felder
`bandwidthLimit` und `forwardQuery` behalten ihre bisherige Wertebindung. `ProxyHostDetailsTab.test.tsx` sichert diese
Zusammensetzung und beide Werte gegen Regressionsfehler ab.

`ProxyHostFormTabs.tsx` kapselt die Register-Navigation und ihre Inhalte. Die bestehenden Standort-Anfangswerte und die
Host-ID werden unverändert an ihre Kinder weitergereicht; Git-Sync bleibt ausschließlich für das Weiterleitungsschema
`path` sichtbar. `ProxyHostFormTabs.test.tsx` sichert beide Zustände.

`ProxyHostModalSubmission.ts` kapselt die Serialisierung vor dem Speichern eines Proxy-Hosts. Leere Git-Zugangsdaten
werden weiterhin nicht überschrieben, die UI-Option `crowdsecEnabled` wird in `securityCrowdsec` für die API überführt
und ungültige Rate-Limit-Werte werden wie zuvor entfernt. `ProxyHostModalSubmission.test.ts` sichert diese
Payload-Grenzen unabhängig vom Dialog ab.

`AccessListDetailsTab.tsx` kapselt den Details-Tab des `AccessListModal` als Formik-Kind. Name sowie die Optionen
`satisfyAny` und `passAuth` bleiben an denselben Formularzustand gebunden; `AccessListDetailsTab.test.tsx` sichert die
Wertebindung gegen Regressionsfehler ab.

`AccessListMtlsTab.tsx` kapselt den mTLS-Tab als weiteres Formik-Kind. Die Aktivierung, die Auswahl der internen CA und
der externe Zertifikatstext bleiben an `mtlsEnabled`, `mtlsUseInternal` und `mtlsContent` des unveränderten
Formularzustands gebunden; `AccessListMtlsTab.test.tsx` sichert Sichtbarkeit und Wertebindung des Zertifikatsfelds ab.

`AccessListSsoTab.tsx` kapselt die Authentik-, OAuth2-Proxy- und OIDC-Felder als Formik-Kind. Provider-Auswahl und
providerabhängige Felder verwenden unverändert denselben Formularzustand; `AccessListSsoTab.test.tsx` sichert die
Wertebindung von Provider und Authentik-Host ab.

`AccessListAuthorizationTabs.tsx` kapselt die Basic-Auth- und Zugriffsregel-Tabs des `AccessListModal`. Der Dialog
übergibt nur den unveränderten SSO-Status sowie die initialen Einträge; bei aktivem SSO bleiben beide Fieldsets gesperrt.
Die Hinweise verwenden `access-list.sso.authentication-handled` und `access-list.sso.rules-handled` mit nativen Texten
in allen 13 Locale-Dateien. `AccessListAuthorizationTabs.test.tsx` sichert die Sperre beider Tabs ab.

`AccessListModalFormValues.ts` kapselt das Initialisieren des Access-List-Formularzustands. Es normalisiert auch alte
serialisierte `meta`-Werte sicher und übernimmt weiterhin die vorhandenen OAuth2-, OIDC- und mTLS-Werte. Der Dialog
behält damit Form-State und Submission unverändert; `AccessListModalFormValues.test.ts` sichert Legacy-Metadaten und
die sicheren Standardwerte.

`AccessListModalSubmission.ts` kapselt die Serialisierung des Access-List-Formularzustands für die API. Aktive OIDC-
oder OAuth2-Proxy-Felder bleiben erhalten, ungenutzte Metadaten werden geleert und Clients sowie Credentials enthalten
nur editierbare Felder. `AccessListModalSubmission.test.ts` sichert diese Payload-Grenzen und die mTLS-Behandlung.

`AccessListFormTabs.tsx` kapselt Tab-Navigation und -Inhalte des `AccessListModal`. Die Komponente leitet die
unveränderten Anfangswerte für Basic Auth und Client-Regeln weiter und berechnet die SSO-Sperre weiterhin aus dem
gemeinsamen Formik-Status. `AccessListFormTabs.test.tsx` sichert die Übergabe für Basic Auth und OIDC ab.

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
