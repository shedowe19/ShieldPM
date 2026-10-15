#!/usr/bin/env python3
"""Read and atomically edit shell literal assignments, without executing .env."""

import json
import os
from pathlib import Path
import re
import shlex
import sys
import tempfile


def environment_entries(content, managed):
    lines = re.findall(r"[^\n]*\n|[^\n]+", content)
    assignment = re.compile(r"^[ \t]*(?:export[ \t]+)?([A-Za-z_][A-Za-z0-9_]*)=")
    comment = re.compile(r"^([ \t]*)#[ \t]?")
    entries = []
    start = 0
    while start < len(lines):
        first = lines[start]
        marker = comment.match(first)
        commented = marker is not None
        plain = marker[1] + first[marker.end():] if marker else first
        match = assignment.match(plain)
        if commented and (not match or not managed(match[1])):
            entries.append((None, False, first, first, None))
            start += 1
            continue
        if not match:
            if first.strip():
                raise ValueError(f"Unsupported .env syntax at line {start + 1}")
            entries.append((None, False, first, first, None))
            start += 1
            continue
        key = match[1]
        quote = None
        trailing = False
        unquoted = []
        value = []
        index = start
        complete = False
        continuation = False
        while index < len(lines):
            line = lines[index]
            if commented:
                marker = comment.match(line)
                if marker is None:
                    raise ValueError(f"Incomplete commented .env assignment at line {start + 1}")
                line = marker[1] + line[marker.end():]
            unquoted.append(line)
            cursor = match.end() if index == start else 0
            continuation = False
            while cursor < len(line):
                char = line[cursor]
                if char == "\x00":
                    raise ValueError(f"Unsupported .env syntax at line {start + 1}")
                if quote == "'":
                    if char == "'":
                        quote = None
                    else:
                        value.append(char)
                    cursor += 1
                    continue
                if char == "\\":
                    if trailing and (cursor + 1 == len(line) or line[cursor + 1] != "\n"):
                        raise ValueError(f"Unsupported .env syntax at line {start + 1}")
                    if cursor + 1 == len(line):
                        raise ValueError(f"Incomplete .env escape at line {start + 1}")
                    following = line[cursor + 1]
                    if following == "\n":
                        continuation = True
                        break
                    if quote == '"' and following not in '$`"\\':
                        value.append("\\")
                    value.append(following)
                    cursor += 2
                    continue
                if quote == '"':
                    if char == '"':
                        quote = None
                    elif char in "$`":
                        raise ValueError(f"Dynamic .env syntax at line {start + 1} is unsupported")
                    else:
                        value.append(char)
                    cursor += 1
                    continue
                if char == "\n":
                    complete = True
                    break
                if trailing:
                    if char == "#":
                        complete = True
                        break
                    if char not in " \t\r":
                        raise ValueError(f"Unsupported .env syntax at line {start + 1}")
                elif char in " \t\r":
                    trailing = True
                elif char in "'\"":
                    quote = char
                elif char in "$`;&|<>()":
                    raise ValueError(f"Dynamic .env syntax at line {start + 1} is unsupported")
                else:
                    value.append(char)
                cursor += 1
            if complete or (quote is None and not continuation):
                break
            index += 1
        if quote is not None or continuation:
            raise ValueError(f"Incomplete .env assignment at line {start + 1}")
        raw = "".join(lines[start:index + 1])
        entries.append((key, commented, raw, "".join(unquoted), "".join(value)))
        start = index + 1
    return entries


def replace_file(path, content):
    descriptor, temporary = tempfile.mkstemp(prefix=".shieldpm-env-", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="") as handle:
            handle.write(content)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def database_kind(data_path):
    # Match backend/lib/config.js: an explicit JSON database wins over .env.
    config = data_path / "shieldpm/default.json"
    if config.exists():
        configured = json.loads(config.read_bytes())
        database = configured.get("database") if isinstance(configured, dict) else None
        if database:
            if not isinstance(database, dict):
                raise ValueError("Unsupported database configuration; confirm recovery manually")
            engine = database.get("engine")
            if engine in ("mysql", "mysql2", "pg"):
                return "external"
            if engine == "knex-native" and database.get("knex", {}).get("client") == "better-sqlite3":
                return "sqlite"
            raise ValueError("Unsupported configured database engine; confirm recovery manually")
    path = data_path / ".env"
    entries = environment_entries(path.read_bytes().decode("utf-8"), lambda _key: False) if path.exists() else []
    values = {key: value for key, commented, _raw, _plain, value in entries if key and not commented}
    for provider in ("MYSQL", "POSTGRES"):
        if all(values.get(f"DB_{provider}_{field}") for field in ("HOST", "USER", "NAME")):
            return "external"
    return "sqlite"


def sqlite_file(data_path, backend_path):
    filename = str(data_path / "shieldpm/database.sqlite")
    config = data_path / "shieldpm/default.json"
    if config.exists():
        configured = json.loads(config.read_bytes())
        database = configured.get("database") if isinstance(configured, dict) else None
        if database:
            filename = database.get("knex", {}).get("connection", {}).get("filename", filename)
    if not isinstance(filename, str) or any(char in filename for char in "\x00\r\n"):
        raise ValueError("Unsupported SQLite recovery filename")
    if filename == ":memory:":
        raise ValueError("In-memory SQLite cannot provide a durable recovery checkpoint")
    path = Path(filename)
    return path if path.is_absolute() else backend_path / path


def main():
    command, filename, *arguments = sys.argv[1:]
    path = Path(filename)
    if command == "database-kind":
        print(database_kind(path))
        return
    if command == "sqlite-file":
        backend_path, = arguments
        print(sqlite_file(path, Path(backend_path)))
        return
    if command == "set":
        key, value = arguments
        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", key):
            raise ValueError("Invalid environment key")
        entries = environment_entries(path.read_bytes().decode("utf-8"), lambda candidate: candidate == key)
        content = "".join(raw for candidate, _commented, raw, _plain, _value in entries if candidate != key)
        if content and not content.endswith("\n"):
            content += "\n"
        replace_file(path, content + f"{key}={shlex.quote(value)}\n")
    elif command == "database":
        selected, = arguments
        if selected not in ("MYSQL", "POSTGRES", "SQLITE"):
            raise ValueError("Invalid database provider")
        provider = re.compile(r"DB_(MYSQL|POSTGRES|SQLITE)_[A-Z0-9_]+")
        entries = environment_entries(path.read_bytes().decode("utf-8"), lambda key: provider.fullmatch(key) is not None)
        output = []
        for key, commented, raw, plain, _value in entries:
            match = provider.fullmatch(key or "")
            if match is None:
                output.append(raw)
            elif match[1] == selected and key != "DB_SQLITE_FILE":
                output.append(plain)
            elif commented:
                output.append(raw)
            else:
                output.append("".join("# " + line for line in re.findall(r"[^\n]*\n|[^\n]+", plain)))
        replace_file(path, "".join(output))
    else:
        raise ValueError("Unsupported environment operation")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, UnicodeError) as error:
        # Parser errors report locations only, never credentials.
        sys.exit("Invalid .env encoding" if isinstance(error, UnicodeError) else str(error))
