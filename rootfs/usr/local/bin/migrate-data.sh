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
            certbot_link="$certbot_file.shieldpm-link"
            ln -s "../../archive/$certbot_lineage/${certbot_match##*/}" "$certbot_link" || return 1
            mv -Tf "$certbot_link" "$certbot_file" || return 1
        done
    done
}
