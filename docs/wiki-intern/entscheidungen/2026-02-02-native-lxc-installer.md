# ADR: Debian-Migration & Nativer Installer (LXC)

## Titel

Wechsel der Basis auf Debian (Trixie) und Einführung eines nativen Bash-Installers für Bare-Metal- und LXC-Deployments.

## Status

`Akzeptiert` (Implementiert am 02.02.2026 in PR #274)

## Kontext

Ursprünglich wurde ShieldPM fast ausschließlich als Docker-Image verteilt (basiert oft auf Alpine Linux). Viele fortgeschrittene Proxmox-Nutzer bevorzugen jedoch LXC (Linux Containers), da diese performanter sind, weniger Overhead als Docker-in-Docker (oder Docker-in-LXC) haben und direkte Hardware-Durchreichung erlauben. Die Alpine-Basis machte zudem bei bestimmten nativen Node-Modulen (z.B. SQLite, SSH2, bcrypt) häufig Probleme beim Kompilieren mit `musl-libc`.

## Entscheidung

1. **Debian Base:** Das Basis-Betriebssystem für ShieldPM (sowohl für Docker als auch Native) wurde auf Debian (Trixie) umgestellt (`glibc`-basiert).
2. **Nativer Installer (`scripts/install.sh`):** Ein interaktives Installations-Skript wurde geschrieben.
   - Es installiert alle Abhängigkeiten (`node`, `npm`, `nginx`, `sqlite3`, `certbot`).
   - Es konfiguriert `systemd`-Services für das Backend.
   - Es richtet Verzeichnisse und Rechte ein, ohne dass Docker involviert ist.

## Begründung

- **Kompatibilität:** Debian mit `glibc` bietet höchste Kompatibilität für vorkompilierte Node.js-Binaries.
- **Performance:** Nativer Nginx direkt auf dem Host (oder im LXC) vermeidet das Docker-NAT-Routing, was bei hohen Netzwerklasten die Latenz spürbar senkt.

## Konsequenzen

### Positiv

- ShieldPM kann nun auf jedem Debian/Ubuntu-System ohne Docker installiert werden.
- Höhere Performance und Stabilität bei nativen Modulen.

### Negativ

- Das `install.sh`-Skript muss gepflegt und auf verschiedenen Ubuntu/Debian-Versionen getestet werden, was den Wartungsaufwand erhöht.
- Nginx-Updates auf dem Host müssen vom Nutzer (oder via `apt`) gemacht werden, nicht mehr durch einen simplen Docker-Pull.

## Verwandte Seiten

- [ADR-Übersicht](./README.md)
