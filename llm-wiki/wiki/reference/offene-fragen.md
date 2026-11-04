# Offene Fragen

## Zweck

**Zentrale Sammelseite** aller offenen Fragen, Unsicherheiten und TODOs aus dem internen Wiki. Einzelne Modul-Seiten verlinken hierhin, statt eigene "Offene Fragen"-Listen zu führen — so gibt es genau einen Ort für die Übersicht.

## Konventionen

- `TODO:` — Muss noch untersucht werden
- `Unklar:` — Aus dem Code nicht eindeutig ableitbar
- `Annahme:` — Basiert auf Vermutung, nicht auf Fakten

## Offene Fragen

Keine bereichsübergreifenden offenen Fragen auf dieser Seite. Die früheren Punkte zu OpenAppSec-Policy, Advanced-Modell, Authentik, CDN-Quellen und Swagger sind beantwortet oder als Aufgabe geführt (T-007, T-017).

## Gelöste Fragen

### Aktuelle Session

- ~~OpenAppSec-Advanced-Modell im Native-/LXC-Pfad~~ → Der Installer legt das Modell unter `/advanced-model/open-appsec-advanced-model.tgz` ab, extrahiert es nach `/etc/cp/conf/waap` und startet den Agent neu; Live-Prüfung als T-017 ([OpenAppSec](./module/openappsec.md)).
- ~~End-to-End-Beispiel für Authentik (`AUTHENTIK_PROXY`)~~ → Forward-Auth-Ablauf inklusive Outpost, Host-URL und Nginx-Verhalten dokumentiert ([OAuth2-Proxy](./module/oauth2-proxy.md)).
- ~~Weitere CDN-Quellen für IP-Ranges~~ → Fastly ergänzt; Akamai bewusst ausgelassen, weil keine stabile öffentliche Liste existiert ([IP-Ranges](./module/ip-ranges.md)).
- ~~OpenAppSec-Policy des nativen Installers~~ → Seit 2026-11-04 v1beta1-konform (benannte Practice/Log-Trigger), `--apply-policy` im Installer, Regressionstest `backend/test/ci/openappsec-local-policy.spec.js`. Die Anwendung auf einem laufenden Agent bleibt Aufgabe T-007.
- ~~OpenAPI/Swagger unvollständig~~ → Am 2026-11-04 um Analytics, OIDC, GitOps und Upload-Relay ergänzt (19 Pfade, 22 Operationen); abgeschlossen als T-004 ([API-Schemas](./api/schemas.md)).
- ~~B01–B12 der Gesamtprüfung vom 17. Oktober~~ → Umgesetzt; die Nachweise stehen in der [Umsetzung der Gesamtprüfung](./entwicklung/feature-implementation-2026-10-17.md). Die Wasm-Bezüge dieses Berichts sind durch die [Entfernung vom 27. Oktober](./entwicklung/gitops-reference-and-runtime-removal-2026-10-27.md) überholt.
- ~~13 Befunde der Optimierungsprüfung vom 13. Oktober~~ → Umgesetzt mit Secret-Antwortbereinigung und transaktionaler Erhaltung, Nginx-Batch-Rollback, dauerhaftem Wartungs-Retry, frischen Firewall-Snapshots, Monitorworkern, Analytics-Lifecycle, nativen Wartungssperren und Latest-Smokes. Einzelne Nachweise und die unveränderten Betriebsgrenzen stehen im [Prüfbericht](./entwicklung/optimierungspruefung-2026-10-13.md).
- ~~FTP-PAC-Listing-Befunde und unbehandelte Transferablehnungen~~ → Die direkte Abhängigkeit `basic-ftp` verwendet seit PR #157 Version 6.2.3; die gezielte Auflösung für `get-uri` bleibt bei 6.2.2. Der eigene FTP-Handler propagiert Transferfehler an den Stream und schließt den Client; der gemeinsame ProxyAgent-Wrapper bindet ihn in den produktiven PAC-Pfad ein. Lokale FTP-Tests prüfen Metadaten-Fallback, Cache, Abbrüche, manipulierte Antworten und den erhaltenen Transferhost-Schutz. Der damalige Backend-Audit vom 8. Oktober 2026 meldete nach der FTP-Korrektur 0 bekannte Befunde bei 522 Abhängigkeiten; dies ist keine aktuelle Sicherheitszusage. Dokumentiert unter [FTP-Korrektur](./architektur/externe-abhaengigkeiten.md#ftp-korrektur-in-pr-150) und [Tests](./entwicklung/tests.md).
- ~~Provider-Matrix für OAuth2-Proxy~~ → `google` (Default), `github`, `oidc`, `gitlab`, `azure`, `keycloak-oidc` (verdrahtet in `frontend/src/modals/AccessListModal.tsx`); Authentik separat als Auth-Typ `AUTHENTIK_PROXY`. Dokumentiert in [oauth2-proxy.md](./module/oauth2-proxy.md).
- ~~ML-KEM-Modi je `shieldpm-nginx`-Build~~ → Dieses Repo setzt für Hosts mit interner CA nur das Flag `host.use_ml_kem` in `nginx.js`. Die tatsächliche Hybrid-Kex-Liste (X25519MLKEM768 etc.) liegt im separaten `shieldpm-nginx`-Repository. Dokumentiert in [pki.md](./module/pki.md).
- ~~Update-Intervall der Cloudflare-IP-Ranges~~ → `interval_timeout = 6h × IPRT` (Umgebungsvariable, Standard-Multiplikator 1). Manueller Trigger über AI-Tool `renew_ip_ranges`. Dokumentiert in [ip-ranges.md](./module/ip-ranges.md).
- ~~Webhooks für Git-Deploy~~ → Nicht implementiert; Aktualisierung läuft ausschließlich über Polling-Timer pro Host (`git_poll_interval` × `git_poll_unit`, eigener `setInterval` pro Host in `pollingTimers`). Dokumentiert in [git-deploy.md](./module/git-deploy.md).
- ~~Mechanismus der Custom-Locations auf Proxy-Hosts~~ → `nginx.js → renderLocations()` iteriert über `host.locations`, mischt Host-Eigenschaften (Access-List, Zertifikat, SSL/HSTS-Flags), rendert pro Eintrag das Liquid-Template `_proxy_host_custom_location.conf` und konkateniert die Strings. Bei `path === "/"` wird die Default-Location ausgeschaltet. Dokumentiert in [proxy-host.md](./module/proxy-host.md).
- ~~Genauer Mechanismus des Docker Auto-Discovery Label-Formats~~ → Sucht nach `shieldpm.hostname`-Label. Unterstützt Ports, Access-Lists, Booleans und Zertifikats-Provider (`shieldpm.ssl_provider`). Dokumentiert in [docker.md](./module/docker.md).

### Frühere Sessions

- ~~`backend/lib/`~~ → Dokumentiert in [Backend-Lib](./architektur/backend-lib.md).
- ~~`frontend/src/modules/`~~ → 3 Module: AuthStore, Permissions, Validations → [Frontend-Internas](./ui/frontend-internas.md).
- ~~`frontend/src/modals/`~~ → Dokumentiert in [Frontend-Internas](./ui/frontend-internas.md).
- ~~`frontend/src/hooks/`~~ → Dokumentiert in [Frontend-Internas](./ui/frontend-internas.md).
- ~~`frontend/src/context/`~~ → AuthContext, LocaleContext, ThemeContext → [Frontend-Internas](./ui/frontend-internas.md).
- ~~`frontend/src/types/`~~ → Dokumentiert in [Frontend-Internas](./ui/frontend-internas.md).
- ~~`rootfs/usr/local/bin/`~~ → Dokumentiert in [Rootfs-Referenz](./konfiguration/rootfs.md).
- ~~Welche Template-Engine rendert die Nginx-Konfiguration?~~ → `backend/lib/utils.js` erzeugt eine LiquidJS-Instanz; `backend/internal/nginx.js` rendert damit die Templates unter `backend/templates/`.
- ~~Backend-`dev`-Script~~ → `backend/package.json` definiert `yarn dev` als `node index-dev.js`; Scheduler und Analytics werden im Entwicklungsmodus gestartet und bei `SIGINT` oder `SIGTERM` beendet. Siehe [lokale Entwicklung](./entwicklung/lokale-entwicklung.md).
- ~~Umfang der Backend-Tests in `backend/test/`~~ → Ordner existiert und enthält Tests für `lib/`, `internal/` und Integrationen via Vitest.
- ~~Wie funktioniert die Migration von NPMplus-Daten beim ersten Start?~~ → `rootfs/usr/local/bin/entrypoint.sh` prüft, ob `/data/npmplus` existiert und `/data/shieldpm` fehlt, und führt dann ein `mv` aus.

## Verwandte Seiten

- [Wiki-Pflege](./wiki-pflege.md)
- [Index](./index.md)
