#!/usr/bin/env sh

# Shared by startup and the isolated infrastructure regression tests.
migrate_legacy_directory() {
    migration_source=$1
    migration_target=$2
    migration_backup_root=${3:-$(dirname "$migration_source")}
    [ -d "$migration_source" ] || return 0

    mkdir -p "$migration_target" || return 1
    # Include dotfiles and retain destination files configured since migration.
    # Preserve the entire source as a backup, including conflicting files.
    cp -an "$migration_source/." "$migration_target/" || return 1
    mkdir -p "$migration_backup_root" || return 1
    migration_backup=$(mktemp -d "$migration_backup_root/$(basename "$migration_source").migrated.XXXXXX") || return 1
    mv "$migration_source" "$migration_backup/original" || return 1
    echo "Migrated $migration_source; original files retained in $migration_backup/original"
}

migrate_legacy_sqlite() {
    sqlite_source=$1
    sqlite_target=$2
    sqlite_backup_root=$3
    [ -s "$sqlite_source" ] || return 0
    # Never replace an existing database, including an empty file or symlink.
    if [ -e "$sqlite_target" ] || [ -L "$sqlite_target" ]; then
        return 0
    fi
    mkdir -p "$(dirname "$sqlite_target")" "$sqlite_backup_root" || return 1
    # A file move alone loses committed transactions still stored in the WAL.
    # SQLite's backup API reads the complete committed snapshot, then publishes
    # it without overwriting a destination created by another startup process.
    sqlite_snapshot=$(mktemp "$(dirname "$sqlite_target")/.sqlite-migration-XXXXXX") || return 1
    if ! python3 - "$sqlite_source" "$sqlite_snapshot" <<'PY'
from pathlib import Path
import sqlite3
import sys

source, target = map(Path, sys.argv[1:])
source_db = sqlite3.connect(source.resolve().as_uri() + "?mode=ro", uri=True)
target_db = sqlite3.connect(target)
try:
    source_db.backup(target_db)
finally:
    target_db.close()
    source_db.close()
PY
    then
        rm -f "$sqlite_snapshot"
        return 1
    fi
    sqlite_backup=$(mktemp -d "$sqlite_backup_root/database.sqlite.migrated.XXXXXX") || {
        rm -f "$sqlite_snapshot"
        return 1
    }
    set --
    for sqlite_file in "$sqlite_source" "$sqlite_source-wal" "$sqlite_source-shm"; do
        [ -e "$sqlite_file" ] || continue
        set -- "$@" "$sqlite_file"
    done
    # Do not split the original main/WAL/SHM set with sequential moves. Even if
    # cleanup later fails, a complete original archive must already exist.
    if ! cp -a "$@" "$sqlite_backup/" || ! ln "$sqlite_snapshot" "$sqlite_target"; then
        rm -f "$sqlite_snapshot"
        return 1
    fi
    rm -f "$sqlite_snapshot" || return 1
    echo "Original SQLite database backed up in $sqlite_backup"
    rm -f "$@" || return 1
    echo "Migrated SQLite database; original files retained in $sqlite_backup"
}

relink_certbot_certificates() {
    certbot_root=$1
    [ -d "$certbot_root/live" ] && [ -d "$certbot_root/archive" ] || return 0

    for certbot_live in "$certbot_root/live/"*; do
        [ -d "$certbot_live" ] || continue
        certbot_lineage=${certbot_live##*/}
        for certbot_kind in cert chain fullchain privkey; do
            certbot_file="$certbot_live/$certbot_kind.pem"
            if [ ! -f "$certbot_file" ] || [ -L "$certbot_file" ]; then
                continue
            fi
            certbot_match=""
            certbot_version=0
            for certbot_archive in "$certbot_root/archive/$certbot_lineage/$certbot_kind"[0-9]*.pem; do
                [ -f "$certbot_archive" ] || continue
                certbot_number=${certbot_archive##*/}
                certbot_number=${certbot_number#"$certbot_kind"}
                certbot_number=${certbot_number%.pem}
                case "$certbot_number" in ''|*[!0-9]*) continue ;; esac
                if [ "$certbot_number" -gt "$certbot_version" ] && cmp -s "$certbot_file" "$certbot_archive"; then
                    certbot_match=$certbot_archive
                    certbot_version=$certbot_number
                fi
            done
            # A different/newer certificate may not match this private key.
            # Never replace unmatched live files or delete renewal archives.
            [ -n "$certbot_match" ] || continue
            # Use a private temporary directory so a previous interrupted start
            # cannot leave a deterministic link name that blocks every restart.
            certbot_link_dir=$(mktemp -d "$certbot_live/.shieldpm-link.XXXXXX") || return 1
            certbot_link="$certbot_link_dir/$certbot_kind.pem"
            if ! ln -s "../../archive/$certbot_lineage/${certbot_match##*/}" "$certbot_link" || \
               ! mv -Tf "$certbot_link" "$certbot_file"; then
                rm -rf "$certbot_link_dir"
                return 1
            fi
            rmdir "$certbot_link_dir" || return 1
        done
    done
}
