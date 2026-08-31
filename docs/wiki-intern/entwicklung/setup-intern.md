# Setup & Initialisierung

## Zweck

`backend/setup.js` führt idempotente Initialisierungsarbeiten aus. Ein frisches System erhält **keinen** bekannten
Standardbenutzer und kein in Logs ausgegebenes Passwort.

## Initialer Administrator

`backend/internal/initial-setup.js` stellt beim Start sicher, dass genau ein offener Ownership-Claim existiert, solange
noch kein aktiver Benutzer angelegt wurde.

- Ohne Vorgabe erzeugt ShieldPM 32 Zufallsbytes und schreibt sie Base64URL-kodiert nach
  `/data/shieldpm/initial-admin-setup-token`.
- Die Datei wird exklusiv mit `0600` angelegt und synchronisiert; vorhandene Dateien müssen regulär, keine Symlinks und
  `0600` oder restriktiver sein.
- Alternativ liefern `INITIAL_ADMIN_SETUP_TOKEN_FILE` (bevorzugt) oder `INITIAL_ADMIN_SETUP_TOKEN` mindestens 256 Bit
  Zufälligkeit.
- Die UI übergibt den Wert ausschließlich im Header `X-ShieldPM-Setup-Token`.
- Hash-Vergleich, Claim-Verbrauch, Administrator, Passwort-Auth und Berechtigungen entstehen in einer Transaktion.
- Ein bedingtes Update auf den noch unverbrauchten Claim verhindert zwei Gewinner bei parallelen Requests.
- Nach Erfolg wird die generierte Datei entfernt und der Environment-Wert aus dem Prozess gelöscht.

Ein bestehender Benutzer markiert einen eventuell alten Claim als verbraucht. Ein anderer konfigurierte Tokenwert darf
einen bereits offenen Claim nicht unbemerkt ersetzen.

## Weitere Setup-Aufgaben

- Standard-Settings werden nur angelegt, wenn sie fehlen.
- Certbot-Verzeichnisse und benötigte DNS-Plugins werden vorbereitet.
- `REGENERATE_ALL=true` rendert alle aktiven Nginx-Hosts neu; die Nginx-Engine validiert den vollständigen Kandidaten.

## Wichtige Dateien

- `backend/setup.js`
- `backend/internal/initial-setup.js`
- `backend/models/initial-setup-claim.js`
- `backend/routes/users.js`
- `backend/internal/user.js`
- `frontend/src/pages/Setup/index.tsx`

## Sicherheitsgrenzen

- Token nie in URL, Log, Screenshot, Git oder unverschlüsseltes Compose-Environment kopieren.
- Automatisierung soll einen gemounteten Secret-File-Pfad verwenden.
- Die Management-UI auf Port 81 ist standardmäßig HTTP und darf ohne vorgeschaltetes TLS/VPN nicht über ein
  untrusted Netz erreichbar sein.

## Offene Fragen

Keine offenen Fragen für den Ownership-Claim. Änderungen an Header, Mindestentropie oder Claim-Transaktion benötigen
ein eigenes ADR.

## Verwandte Seiten

- [Umgebungsvariablen](../konfiguration/umgebungsvariablen.md)
- [Benutzer & Auth](../module/benutzer-auth.md)
- [Auth-Session-Service](../module/auth-session-service.md)
- [Security-Modernisierung](../entscheidungen/2026-08-31-security-modernisierung.md)
