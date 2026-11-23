# DSAR-Runbook (Auskunft, Export, Löschung)

**Status:** Betreiberverfahren. Es ergänzt die Anwendung, ersetzt aber keine juristische Prüfung.

## 1. Eingang und Frist

- Anfrage identifizieren, Eingang und Frist (grundsätzlich ein Monat, Art. 12 Abs. 3 DSGVO) dokumentieren.
- Identität verifizieren; keine Daten an unbefugte Dritte herausgeben.
- Zuständige Rolle und Vertreter benennen.

## 2. Datenbestand ermitteln

| Quelle | Inhalt | Abfrage |
|---|---|---|
| `user` | Stammdaten, Rollen, Status | nach E-Mail/ID |
| `auth` | Passwort-Hash, Auth-Typ | `user_id` |
| `user_2fa` | TOTP/Passkey/Duo-Metadaten | `user_id` |
| `auth_sessions` | Sitzungen, IP, User-Agent, Widerruf | `user_id` |
| `audit_log` | Aktionen mit Akteur, IP, Request-ID | `user_id` / `actor_user_id` |
| `proxy_host` und Revisionen | Hosts, Notizen, verschlüsselte Zugangsdaten | `owner_user_id` |
| `chat_integration` | ChatOps-Token und Konfiguration | `user_id` |
| Analytics | aggregierte Zugriffe, keine direkte Personenzuordnung | Host-/Zeitfenster |
| Backups | vollständige Instanzkopie | separat, verschlüsselt |

## 3. Export

1. Stammdaten und Rollen als JSON exportieren.
2. Sitzungs- und Auditdaten als JSON/CSV exportieren; Geheimnisse (Passwort-Hashes, 2FA-Seeds, Tokens, private Schlüssel) **nicht** im Klartext herausgeben.
3. Verschlüsselte Zugangsdaten nur als Metadaten („vorhanden“) ausweisen.
4. Export verschlüsselt übergeben, Zugriff nach Übergabe entziehen.
5. Vorgang im Audit-Log dokumentieren.

## 4. Löschung

1. Prüfen, ob gesetzliche Aufbewahrungspflichten entgegenstehen.
2. Benutzer deaktivieren und alle Sitzungen widerrufen.
3. Personenbezogene Felder löschen oder anonymisieren; Audit-Einträge nach der Audit-Frist löschen.
4. Backups gemäß Retention-Plan behandeln; ein späterer Restore darf die Löschung nicht rückgängig machen.
5. Löschbestätigung mit Datum, Umfang und Ausführendem ausstellen.

## 5. Einschränkung und Widerspruch

- Verarbeitung einschränken: Konto deaktivieren, Sitzungen widerrufen, Verarbeitung dokumentieren.
- Widerspruch gegen KI-/Drittanbieterverarbeitung: Gemini/Gravatar deaktivieren und schriftlich bestätigen.

## 6. Nachweis

Jede Anfrage erhält eine Vorgangsnummer und einen Abschlussvermerk. Der Nachweis enthält keine personenbezogenen Inhalte, die nicht für die Bearbeitung erforderlich sind.
