# ADR: Migration der Environment-Validierung auf Node.js

## Titel

Refactoring der Container-Environment-Validierung von Bash (`envs.sh`) nach Node.js (`validate-env.cjs`).

## Status

`Akzeptiert` (Implementiert am 03.12.2025 in Commit ce081580)

## Kontext

Die Initialisierung des Docker-Containers (sowie der nativen Installation) erforderte die Prüfung und Bereitstellung zahlreicher Umgebungsvariablen mit Default-Werten. Ursprünglich wurde dies durch ein über 500 Zeilen langes Bash-Skript (`rootfs/usr/local/bin/envs.sh`) gesteuert.

- Bash-Skripte in dieser Größe sind schwer zu testen und fehleranfällig (z.B. Escaping-Probleme, String-Vergleiche).
- Die Wartbarkeit für JavaScript-Entwickler war eingeschränkt.

## Entscheidung

Die gesamte Validierungs-Logik wurde aus Bash in ein neues Node.js-Skript (`backend/validate-env.cjs`) ausgelagert.

- Das alte `envs.sh` wurde drastisch reduziert und ruft nun intern das Node.js-Skript auf.
- Das Node-Skript exportiert die validierten Variablen sicher, sodass das Bash-Skript sie in die Laufzeitumgebung übernehmen kann.

## Begründung

- **Wartbarkeit:** Da der gesamte ShieldPM-Stack (Frontend und Backend) auf Node.js/TypeScript basiert, ist es konsistenter, komplexe Logik (wie Regex-Prüfungen für IPs oder Ports) in JavaScript zu schreiben.
- **Sicherheit & Escaping:** Node.js handhabt das Escaping von Sonderzeichen (z.B. in Passwort-Umgebungsvariablen) zuverlässiger als manuelle Bash-Hacks.
- **Testbarkeit:** Die Logik im `validate-env.cjs` kann isoliert durch Unit-Tests (Vitest/Jest) abgedeckt werden.

## Alternativen

- Beibehaltung des Bash-Skripts (abgelehnt wegen stetig wachsender Komplexität bei neuen Features).
- Auslagerung in Python oder Go (abgelehnt, da dies zusätzliche Runtimes in das Image zwingen würde, was der "Node.js first"-Philosophie von ShieldPM widerspricht).

## Konsequenzen

### Positiv

- Sicherere Validierung der Umgebungsvariablen.
- Einfacheres Hinzufügen neuer Konfigurationsoptionen.
- Reduzierter Maintenance-Aufwand für Container-Boot-Prozesse.

### Negativ

- Das Boot-Skript (Bash) ist nun von der Node.js-Runtime abhängig. (Da ShieldPM jedoch ohnehin Node.js benötigt, ist dies ein vernachlässigbarer Nachteil).

## Verwandte Seiten

- [ADR-Übersicht](./README.md)
- [Umgebungsvariablen](../konfiguration/umgebungsvariablen.md)
