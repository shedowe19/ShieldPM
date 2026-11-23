# Retention- und Löschplan

**Status:** Betreibervorlage. Die fett markierten Werte sind die Standardwerte der Anwendung und müssen vor Unterzeichnung gegen die eigene Instanz geprüft werden.

## 1. Grundsätze

- Personenbezogene Daten werden nur so lange gespeichert, wie der Zweck es erfordert oder eine gesetzliche Pflicht besteht.
- Löschungen sind nachvollziehbar zu dokumentieren (Datum, Kategorie, Anzahl, Ausführender).
- Backups werden von der regulären Löschung erfasst; ein Restore darf gelöschte Daten nicht dauerhaft wiederherstellen.
- Der Betreiber bestätigt die Fristen und trägt Abweichungen ein.

## 2. Fristen

| Datenkategorie | Ort | Standardfrist | Abweichung / Begründung |
|---|---|---|---|
| Analytics-Rohzeilen | `analytics_logs` | **24 Stunden** (`ANALYTICS_DETAILED_RETENTION_HOURS`) | |
| Analytics-Aggregate | `analytic_count` | **35 Tage** (`ANALYTICS_AGGREGATION_RETENTION_DAYS`) | |
| Audit-Log | `audit_log` | **365 Tage** (`AUDIT_RETENTION_DAYS`) | |
| Nginx-Access-/Error-Logs | `/data/nginx`, `/data/logs` | Rotation, **max. 100 MB** je `json_access.log`; Aufbewahrung nach Rotation | |
| Container-Logs | Docker | **10 MB × 3** je Container | |
| Instanzbackups | `/data/instance-backups` | **max. 50 Archive / 64 GiB**; keine automatische Löschung | Betreiber löscht nach Backup-Plan |
| Auth-Sitzungen | `auth_sessions` | konfigurierbare Refresh-Laufzeit; abgelaufene Sitzungen werden bereinigt | |
| Gelöschte Benutzer | `user`, Audit | Benutzer werden weich gelöscht; Audit bleibt für die Audit-Frist | |
| Support-/Ticketdaten | extern | gemäß Supportvertrag | |
| Drittlandtransfers | Gemini/Gravatar | nur mit AVV/SCC/TIA; sonst deaktiviert | |

## 3. Löschverfahren

1. Kategorie und Frist im Audit-/Betriebsprotokoll prüfen.
2. Löschung über die Anwendung oder ein dokumentiertes SQL-/CLI-Verfahren ausführen; keine manuellen Einzeldateilöschungen ohne Protokoll.
3. Bei Backups: betroffene Archive gemäß Backup-Plan löschen oder den Restore-Scope dokumentieren.
4. Ergebnis mit Datum, Kategorie, Anzahl und Ausführendem protokollieren.
5. Stichprobe: prüfen, dass die Daten nicht mehr abrufbar sind.

## 4. Aufbewahrungspflichten

Gesetzliche Aufbewahrungspflichten (z. B. Handels-/Steuerrecht) gehen den Löschfristen vor. Solche Daten sind zu isolieren, zugriffsbeschränkt und nach Ablauf der Pflicht zu löschen.

## 5. Freigabe

| Rolle | Name | Datum | Unterschrift |
|---|---|---|---|
| Betreiber / Verantwortlicher | | | |
| Datenschutzbeauftragter (falls bestellt) | | | |
