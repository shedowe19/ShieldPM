# Certbot

## Zweck

Automatisierte Beantragung und Erneuerung von Let's Encrypt Zertifikaten.

## Kontext

ShieldPM abstrahiert Let's Encrypt via Certbot. Dieses Modul kümmert sich um die Ausführung von Certbot-Befehlen, DNS-Challenges und die Verwaltung der Account-Registrierung.

## Wichtige Dateien

- `backend/internal/certbot.js` (10 KB) — Certbot-Ausführung und Management
- `backend/lib/certbot.js` — Installation registrierter DNS-Plugins in den beschreibbaren Datenpfad
- `backend/lib/certificate-profile.js` — Profilvalidierung und Zertifikatsargumente einschließlich globaler Profilvorgaben
- `backend/internal/certificate.js` — Nutzt `certbot.js` für Zertifikate
- `backend/certbot/` — Certbot-Hilfsdateien (z. B. DNS-Plugins)

## Verhalten

- Nutzt die beim Start registrierten ACME-Accounts; die Registrierung erfolgt im Startskript `rootfs/usr/local/bin/launch.sh`.
- Beantragt Zertifikate via HTTP-01 oder DNS-01 Challenge.
- `meta.letsencrypt_profile` wählt `standard` oder `shortlived`. Neue Erstellungsanfragen ohne Profil verwenden die wirksame globale Vorgabe und speichern diese Wahl auf dem ausgestellten Zertifikat. HTTP- und DNS-Ausstellung sowie Erneuerungen ergänzen bei `shortlived` strikt `--required-profile shortlived`. Nicht unterstützte Profile oder zu alte Certbot-Versionen führen zu einem Fehler statt zu einem stillen Standard-Zertifikat. Short-lived benötigt Certbot ab Version 4.0.
- Explizites `standard` setzt bei einem global konfigurierten `ACME_PROFILE` die Argumente `--required-profile "" --preferred-profile ""`. Die leeren Werte übersteuern die globalen Profilvorgaben aus `/etc/certbot.ini` für diesen Aufruf; die ACME-Order enthält dadurch kein Profil und die CA wählt ihren Standard. Beide Optionen müssen geleert werden, damit ein globales bevorzugtes Profil ebenfalls nicht eingreift. Bei fehlendem `ACME_PROFILE` oder `none` ergänzt Standard keine Profilargumente und bleibt mit älteren Certbot-Versionen kompatibel. Die globale Profilkonfiguration setzt bereits Certbot mit Profilunterstützung voraus.
- Alte Zertifikatsdatensätze ohne `meta.letsencrypt_profile` erhalten beim anfänglichen globalen Zustand `inherit` keine Profilargumente. Ihre bisherige Certbot-Konfiguration und ein globales `ACME_PROFILE` bleiben erhalten. Sobald die globale Vorgabe in Einstellungen → Zertifikate / ACME gespeichert wurde, verwenden solche Altzertifikate bei der Erneuerung diese Vorgabe. Ein gespeichertes globales Standard-Profil leert dabei beide Profiloptionen auch ohne gesetztes `ACME_PROFILE`, damit ein früher in der Lineage gespeichertes Profil nicht weiterverwendet wird. Explizite Zertifikatsprofile haben Vorrang vor der globalen Vorgabe.
- Das Speichern der globalen Vorgabe prüft die Unterstützung der Certbot-Profiloptionen und verlangt für Short-lived das gleichnamige Profil im ACME-Verzeichnis. Diese Änderung benötigt keinen Neustart und schreibt weder Umgebungsdateien noch `/etc/certbot.ini` um; die Argumente werden bei jeder nachfolgenden Zertifikatsoperation neu bestimmt. Details stehen unter [Einstellungen](../verwaltung/einstellungen.md).
- Certbot speichert Ausstellungsoptionen je Lineage unter `/data/tls/certbot/renewal/npm-<id>.conf`. Die automatische Erneuerung arbeitet trotzdem pro verwaltetem Zertifikat mit `--cert-name` und wendet dessen explizite Profilwahl erneut an, weil ein globales Profil aus der INI-Datei gespeicherte Lineage-Optionen überschreiben kann. Sie verwendet kein `--force-renewal`; die Fälligkeit entscheidet Certbot selbst. Fehler werden je Zertifikat protokolliert und verhindern die weiteren Erneuerungsprüfungen nicht. Das Let's-Encrypt-Profil `shortlived` hat eine Laufzeit von 160 Stunden (6 Tage und 16 Stunden).
- Erneuert ablaufende Zertifikate asynchron.
- Beantragung, manuelle Erneuerung, Timer-Erneuerung und Widerruf teilen sich `runCertbot()` und dieselbe Prozesssperre. Gleichzeitige Aufrufe erhalten einen nachvollziehbaren Validierungsfehler; die Sperre wird bei Erfolg und Fehler freigegeben.
- Beim Widerruf kann `revokeCertbot()` unter dieser Sperre die Host-Abkopplung vorbereiten. Die Zertifikatslöschung verwendet diesen Ablauf, damit ein belegter Certbot-Prozess keine bereits gelöschte Datenbankzeile mit weiterhin aktiver Certbot-Lineage hinterlässt. Vorbereitungsfehler verhindern den Widerruf und geben die Sperre frei.
- DNS-Zugangsdaten werden mit Dateimodus `0600` gespeichert. Numerische Propagationszeiten werden für CLI-Argumente in Strings umgewandelt.
- Die gemeinsame Prozesssperre umfasst bei DNS-Ausstellungen auch die Plugin-Installation und das Schreiben der Zugangsdaten; diese Schritte können keine laufende Erneuerung mehr verändern. Auch ein Vorbereitungsfehler gibt die Sperre frei.
- CLI-Argumente für Zugangsdaten und Propagationszeit folgen dem registrierten `full_plugin_name`, einschließlich abweichender Namen wie `dns-mijn-host` und qualifizierter Plugin-Namen. Optionale `credentials_argument`-/`propagation_argument`-Felder können davon abweichen. Eine explizite Propagationszeit `0` wird weitergereicht.
- Provider müssen eigene Einträge im DNS-Register sein; geerbte JavaScript-Namen wie `constructor` sind keine gültigen Plugins. Leere Zugangsdaten werden vor dem Installieren abgewiesen.
- DNS-Plugins werden mit `pip install --upgrade --target /data/certbot-plugins` einschließlich ihrer Abhängigkeiten installiert. Die Python-Virtualenv des Basisimages unter `/usr/local` bleibt unverändert. `start.sh` bereitet das Zielverzeichnis mit dem Datenbesitz vor; `launch.sh` stellt es über `PYTHONPATH` vor bereits vorhandene Suchpfade. Damit sind sowohl die Plugins des Basisimages als auch zusätzliche DNS-Plugin-Entry-Points auffindbar, während Pakete und Abhängigkeiten aus dem Zielverzeichnis Vorrang haben.
- Jeder HTTP-Challenge-Test verwendet einen eindeutigen Testdateinamen, damit gleichzeitige Tests sich nicht gegenseitig löschen. Die Datei wird im `finally`-Block entfernt.
- Der externe HTTP-Test hat einen Socket-Timeout von 15 Sekunden und behandelt Fehler oder abgebrochene Antworten. Die Ziel-URL wird korrekt als Formularfeld kodiert.
- Regressionen: `backend/test/internal/certbot-processing.spec.js` prüft auch HTTP-/DNS-Profilargumente, manuelle Erneuerung, Altzertifikate und das Leeren globaler Standard-Profilvorgaben (alle externen Aufrufe gemockt).
- `backend/test/lib/certbot-plugins.spec.js` prüft Installationsziel und Fehlerweitergabe sowie mit einer echten lokalen Python-Virtualenv die Auflistung und das Laden von Plugin-Entry-Points aus Basis- und Zielverzeichnis. Diese Prüfung verwendet synthetische Pakete ohne Downloads und benötigt `python3` mit dem Modul `venv`.

## Abhängigkeiten

- `certbot` (CLI-Tool im Docker-Image oder der Native/LXC-Installation)
- `internal/nginx.js` — Temporäre Nginx-Config für HTTP-Challenges

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

Die CLI-Zuordnung wird durch das lokale Plugin-Register und gemockte Regressionstests geprüft. Nicht jedes externe DNS-Plugin wurde gegen einen echten Provider installiert oder ausgeführt.

Die Profilauswahl wird mit gemockten Certbot-Aufrufen geprüft. Eine echte ACME-Ausstellung oder Erneuerung ist kein Bestandteil dieser Tests. Laufzeit und CLI-Vertrag folgen der [Let's-Encrypt-Profilreferenz](https://letsencrypt.org/docs/profiles/) und dem [Certbot-Benutzerhandbuch](https://eff-certbot.readthedocs.io/en/stable/using.html).

## Verwandte Seiten

- [Zertifikate](./zertifikate.md)
- [Modulübersicht](./README.md)
