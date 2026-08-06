# Sicherheitsassessment ShieldPM — 2026-08-06

**Bewerteter Stand:** `agent/auto-optimization` · Commit `5db9cdf4`
**Repository:** `shedowe19/ShieldPM`
**Status:** **nicht als uneingeschränkt release-frei bewertbar**. Der Anwendungscode und die eingefrorenen JavaScript-Abhängigkeiten sind sauber; die ausgelieferten Containerimages enthalten jedoch relevante CVEs und es bestehen mehrere Hardening-Aufgaben.

> Dieser Bericht enthält keine Zugangsdaten, Tokens, Schlüssel oder Scanrohdaten. Alle temporären Ergebnisse wurden außerhalb des Repositories verarbeitet.

## Management Summary

Der Assessment-Umfang deckt den gesamten erreichbaren Git-Verlauf, den aktuellen Arbeitsbaum, Abhängigkeiten, CI/CD, Docker-/Compose-Konfiguration, gebaute Images und eine isolierte Laufzeitinstanz ab.

**Bestätigte Schwerpunkte:**

1. Das optionale Caddy-Image basiert auf **Caddy 2.10.2**; der Image-Scan meldet **8 Critical** und **62 High**. Mehrere Caddy- und Go-Modul-Befunde sind direkt durch Caddy **2.11.4** behebbar.
2. Das Hauptimage enthält **20 Critical** und **86 High** Rohbefunde; überwiegend in Debian-13-Basis-/Runtime-Paketen und Upstream-Go-Binaries. Es gibt sowohl unmittelbar aktualisierbare als auch derzeit ungepatchte Upstream-/Debian-Befunde.
3. Der AES-GCM-Decryptor akzeptiert ohne explizite `authTagLength` gekürzte 96-Bit-Authentifizierungstags. Dies wurde kontrolliert reproduziert.
4. Die statische Admin-SPA liefert auf ihrem TLS-VHost keine HSTS-, CSP- oder Frame-Policy. Die über denselben VHost proxied API liefert diese Header dagegen korrekt über Helmet.
5. Das Runtime- und Compose-Privilegienmodell sollte weiter minimiert werden: Root-Runtime, Host-Netzwerk in den Haupt-Compose-Varianten und Docker-Socket im Demo-Reset-Container erhöhen die Auswirkung einer Kompromittierung.

**Nicht bestätigt:** Kein Secret in der erreichbaren Git-Historie; keine Lockfile-basierte JavaScript-SCA-Schwachstelle auf dem geprüften Branch; keine offene GitHub-Code-Scanning-Alert; keine im Assessment demonstrierte Authentifizierungs-, CSRF-, RBAC- oder DDNS-SSRF-Umgehung.

---

## Scope und Vorgehen

| Bereich | Umfang / Methode | Ergebnis |
|---|---|---|
| Repository | 1.449 versionierte Dateien, 4.871 erreichbare Commits | aktueller Branch und gesamte erreichbare Historie geprüft |
| Secret Scanning | Gitleaks v8.29.0, `--log-opts=--all` | bestanden, keine erkannten Secrets |
| SCA | Yarn Audit für Backend und Frontend; Trivy Filesystem-/Lockfile-Scan | 0 Advisories / 0 Lockfile-CVEs |
| SAST | Semgrep v1.146.0 für JS/TS, Shell, YAML, Docker und HTML | 31 eindeutige Kandidaten, manuell triagiert |
| IaC / Container | Trivy IaC, Hadolint, Compose v2, Runtime-Inspektion | 2 High Root-Funde, 1 Low fehlender Caddy-Healthcheck; Compose-Dateien valide |
| CI/CD | Actionlint, SHA-Pinning-Audit, GitHub Code Scanning | 13 Workflows valide; 50/50 externe Actions SHA-gepinnt; 0 offene Code-Scanning-Alerts |
| Shell | ShellCheck aller 10 versionierten Shell-Skripte | bestanden |
| Build / Tests | frische Haupt- und Caddy-Images; Backend-/Frontend-Gates unter Node 26 | bestanden; Backend 65 Dateien/311 Tests, Frontend 143 Dateien/336 Tests |
| Laufzeit / Red Team | isolierte Full-Stack-Instanz, TLS, Nginx, SQLite, API, Auth/RBAC/CSRF/Rate Limits | gezielte Tests bestanden, siehe Abschnitt „Dynamische Prüfung“ |

### Build- und Laufzeitstand

- Hauptimage gebaut: `shieldpm-reassessment:local` (Node `v26.6.0`, npm `11.18.0`)
- Enthaltene, verifizierte Komponenten: Anubis `v1.26.2`, oauth2-proxy `v7.15.3`, cloudflared `2026.7.3`
- Caddy-Image gebaut und mit `caddy validate` validiert.
- Alle drei Compose-Dateien wurden mit dem installierten nativen **Docker Compose v2.26.1** per `docker compose … config -q` validiert.

---

## Bestätigte Befunde und Priorisierung

### F-01 — Caddy-Image enthält direkt behebbar kritische Komponenten

**Schwere:** Critical, sofern das Caddy-Image eingesetzt wird
**Ort:** `caddy/Dockerfile`

Das Image verwendet `caddy:2.10.2`. Trivy meldet dafür 8 Critical und 62 High Rohbefunde. Relevante direkt im Caddy-Binary vorhandene Befunde betreffen unter anderem:

- `github.com/caddyserver/caddy/v2` — Fixes ab 2.11.1 bis 2.11.4
- `github.com/smallstep/certificates` — Critical-Fixes ab 0.29.0 bzw. 0.30.0
- `github.com/go-jose/go-jose`, `quic-go`, `go.opentelemetry.io/otel`, `golang.org/x/crypto`

Zum Assessment-Zeitpunkt ist **Caddy v2.11.4** das aktuelle Upstream-Release.

**Maßnahme:** Auf mindestens `caddy:2.11.4` aktualisieren, alle `FROM`-Referenzen zusätzlich per Digest pinnen, Caddy als Nicht-Root betreiben und einen Healthcheck hinzufügen. Danach Image neu bauen und erneut mit Trivy scannen.

---

### F-02 — Hauptimage: hohe CVE-Fläche aus Basisimage und Runtime

**Schwere:** High
**Ort:** Haupt-`Dockerfile`, transitive Basis-/Runtime-Pakete

Der frische Hauptimage-Scan ergab:

| Schwere | Rohbefunde |
|---|---:|
| Critical | 20 |
| High | 86 |
| Medium | 178 |
| Low | 165 |
| Unknown | 40 |

Das entspricht 94 deduplizierten High-/Critical-Paket-CVE-Kombinationen. Die Critical-Befunde sind überwiegend Debian-13-Komponenten wie `liblmdb0`, Perl und `libxml2`; laut Scan-Datenbank ist für viele derzeit kein Paketfix verfügbar. High-Befunde betreffen u. a. Curl, GnuPG, util-linux und die Runtime.

Direkt vorhandene Fixpfade existieren beispielsweise für `libexpat1` (`2.8.2-1~deb13u1`). Nicht pauschal behebbar sind dagegen mehrere Debian-`no-fix`-/`fix_deferred`-Befunde sowie CVEs in bereits aktuellen, extern eingebundenen Go-Binaries.

**Maßnahme:**

1. `shieldpm-nginx`-/Debian-Basis regelmäßig neu bauen und aktualisieren.
2. Fixbare Pakete priorisiert schließen und das Image danach erneut scannen.
3. Go-Binary-CVEs über Upstream-Releases oder kontrollierte, reproduzierbare Eigenbuilds verfolgen.
4. Build- und Entwicklungswerkzeuge nicht in die finale Runtime-Stage übernehmen, sofern funktional entbehrlich.

---

### F-03 — AES-GCM-Decryptor erzwingt keine 128-Bit-Authentifizierungstags

**Schwere:** Medium
**Ort:** `backend/lib/encryption.js:26`

Der Decryptor verwendet `crypto.createDecipheriv()` ohne erwartete `authTagLength`. Ein kontrollierter Test zeigte:

```text
gekürzter 96-Bit-Tag ohne authTagLength: akzeptiert
gekürzter 96-Bit-Tag mit authTagLength: 16: abgewiesen (ERR_CRYPTO_INVALID_AUTH_TAG)
```

Node.js warnt selbst vor dieser veralteten GCM-Nutzung. Akzeptierte verkürzte Tags schwächen die Integritätsgarantie verschlüsselter gespeicherter Werte.

**Maßnahme:** Beim Decipher explizit die erwartete Taglänge erzwingen und einen Regressionstest ergänzen:

```js
crypto.createDecipheriv(algorithm, key, iv, { authTagLength: 16 });
```

---

### F-04 — Root-Runtime und weitreichende Deployment-Auswirkungen

**Schwere:** High bei kompromittiertem Container
**Ort:** `Dockerfile`, `caddy/Dockerfile`, `compose.yaml`, `compose.easy.yaml`, `docker-compose.demo.yaml`

- Beide Images besitzen keinen finalen Nicht-Root-`USER`; der Hauptcontainer läuft mit UID 0 und Docker-Standard-Capabilities.
- `compose.yaml` und `compose.easy.yaml` nutzen `network_mode: host`. Dadurch entfällt die Netzwerkisolierung des Containers.
- `docker-compose.demo.yaml` mountet `/var/run/docker.sock`; ein kompromittierter Container mit diesem Mount entspricht praktisch Host-Root.
- Caddy besitzt zusätzlich keinen `HEALTHCHECK`.

Der Hauptcontainer benötigt für einzelne Funktionen möglicherweise erhöhte Rechte (z. B. Nginx/WireGuard). Das ist daher kein pauschaler Funktionsfehler, aber eine relevante Blast-Radius-Entscheidung.

**Maßnahme:** Nicht-Root-Betrieb für Caddy sofort umsetzen; für ShieldPM ein minimal dokumentiertes Capability-Modell definieren; Host-Netzwerk nur bei zwingendem Bedarf verwenden; Docker-Socket aus dem Demo-Reset-Container entfernen oder strikt isolieren.

---

### F-05 — Security Header auf der statischen Admin-SPA unvollständig

**Schwere:** Medium
**Ort:** Nginx-Admin-VHost auf TLS-Port 81

Dynamisch gegen die echte Nginx-Instanz geprüft:

| Antwort | HSTS | CSP | X-Frame-Options | nosniff | Referrer-Policy |
|---|---|---|---|---|---|
| statische Admin-SPA `/` | fehlt | fehlt | fehlt | vorhanden | vorhanden |
| proxied API `/api/version/check` | vorhanden | vorhanden | vorhanden | vorhanden | vorhanden |

Die API erhält die Header über Express/Helmet; die statische SPA wird direkt durch Nginx ausgeliefert und umgeht diese Middleware. Das erhöht insbesondere Clickjacking- und Content-Injection-Folgerisiken; fehlendes HSTS schwächt den Erstkontakt-Schutz.

**Maßnahme:** Die Header im Admin-Nginx-VHost zentral setzen, beispielsweise HSTS (nur für produktives HTTPS), `Content-Security-Policy`, `X-Frame-Options: SAMEORIGIN` bzw. CSP `frame-ancestors`, `X-Content-Type-Options` und Referrer-Policy. Danach dynamisch gegen `/` und `/api/*` prüfen.

---

### F-06 — Weitere Hardening-Punkte

| Priorität | Befund | Einordnung / Maßnahme |
|---|---|---|
| Medium | WebSocket-Upgrade wird aus `$http_upgrade` unverändert weitergereicht | H2C-/Request-Smuggling-Hardening: nur `websocket` erlauben oder Upgrade-Header nicht weiterreichen, wenn nicht benötigt. Noch kein ausnutzbarer Proxy-Host nachgewiesen. |
| Medium | Terminal lädt xterm.js-Assets extern ohne SRI | Lokale Auslieferung bevorzugen oder geprüfte SRI-Hashes einsetzen; Terminal-Route mit CSP absichern. |
| Low | Workflow-Shell-Kontext wird direkt interpoliert | Semgrep meldet drei Stellen. Aktuelle Trigger sind eingeschränkt, aber `${{ … }}`-Werte sollten via `env:` übernommen und im Shell-Skript gequotet werden. |
| Low | Kein `.dockerignore` | Build-Kontext und versehentliche Artefaktübernahme weiter minimieren; nicht als Secret-Schutz ersetzen. |
| Low | Privater Schlüssel in OpenAPI-Beispiel | Der Schlüssel passt zu einem mkcert-Entwicklungszertifikat, nicht zu einem nachgewiesenen Produktionssecret. Trotzdem durch einen nicht funktionsfähigen Platzhalter ersetzen. |
| Low | Dependabot auf `develop` offen | 32 Alerts (14 High, 17 Medium, 1 Low). Der geprüfte Branch enthält für die zugehörigen JavaScript-Lockfiles keine SCA-Befunde; Merge/Re-Analyse von `develop` bleibt erforderlich. |

---

## Dynamische, autorisierte Red-Team-Prüfung

Die Prüfung lief ausschließlich gegen eine **wegwerfbare lokale Full-Stack-Instanz**:

- Frisches Hauptimage, Nginx, Backend und SQLite.
- Eigenes internes Docker-Netz ohne externe Erreichbarkeit und ohne veröffentlichte Ports.
- Temporäre Testdaten, selbstsigniertes Testzertifikat und zufälliger Test-Admin.
- Kein Zugriff auf Produktivsysteme, keine externen Ziele, keine ACME-Registrierung, keine realen Secrets.
- Die Testinstanz verwendete nur einen lokalen, nicht echten ACME-Kontomarker, damit der reguläre Startpfad keine Netzverbindung anfordert.

| Testfall | Ergebnis |
|---|---|
| TLS-Admin-VHost und Backend-UNIX-Socket starten | bestanden |
| `nginx -tq` | bestanden |
| Firewall-Konfiguration vor Access-Handlern | `firewall.conf` Zeile 293, `access_by_lua_no_postpone on` Zeile 294 |
| Anonymer Abruf Firewall-Policies | `403` |
| Manipulierter Bearer-Token | abgewiesen (`400`) |
| Ungültige 2FA-Anfrage | abgewiesen (`400`) |
| Avatar-Traversal-Pfad | `404`, keine Dateioffenlegung demonstriert |
| Untrusted-CORS-Preflight | `204`, kein `Access-Control-Allow-Origin` reflektiert |
| Admin-Login | erfolgreich nur mit temporärem Testkonto |
| Zugriff auf Firewall-Policies mit gültigem Testtoken | `200` |
| Fehlgeschlagene Loginversuche | fünfmal `400`, ab dem sechsten Versuch `429` |
| Auth-Cookies | Access- und Refresh-Cookie jeweils `Secure`, `HttpOnly`, `SameSite=Strict` |
| Authentifizierte Mutation ohne CSRF-Token | `403`, keine Mutation durchgeführt |

Zusätzlich bestätigten vorhandene, bestandene Regressionstests die Abwehr wichtiger Angriffswege: DDNS-SSRF gegen Loopback/private/Metadata-Ziele, AI-Tool-/Tunnel-Berechtigungen, Firewall-Policy-RBAC, GitOps-Berechtigung vor Initialisierung, Passwort-Timing-Schutz und 2FA-Validierung.

### Grenzen des Red-Team-Scopes

Dies ist **kein externer Black-Box-Pentest einer produktiven Installation** und kein vollständiges Red Teaming gegen reale Domains, DNS, TLS-Zertifikate, vorgeschaltete Firewalls oder Cloud-Accounts. Es wurden keine destruktiven Last-, Fuzzing- oder Umgehungsangriffe außerhalb der lokalen Einwegumgebung ausgeführt. Für eine vollständige Release-Freigabe sollte ein separates, autorisiertes externes Pentest-Szenario mit realitätsnaher Netzwerktopologie, unterschiedlichen Benutzerrollen, Reverse Proxy, DNS/TLS und kontrolliertem Angriffskatalog folgen.

---

## Triagierte Scanner-Kandidaten

Die folgenden Treffer wurden untersucht und nicht als bestätigte Schwachstelle klassifiziert:

- Credential-Felder in `backend/certbot/dns-plugins.json`: Datenmodell-/Feldnamen, keine eingecheckten Werte.
- bcrypt-Hash in `backend/internal/token.js`: absichtlicher gültiger Dummy-Hash für Timing-Angleichung; zugehörige Tests bestätigen vollständige bcrypt-Arbeit.
- Avatar-`sendFile`: Nutzer-ID bestimmt nur den DB-Lookup; Dateiname wird serverseitig erzeugt, Pfad begrenzt und Bildsignatur geprüft.
- Zertifikats-Download: Zertifikatstyp und ID werden berechtigt geprüft; Dateien entstehen aus `readdir()` eines serverseitig bestimmten Verzeichnisses und werden per `realpath()` aufgelöst.
- `wiki-graph.py`: die Download-URL für die vis-network-Bibliothek ist fest im Quellcode, nicht aus dem CLI-Zielpfad abgeleitet.

Diese Einordnung ersetzt keine zukünftige Regressionstest-Abdeckung; insbesondere die genannten Pfad- und Upload-Grenzen sollten bei Änderungen erneut geprüft werden.

---

## Positiv geprüfte Kontrollen

- Keine erkannten Secrets in der vollständigen erreichbaren Git-Historie.
- Backend- und Frontend-Yarn-Audit ohne Advisories.
- Trivy-Lockfile-/Source-SCA: 0 Vulnerabilities.
- GitHub Code Scanning: 0 offene Alerts.
- 50 externe GitHub Actions vollständig auf Commit-SHAs gepinnt.
- Alle 13 GitHub-Workflows durch Actionlint akzeptiert.
- Alle 10 versionierten Shell-Skripte durch ShellCheck akzeptiert.
- Hauptimage und Caddy-Image erfolgreich gebaut; Caddy-Konfiguration validiert.
- Backend: 65 Testdateien / 311 Tests bestanden.
- Frontend (seriell): 143 Testdateien / 336 Tests bestanden.

---

## Empfohlene Reihenfolge

1. **Sofort:** Caddy auf 2.11.4 aktualisieren, Digest pinnen, neu scannen.
2. **Sofort:** AES-GCM auf `authTagLength: 16` festlegen und Regressionstest ergänzen.
3. **Kurzfristig:** Basis-/Runtime-Image aktualisieren, fixbare Paket-CVEs schließen und unnötige Runtime-Pakete reduzieren.
4. **Kurzfristig:** Admin-Nginx-VHost um HSTS, CSP und Frame-Schutz ergänzen; dynamisch gegen SPA und API testen.
5. **Kurzfristig:** Root-/Capability-/Host-Network-/Docker-Socket-Modell minimieren und dokumentieren.
6. **Danach:** Terminal-SRI/CSP, H2C-Upgrade-Härtung, Workflow-`env:`-Umstellung, OpenAPI-Key-Beispiel und `.dockerignore` nachziehen.
7. **Vor externer Freigabe:** Externen, autorisierten Black-Box-Pentest einer realitätsnahen Staging-Instanz durchführen.

---

## Remediation-Update — 2026-08-06

Dieser Nachtrag ersetzt die oben dokumentierten offenen Sofort- und Kurzfristmaßnahmen, soweit sie nachweisbar umgesetzt wurden. Alle Image- und Laufzeitprüfungen erfolgten erneut gegen den final gebauten lokalen Kandidaten; temporäre Daten, zufällige Testanmeldedaten und Scanrohdaten verbleiben außerhalb des Repositories.

### Umgesetzte Maßnahmen

| Ursprünglicher Befund | Status | Umgesetzte Kontrolle |
|---|---|---|
| F-01: veraltetes Caddy-Image | **behoben** | `caddy:2.11.4` wird in `caddy/Dockerfile` direkt per Digest gepinnt; auch Debian Trixie Slim ist per Digest gepinnt. Workflow und Container-Vertrag prüfen die unveränderlichen Referenzen. |
| F-02: veraltete Basis-/Runtime-Komponenten | **teilweise behoben, upstream Restbestand** | Hauptimage aktualisiert auf den aktuellen gepinnten `shieldpm-nginx`-Digest, Debian-Pakete per `apt-get upgrade` aktualisiert, `libexpat1` auf `2.8.2-1~deb13u1`, Node auf `26.6.0`, npm auf `12.0.2` und Certbot-Abhängigkeit `cryptography` auf `50.0.0`. Alle externen Downloads sind versioniert, HTTPS-gebunden und hashgeprüft. |
| fixbare npm-Bundle-CVEs | **behoben** | Die vom aktuellen npm-Release noch eingebetteten, semver-kompatiblen `brace-expansion`- und `ip-address`-Unterbäume werden ausschließlich aus SHA-512-verifizierten Tarballs auf `5.0.9` bzw. `10.3.1` aktualisiert. Smoke-Test bestätigt npm und den Yarn-Fallback. |
| Entwicklungsabhängigkeiten in Runtime | **behoben** | Neue `backend-runtime`-Stage pruned auf Produktionsabhängigkeiten; finale Runtime enthält weder Vitest noch TypeScript. Eine `.dockerignore` reduziert zusätzlich den Build-Kontext. Netzwerk-/WireGuard-Werkzeuge bleiben erhalten, da sie im produktiven Start-/Firewall-Pfad verwendet werden. |
| F-03: AES-GCM-Taglänge | **behoben** | Encryptor und Decryptor erzwingen `authTagLength: 16`; Regressionstest weist die Ablehnung eines verkürzten Authentifizierungstags nach. |
| F-05: SPA-Header | **behoben** | Der Startpfad bindet eine dedizierte Include-Datei nur in den TLS-Admin-VHost ein. HSTS, CSP mit `frame-ancestors 'self'` und `X-Frame-Options: SAMEORIGIN` gelten damit für statische SPA und proxied API. |

### Nachvalidierung

| Kontrolle | Ergebnis |
|---|---|
| Caddy Build und `caddy validate` | bestanden; Caddy `2.11.4`, beide `FROM`-Inputs per Digest |
| Hauptimage-Build | bestanden; finale lokale Image-ID `sha256:2c46fd193e043217dec53709a7459acb04719b3bfcd2f6d069fb7a0f4425fde7` |
| Runtime-Kompatibilität | Node `26.6.0`, npm `12.0.2`, `cryptography 50.0.0`, Certbot `5.7.0` sowie Certbot-/ACME-/OpenSSL-Imports bestanden |
| Backend-Regressionssuite | 67 Dateien / 317 Tests bestanden; fokussierte neue Sicherheitsverträge zusätzlich bestanden |
| Frontend (seriell), TypeScript und Produktionsbuild | 143 Dateien / 336 Tests, TypeScript und Vite-Build bestanden |
| ShellCheck, Hadolint und Caddy-Workflow-Actionlint | bestanden; vollständiges Actionlint hat weiterhin ältere, nicht von dieser Änderung verursachte Workflow-ShellCheck-Hinweise |
| Compose-V2-Validierung | `compose.yaml`, `compose.easy.yaml` und `docker-compose.demo.yaml` bestanden |
| Isolierte Laufzeitprüfung des finalen Hauptimages | SPA und API je HTTP 200 mit HSTS/CSP/Frame-/nosniff-Schutz; Login-Cookie gehärtet; anonymer Firewallzugriff und CSRF-lose Mutation je `403`; `nginx -tq` bestanden |

### Erneuter Trivy-Scan (Trivy 0.73.0, aktuelle Datenbank)

| Image | Critical | High | Einordnung |
|---|---:|---:|---|
| Hauptimage vor Remediation | 20 | 86 | Ausgangsstand dieses Assessments |
| Hauptimage final | 20 | 76 | `cryptography`, `brace-expansion` und `ip-address` ohne verbleibende Treffer; verbleibende fixbare Highs liegen ausschließlich in aktuellen, externen Go-Binaries |
| Caddy final | 4 | 23 | Caddy 2.10.2-/Go-Modul-Befunde deutlich reduziert; verbliebene Highs sind im von Caddy 2.11.4 ausgelieferten Go-Stand verankert |

Die noch als fixbar markierten High-Befunde des Hauptimages betreffen `anubis`, `oauth2-proxy` und `cloudflared`. Zum Prüfzeitpunkt waren deren eingebundenen Vendor-Releases bereits aktuell, enthalten aber Go-Standardbibliothek-, gRPC- oder `x/text`-Stände vor den genannten Fixes. Sie benötigen einen upstream-korrigierten Release oder einen separat gepflegten, reproduzierbaren Eigenbuild — ein bloßes Versionsbump im Repository wäre irreführend.

### Offene Sicherheitsarbeit

- **F-04 bleibt offen:** Root-Runtime, Host-Netzwerk und Docker-Socket im Demo-Reset-Sidecar benötigen ein separates Capability-/Deployment-Redesign.
- Der externe, autorisierte Black-Box-Pentest kann erst gegen eine konkret benannte, schriftlich freigegebene Staging-URL mit Testzeitfenster und Testkonten erfolgen. Der hier nachgewiesene Lauf war absichtlich isoliert und nicht öffentlich erreichbar; er ersetzt keinen echten externen Test.
