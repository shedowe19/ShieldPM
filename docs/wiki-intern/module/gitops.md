# GitOps

## Zweck

GitOps synchronisiert eine streng begrenzte öffentliche Konfigurationsprojektion mit einem HTTPS-Git-Repository. Es
ist kein Secret- oder Vollbackup.

## Snapshot v2

`backend/internal/gitops.js` exportiert allow-listed Felder aktiver Proxy-, Redirection-, Dead-Hosts und Streams. Das
Manifest verlangt Version 2, Projektion `shieldpm-public-config-v2`, Vollständigkeit, Typ/ID, Größe und SHA-256 pro
Datei. Maximal 1.000 Dateien und 32 MiB Gesamtgröße werden akzeptiert.

Passwörter, Token, Private Keys, Zertifikatsdateien, Access-List-Auth, Terminal-/DDNS-/AI-/Git-Credentials sowie
Redaction-Marker führen zum Abbruch. Die Extension `.yaml` enthält eine deterministische JSON-Serialisierung, die
YAML-kompatibel ist.

## Pfad- und Transportgrenzen

`backend/internal/gitops-security.js` erzwingt HTTPS ohne URL-Credentials, validierte Branch-Namen, System-CA/TLS,
bounded Redirect-/Response-Verhalten und redigierte Fehler. Snapshot-Pfade müssen normalisiert im Snapshot-Root liegen;
Symlinks, Hardlink-/Spezialdatei-Tricks, zusätzliche Dateien und Manifestabweichungen werden abgelehnt.

Remote Pull und Export arbeiten in privaten temporären Verzeichnissen. Der validierte Tree wird per Journal/atomarem
Swap installiert. Nur `shieldpm-config/` wird gestaged; fremde vorab gestagete Pfade blockieren den Commit.

## Import, Dry Run und Recovery

Vor dem Import werden bounded Database-Recovery-State und betroffene Nginx-Verzeichnisse erfasst. Dry Run führt
Validierung, Projektion und Mutationsplanung aus, rollt DB und Runtime-Staging zurück und lädt Nginx nicht neu.

Ein echter Import schreibt vor Änderungen ein fsync-gesichertes Recovery-Journal, mutiert alle unterstützten Tabellen
in einer Transaktion unter dem aktuellen Owner, rendert/staged den kompletten Nginx-Zustand und ruft `nginx -t` vor dem
Reload. Fehler stellen DB und Runtime-Verzeichnisse wieder her; ein Prozessabbruch wird beim nächsten Start vor neuen
GitOps-Operationen recovered.

## Wichtige Dateien

- `backend/internal/gitops.js`
- `backend/internal/gitops-security.js`
- `backend/routes/gitops.js`
- `frontend/src/pages/Settings/GitOps.tsx`
- `/data/gitops/.transaction.json` (ephemeres Recovery-Journal)

## Externe Grenzen

- GitHub Rulesets/Branch Protection werden im GitHub-Repository konfiguriert, nicht im ShieldPM-Code.
- Externe DB-Rollbacks brauchen einen operator-bestätigten MySQL/PostgreSQL-Dump.
- PATs müssen repository-spezifisch und minimal berechtigt sein; ShieldPM kann Provider-Scopes nicht erzwingen.

## Verwandte Seiten

- [Nginx-Engine](./nginx-engine.md)
- [Datenbank](../daten/datenbank.md)
- [Secrets und Sicherheit](../konfiguration/secrets-und-sicherheit.md)
- [Security-Modernisierung](../entscheidungen/2026-08-31-security-modernisierung.md)
