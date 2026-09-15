# Quellabdeckung und LLM-Navigation

## Zweck

Diese Seite macht den Umfang des internen Wiki-Abgleichs nachvollziehbar. Sie ersetzt nicht den Quellcode als
Verhaltensquelle, verknüpft aber jede produktive Codefläche mit einer dauerhaft auffindbaren Wiki-Seite. Dadurch können
LLMs und Reviews zuerst die passende Fachseite lesen und anschließend gezielt in die maßgebliche Datei springen.

## Prüfstand und Umfang

Der Inventar-Abgleich erfolgte am 2026-09-15 gegen den PR-140-Head
8bfad91d99ad3b96ae1a638c1ed00c4c8e43ac06, vor dieser Dokumentationsergänzung.

| Inventar                                                     | Ergebnis |
| ------------------------------------------------------------ | -------- |
| Versionierte Repository-Dateien                              | 1.586    |
| Quell-, Test- und Konfigurationsdateien im Audit-Scope       | 1.252    |
| Backend-Produktivdateien (JavaScript, ohne backend/test)     | 208      |
| Frontend-Produktivdateien (TypeScript/TSX, ohne Testdateien) | 396      |
| Backend-Routen                                               | 27       |
| Backend-Internal-Dateien                                     | 39       |
| Backend-Modelle                                              | 27       |
| Backend-Lib-Dateien einschließlich Unterordner               | 25       |
| Migrationen                                                  | 77       |
| OpenAPI-/Schema-Dateien                                      | 143      |
| Rootfs-Startskripte                                          | 11       |
| GitHub-Workflows                                             | 12       |

Der Scope enthält versionierte Dateien unter backend, frontend, rootfs, scripts, caddy und .github mit den jeweiligen
Code-, Konfigurations- und Testformaten. Dokumentation, Sprachdaten, Binärassets, Lockfiles und eingebundene
Fremdbibliotheken werden nicht als fachlicher Produktivcode gezählt. Die Zahlen sind ein reproduzierbarer
Vollständigkeitsindex, keine formale Zusicherung jedes möglichen Laufzeitpfads.

## Navigationskarte

| Codefläche                     | Direkte Quelle                               | Wiki-Einstieg                                                                                                                              | Vollständigkeitsgrenze                                                    |
| ------------------------------ | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| HTTP-Einstieg und Middleware   | backend/app.js, backend/routes/main.js       | [Express-Middleware](../architektur/express-middleware.md), [API-Überblick](../api/ueberblick.md)                                          | Globale Sicherheits-, CSRF- und Rate-Limit-Regeln.                        |
| Alle API-Router                | backend/routes und backend/routes/nginx      | [API-Routen](../api/routen.md), [Laufzeit-Endpunkt-Katalog](../api/endpunkt-katalog.md)                                                    | Alle 27 Router und 111 gemounteten Pfade.                                 |
| OpenAPI-Verträge               | backend/schema                               | [API-Schemas](../api/schemas.md)                                                                                                           | 3 Wurzeldokumente, 36 Komponenten und 104 Pfaddefinitionen.               |
| Business-Logik                 | backend/internal                             | [Modulübersicht](../module/README.md) und die fachlichen Modul-Seiten                                                                      | 39 Dateien, einschließlich AI-Unterordner, Verwaltung und Integrationen.  |
| Gemeinsame Backend-Helfer      | backend/lib                                  | [Backend-Hilfsbibliotheken](../architektur/backend-lib.md)                                                                                 | Alle 25 Dateien einschließlich express und validator.                     |
| Persistenz                     | backend/models, backend/migrations           | [Datenmodell](../daten/datenmodell.md), [Migrationen](../daten/migrationen.md)                                                             | Alle 27 Modelle und die vollständige Liste der 77 Migrationen.            |
| Frontend-Routen und Ansichten  | frontend/src/Router.tsx, frontend/src/pages  | [Screens & Pages](../ui/screens.md), [Frontend-Internas](../ui/frontend-internas.md)                                                       | Routen-, View-, Lazy- und Analytics-Aufteilung.                           |
| Frontend-Transport             | frontend/src/api/backend                     | [Frontend API-Client](../ui/api-client.md)                                                                                                 | Alle 111 produktiven Transport-, Typ- und Barrel-Dateien nach Fachgebiet. |
| Frontend-Zustand               | frontend/src/hooks, context, modules, modals | [Frontend API-Hooks](../ui/api-hooks.md), [Frontend-Internas](../ui/frontend-internas.md)                                                  | React-Query, Polling, Contexts, Modals und Client-Cache.                  |
| UI-Bausteine und Styling       | frontend/src/components, locale, index.css   | [Komponenten](../ui/komponenten.md), [Theme & Styling](../ui/theme.md), [i18n](../ui/i18n.md)                                              | Gemeinsame UI, Accessibility, Themes und Sprachdateien.                   |
| Container- und Native-Laufzeit | rootfs, Dockerfile, compose-Dateien          | [Rootfs-Referenz](../konfiguration/rootfs.md), [Umgebungsvariablen](../konfiguration/umgebungsvariablen.md), [Deployment](./deployment.md) | Alle Startskripte, Datenpfade, Container- und LXC-Varianten.              |
| Build, CI und Qualität         | scripts, scripts/tests, .github/workflows    | [Tests](./tests.md), [Build](./build.md), [Deployment](./deployment.md)                                                                    | Alle 12 Workflows, Tooling und Python-Infrastrukturtests.                 |

## Backend-Internal-Zuordnung

Die fachlichen Wiki-Seiten decken die 39 Dateien im Internal-Bereich über ihre Verantwortlichkeiten ab:

- Identität und Benutzer: 2fa-service, auth-session-service, token, user, setting, dashboard_note und audit-log.
- Hosts und Nginx: access-list, host, proxy-host, redirection-host, dead-host, stream, nginx, certificate, certbot,
  maintenance und pki.
- Integrationen: ai sowie ai/executor, ai/prompt, ai/providers und ai/tools, chat, cloudflared, ddns,
  ddns-provider, docker, git-deploy, gitops, ip_ranges, oauth2-proxy, terminal, tor und wireguard.
- Verwaltung und Analyse: analytics, anubis, remote-version und report.

Eine Datei muss nicht pro Implementierungsdatei eine eigene Wiki-Seite haben, wenn sie vollständig in der
verantwortlichen Fachseite behandelt wird. Neue Internal-Dateien erhalten bei der Änderung entweder eine eigene
Modulseite oder werden in dieser Zuordnung und ihrer verantwortlichen Fachseite ergänzt.

## Verifizierbare Vollständigkeitsregeln

1. Die Route-Mount-Tabelle und der Laufzeit-Endpunkt-Katalog müssen dieselben 111 Pfade liefern. OpenAPI ist dafür
   ergänzend, aber keine Ersatzquelle.
2. Die Migrationen-Seite enthält alle 77 Dateinamen; die Datenmodell-Seite enthält alle 27 Objection-Modelle.
3. Die Schema-Seite hält die Zahl und Struktur aller 143 Schema-Dateien fest.
4. Der Frontend-API-Client nennt jede produktive Datei unter frontend/src/api/backend; die Hook-Seiten decken die
   produktiven Dateien unter frontend/src/hooks ab.
5. Jede neue Umgebungsvariable wird gleichzeitig in Quellcode, der passenden Vorlage und
   [Umgebungsvariablen](../konfiguration/umgebungsvariablen.md) geprüft. Secrets erhalten zusätzlich einen Eintrag in
   [Secrets & Sicherheit](../konfiguration/secrets-und-sicherheit.md).
6. Neue Workflows, Rootfs-Skripte, Migrationsdateien und Sicherheitsrelevante Abhängigkeiten aktualisieren die
   zugeordnete Wiki-Seite im selben Pull Request.

## Bekannte Grenze

Die Dokumentation erfasst die vorhandenen Quellflächen und Verträge. Sie erzwingt keine automatische Eins-zu-eins-
Übersetzung von Implementierungszeilen in Prosa. Der aktuelle auffällige Fachkonflikt ist bewusst als TODO dokumentiert:
Die optionale globale Analytics-Transportfunktion adressiert einen nicht gemounteten Pfad. Siehe
[Offene Fragen](../offene-fragen.md).

## Verwandte Seiten

- [Tests](./tests.md)
- [API-Routen](../api/routen.md)
- [Laufzeit-Endpunkt-Katalog](../api/endpunkt-katalog.md)
- [Migrationen](../daten/migrationen.md)
- [Frontend API-Client](../ui/api-client.md)
