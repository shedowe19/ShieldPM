#!/usr/bin/env bash

# This file is sourced by envs.sh. Return on failure so startup fails closed.
load_env_secrets() {
    local max_bytes="${SECRET_FILE_MAX_BYTES:-65536}"
    local hard_max_bytes=1048576
    local file_name destination secret_path secret_directory
    local directory_mode directory_other directory_group
    local mode other group before_identity opened_identity size
    local secret_fd secret_value_with_sentinel secret_value value_size

    if [[ ! "$max_bytes" =~ ^[1-9][0-9]*$ ]] ||
        [ "$max_bytes" -gt "$hard_max_bytes" ]; then
        echo "ERROR: SECRET_FILE_MAX_BYTES must be between 1 and $hard_max_bytes." >&2
        return 1
    fi

    while IFS= read -r file_name; do
        [[ "$file_name" =~ ^[A-Za-z_][A-Za-z0-9_]*_FILE$ ]] || continue
        if [ "$file_name" = "SECRET_FILE_MAX_BYTES_FILE" ]; then
            echo "ERROR: SECRET_FILE_MAX_BYTES_FILE is not supported." >&2
            return 1
        fi
        case "$file_name" in
            # SSL_CERT_FILE is a standard path-valued variable, not a Docker secret.
            # initial-setup.js owns the stricter validation for the ownership token.
            SSL_CERT_FILE|INITIAL_ADMIN_SETUP_TOKEN_FILE) continue ;;
        esac

        destination=${file_name%_FILE}
        secret_path=${!file_name}

        if [[ -v $destination ]]; then
            echo "ERROR: $destination and $file_name cannot be set together." >&2
            return 1
        fi
        case "$secret_path" in
            /*) ;;
            *) echo "ERROR: $file_name must contain an absolute path." >&2; return 1 ;;
        esac
        case "$secret_path" in
            *$'\n'*|*$'\r'*) echo "ERROR: $file_name contains a control character." >&2; return 1 ;;
        esac
        if [ -L "$secret_path" ] || [ ! -f "$secret_path" ]; then
            echo "ERROR: $file_name must reference a regular non-symlink file." >&2
            return 1
        fi

        secret_directory=$(dirname -- "$secret_path")
        while [ "$secret_directory" != "/" ]; do
            if [ -L "$secret_directory" ] || [ ! -d "$secret_directory" ]; then
                echo "ERROR: $file_name has a symlink/non-directory parent." >&2
                return 1
            fi
            directory_mode=$(stat -c '%a' "$secret_directory") || return 1
            directory_other=$((directory_mode % 10))
            directory_group=$(((directory_mode / 10) % 10))
            if [ $((directory_other & 2)) -ne 0 ] || [ $((directory_group & 2)) -ne 0 ]; then
                echo "ERROR: $file_name has a group/world-writable parent directory." >&2
                return 1
            fi
            secret_directory=$(dirname -- "$secret_directory")
        done

        mode=$(stat -c '%a' "$secret_path") || return 1
        other=$((mode % 10))
        group=$(((mode / 10) % 10))
        if [ "$other" -ne 0 ] || [ "$group" -ne 0 ]; then
            echo "ERROR: $file_name permissions must be 0600 or stricter." >&2
            return 1
        fi

        before_identity=$(stat -c '%d:%i' "$secret_path") || return 1
        # Keep one descriptor open and compare its identity to close the lstat/open race.
        exec {secret_fd}< "$secret_path" || return 1
        opened_identity=$(stat -Lc '%d:%i' "/proc/self/fd/$secret_fd") || {
            exec {secret_fd}<&-
            return 1
        }
        if [ "$before_identity" != "$opened_identity" ]; then
            exec {secret_fd}<&-
            echo "ERROR: $file_name changed while it was opened." >&2
            return 1
        fi
        size=$(stat -Lc '%s' "/proc/self/fd/$secret_fd") || {
            exec {secret_fd}<&-
            return 1
        }
        if [ "$size" -gt "$max_bytes" ]; then
            exec {secret_fd}<&-
            echo "ERROR: $file_name exceeds SECRET_FILE_MAX_BYTES." >&2
            return 1
        fi

        # The sentinel preserves trailing newlines through command substitution.
        secret_value_with_sentinel=$(cat <&"$secret_fd" && printf '\001') || {
            exec {secret_fd}<&-
            return 1
        }
        exec {secret_fd}<&-
        secret_value=${secret_value_with_sentinel%$'\001'}
        value_size=$(printf '%s' "$secret_value" | wc -c)
        if [ "$value_size" -ne "$size" ]; then
            echo "ERROR: $file_name contains a NUL byte or unreadable data." >&2
            return 1
        fi
        case "$secret_value" in
            *$'\r\n') secret_value=${secret_value%$'\r\n'} ;;
            *$'\n') secret_value=${secret_value%$'\n'} ;;
        esac

        printf -v "$destination" '%s' "$secret_value"
        export "$destination"
        unset "$file_name"
    done < <(compgen -A variable | LC_ALL=C sort)
}

load_env_secrets
