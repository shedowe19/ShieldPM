#!/usr/bin/env python3
"""Update the three shared GeoLite databases before services start.

Only the latest stable release of the configured public repository is trusted.
Downloads are bounded, verified and staged beside the destination before any
cached database is replaced. No Python package or MaxMind account is required.
"""

import argparse
from contextlib import contextmanager
import ctypes as c
import ctypes.util
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import threading
import time
from urllib.parse import quote, urljoin, urlsplit


LATEST_URL = "https://api.github.com/repos/shedowe19/GeoLite.mmdb/releases/latest"
DATABASES = {
    "GeoLite2-Country.mmdb": ("GeoLite2-Country", "GeoIP2-Country"),
    "GeoLite2-City.mmdb": ("GeoLite2-City", "GeoIP2-City"),
    "GeoLite2-ASN.mmdb": ("GeoLite2-ASN",),
}
TRUSTED_HOSTS = frozenset(("api.github.com", "github.com", "release-assets.githubusercontent.com",
                           "objects.githubusercontent.com", "github-releases.githubusercontent.com"))
MAX_METADATA_BYTES = 2 * 1024 * 1024
MAX_DATABASE_BYTES = 128 * 1024 * 1024
MAX_HEADER_BYTES = 128 * 1024
MAX_UPDATE_SECONDS = 240
MAX_ATTEMPTS = 3
MAX_REDIRECTS = 5


class UpdateError(Exception):
    """An update failed without permission to destroy a usable cache."""


class TransferError(UpdateError):
    """A bounded transfer may be retried."""


class RollbackError(UpdateError):
    """A commit failed and not every previous destination could be restored."""


# Stable public libmaxminddb structures from include/maxminddb.h (SONAME 0).
# Unlike lookup values, these structures contain no compiler-specific uint128.
class Languages(c.Structure):
    _fields_ = [("count", c.c_size_t), ("names", c.POINTER(c.c_char_p))]


class Descriptions(c.Structure):
    _fields_ = [("count", c.c_size_t), ("descriptions", c.c_void_p)]


class Metadata(c.Structure):
    _fields_ = [("node_count", c.c_uint32), ("record_size", c.c_uint16), ("ip_version", c.c_uint16),
                ("database_type", c.c_char_p), ("languages", Languages),
                ("binary_format_major_version", c.c_uint16), ("binary_format_minor_version", c.c_uint16),
                ("build_epoch", c.c_uint64), ("description", Descriptions)]


class Ipv4Start(c.Structure):
    _fields_ = [("netmask", c.c_uint16), ("node_value", c.c_uint32)]


class Database(c.Structure):
    _fields_ = [("flags", c.c_uint32), ("filename", c.c_char_p), ("file_size", c.c_ssize_t),
                ("file_content", c.c_void_p), ("data_section", c.c_void_p), ("data_section_size", c.c_uint32),
                ("metadata_section", c.c_void_p), ("metadata_section_size", c.c_uint32),
                ("full_record_byte_size", c.c_uint16), ("depth", c.c_uint16),
                ("ipv4_start_node", Ipv4Start), ("metadata", Metadata)]


def validate_mmdb(fd, name):
    """Let the installed native reader open the exact validated file descriptor."""
    try:
        library = c.CDLL(ctypes.util.find_library("maxminddb") or "libmaxminddb.so.0")
    except OSError as error:
        raise UpdateError("libmaxminddb is unavailable") from error
    library.MMDB_open.argtypes = [c.c_char_p, c.c_uint32, c.POINTER(Database)]
    library.MMDB_open.restype = c.c_int
    library.MMDB_close.argtypes = [c.POINTER(Database)]
    library.MMDB_close.restype = None
    database = Database()
    code = library.MMDB_open(f"/proc/self/fd/{fd}".encode(), 1, c.byref(database))
    if code:
        raise UpdateError(f"{name} is not a readable MMDB database (reader error {code})")
    try:
        database_type = database.metadata.database_type
        expected = tuple(value.encode() for value in DATABASES[name])
        if database_type not in expected or database.metadata.binary_format_major_version != 2:
            raise UpdateError(f"{name} has an unexpected MMDB database type or format")
    finally:
        library.MMDB_close(c.byref(database))


def trusted_url(url):
    """Accept only HTTPS GitHub endpoints, including every redirect hop."""
    if not isinstance(url, str) or len(url) > 16384 or any(ord(char) < 33 or ord(char) == 127 for char in url):
        raise UpdateError("Invalid download URL")
    try:
        parsed = urlsplit(url)
        safe = (parsed.scheme == "https" and parsed.hostname in TRUSTED_HOSTS and
                parsed.port in (None, 443) and parsed.username is None and parsed.password is None and
                not parsed.fragment)
    except ValueError as error:
        raise UpdateError("Invalid download URL") from error
    if not safe:
        raise UpdateError("Download URL is not a trusted HTTPS GitHub endpoint")
    return url


def remaining_seconds(deadline):
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise UpdateError("GeoIP update exceeded its total time limit")
    return remaining


def response_headers(raw):
    """Read the final response block, after any HTTPS proxy CONNECT response."""
    if len(raw) > MAX_HEADER_BYTES:
        raise UpdateError("Download response headers exceed the size limit")
    blocks = re.split(rb"\r?\n\r?\n", raw)
    responses = [block for block in blocks if block.startswith(b"HTTP/")]
    if not responses:
        raise TransferError("Download returned no HTTP response")
    lines = responses[-1].decode("iso-8859-1").splitlines()
    match = re.fullmatch(r"HTTP/\S+ (\d{3})(?: .*)?", lines[0])
    if not match:
        raise TransferError("Download returned an invalid HTTP response")
    locations = [line.split(":", 1)[1].strip() for line in lines[1:] if line.lower().startswith("location:")]
    if len(locations) > 1:
        raise UpdateError("Download returned multiple redirect locations")
    return int(match[1]), locations[0] if locations else None


def curl_once(url, output, limit, timeout):
    """Stream curl output to a staged file with a hard byte limit and watchdog."""
    with tempfile.TemporaryFile() as headers, tempfile.TemporaryFile() as errors:
        command = ["curl", "-q", "--silent", "--show-error", "--proto", "=https", "--proto-redir", "=https",
                   "--connect-timeout", str(min(10, timeout)), "--max-time", str(timeout),
                   "--max-filesize", str(limit), "--dump-header", f"/proc/self/fd/{headers.fileno()}",
                   "--user-agent", "ShieldPM-GeoIP-Updater", "--header", "Accept: application/json" if url == LATEST_URL
                   else "Accept: application/octet-stream", "--url", url]
        # A Python watchdog also bounds DNS resolution and any stalled stdout read.
        with subprocess.Popen(command, stdout=subprocess.PIPE, stderr=errors,
                              pass_fds=(headers.fileno(),)) as process:
            watchdog = threading.Timer(timeout, process.kill)
            watchdog.daemon = True
            watchdog.start()
            try:
                size = 0
                while chunk := process.stdout.read(65536):
                    size += len(chunk)
                    if size > limit:
                        process.kill()
                        raise UpdateError("Download exceeds the size limit")
                    output.write(chunk)
                code = process.wait()
                if code:
                    raise TransferError(f"HTTPS download failed (curl exit {code})")
            finally:
                watchdog.cancel()
                if process.poll() is None:
                    process.kill()
                    process.wait()
        headers.seek(0)
        return response_headers(headers.read(MAX_HEADER_BYTES + 1))


def download(url, output, limit, deadline):
    """Retry a transfer from scratch; never let curl follow an unchecked redirect."""
    trusted_url(url)
    for attempt in range(MAX_ATTEMPTS):
        current = url
        try:
            for hop in range(MAX_REDIRECTS + 1):
                output.seek(0)
                output.truncate(0)
                status, location = curl_once(current, output, limit, min(60, remaining_seconds(deadline)))
                if status == 200:
                    output.flush()
                    return
                if status in (301, 302, 303, 307, 308):
                    if not location or hop == MAX_REDIRECTS:
                        raise UpdateError("Download has an invalid or excessive redirect chain")
                    current = trusted_url(urljoin(current, location))
                elif status in (408, 429) or status >= 500:
                    raise TransferError(f"GitHub download returned HTTP {status}")
                else:
                    raise UpdateError(f"GitHub download returned HTTP {status}")
        except TransferError:
            if attempt == MAX_ATTEMPTS - 1:
                raise
            time.sleep(min(1, remaining_seconds(deadline)))


def release_assets(payload):
    """Require one complete stable release with exact filenames, sizes and hashes."""
    if not isinstance(payload, dict) or payload.get("draft") is not False or payload.get("prerelease") is not False:
        raise UpdateError("Latest GeoIP release is not stable")
    tag = payload.get("tag_name")
    assets = payload.get("assets")
    if not isinstance(tag, str) or not re.fullmatch(r"[A-Za-z0-9._-]{1,128}", tag):
        raise UpdateError("Latest GeoIP release has an invalid tag")
    if not isinstance(assets, list) or len(assets) > 32:
        raise UpdateError("Latest GeoIP release has invalid assets")
    selected = {}
    for asset in assets:
        if not isinstance(asset, dict) or not isinstance(asset.get("name"), str):
            raise UpdateError("Latest GeoIP release has invalid asset metadata")
        if asset["name"] not in DATABASES:
            continue
        name, size, digest = asset["name"], asset.get("size"), asset.get("digest")
        url = asset.get("browser_download_url")
        expected_url = f"https://github.com/shedowe19/GeoLite.mmdb/releases/download/{quote(tag, safe='')}/{name}"
        if (name in selected or asset.get("state") != "uploaded" or type(size) is not int or
                not 0 < size <= MAX_DATABASE_BYTES or not isinstance(digest, str) or
                not re.fullmatch(r"sha256:[a-fA-F0-9]{64}", digest) or url != expected_url):
            raise UpdateError(f"Latest GeoIP release has invalid metadata for {name}")
        selected[name] = {"size": size, "sha256": digest[7:].lower(), "url": trusted_url(url)}
    if set(selected) != set(DATABASES):
        raise UpdateError("Latest GeoIP release does not contain all three required databases")
    return tag, selected


def open_database(directory_fd, name):
    """Reject symlinks/devices/directories without blocking on a FIFO."""
    try:
        fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=directory_fd)
    except FileNotFoundError:
        return None
    except OSError as error:
        raise UpdateError(f"Unsafe or unreadable GeoIP destination: {name}") from error
    info = os.fstat(fd)
    if not stat.S_ISREG(info.st_mode):
        os.close(fd)
        raise UpdateError(f"Unsafe GeoIP destination: {name}")
    return fd


def file_digest(fd):
    digest = hashlib.sha256()
    os.lseek(fd, 0, os.SEEK_SET)
    while chunk := os.read(fd, 1024 * 1024):
        digest.update(chunk)
    return digest.hexdigest()


def complete_cache(directory_fd):
    """Fallback accepts only three real, correctly typed MMDB files, never markers."""
    for name in DATABASES:
        fd = open_database(directory_fd, name)
        if fd is None:
            raise UpdateError(f"No complete usable GeoIP cache: {name} is missing")
        try:
            if not 0 < os.fstat(fd).st_size <= MAX_DATABASE_BYTES:
                raise UpdateError(f"No complete usable GeoIP cache: {name} has an invalid size")
            validate_mmdb(fd, name)
        finally:
            os.close(fd)


def safe_directory(path):
    """Pin every directory component so parent substitutions cannot redirect writes."""
    path = Path(os.path.abspath(path))
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
    fd = os.open(path.anchor, flags)
    try:
        for component in path.parts[1:]:
            try:
                child = os.open(component, flags, dir_fd=fd)
            except FileNotFoundError:
                try:
                    os.mkdir(component, mode=0o755, dir_fd=fd)
                except FileExistsError:
                    pass
                child = os.open(component, flags, dir_fd=fd)
            os.close(fd)
            fd = child
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError as error:
        os.close(fd)
        if error.errno in (11, 13):
            raise UpdateError("GeoIP destination is unavailable or another updater is using it") from error
        raise UpdateError("GeoIP directory must not contain symlink or non-directory components") from error
    return path, fd


def commit_staged(directory_fd, stage_fd, names, previous):
    """Keep hard-linked originals until every replacement and directory sync succeeds."""
    for name in names:
        if previous[name] is not None:
            current = os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
            if not stat.S_ISREG(current.st_mode) or (current.st_dev, current.st_ino) != previous[name]:
                raise UpdateError(f"GeoIP destination changed during update: {name}")
            os.link(name, name + ".backup", src_dir_fd=directory_fd, dst_dir_fd=stage_fd, follow_symlinks=False)
        else:
            try:
                os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
            except FileNotFoundError:
                continue
            raise UpdateError(f"GeoIP destination appeared during update: {name}")
    committed = []
    try:
        for name in names:
            os.replace(name, name, src_dir_fd=stage_fd, dst_dir_fd=directory_fd)
            committed.append(name)
        os.fsync(directory_fd)
    except OSError as error:
        failed = []
        for name in reversed(committed):
            try:
                if previous[name] is None:
                    os.unlink(name, dir_fd=directory_fd)
                else:
                    os.replace(name + ".backup", name, src_dir_fd=stage_fd, dst_dir_fd=directory_fd)
            except OSError:
                failed.append(name)
        try:
            os.fsync(directory_fd)
        except OSError:
            failed.append("directory sync")
        if failed:
            raise RollbackError("GeoIP commit failed; restoration is incomplete for " + ", ".join(failed)) from error
        raise UpdateError("GeoIP commit failed; previous databases were restored") from error


@contextmanager
def staging_directory(directory_fd):
    """Retain recovery backups if an exceptional rollback cannot restore them."""
    # Linux /proc keeps creation and cleanup pinned to the opened directory even
    # if its original pathname is renamed or replaced while downloads run.
    stage = tempfile.mkdtemp(prefix=".geoip-update-", dir=f"/proc/self/fd/{directory_fd}")
    keep = False
    try:
        yield stage
    except RollbackError as error:
        keep = True
        actual_directory = os.readlink(f"/proc/self/fd/{directory_fd}")
        recovery_path = os.path.join(actual_directory, os.path.basename(stage))
        raise RollbackError(f"{error}; recovery backups retained in {recovery_path}") from error
    finally:
        if not keep:
            shutil.rmtree(stage)


def update(directory, deadline):
    """Fetch one release snapshot and stage every changed asset before committing."""
    _, directory_fd = safe_directory(directory)
    try:
        # Unsafe destinations are fatal even when a network request would fail.
        for name in DATABASES:
            fd = open_database(directory_fd, name)
            if fd is not None:
                os.close(fd)
        try:
            with staging_directory(directory_fd) as stage:
                stage_fd = os.open(stage, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
                try:
                    with tempfile.TemporaryFile() as metadata:
                        download(LATEST_URL, metadata, MAX_METADATA_BYTES, deadline)
                        metadata.seek(0)
                        try:
                            payload = json.load(metadata)
                        except (ValueError, UnicodeError) as error:
                            raise UpdateError("Latest GeoIP release metadata is not valid JSON") from error
                    tag, assets = release_assets(payload)
                    changed, previous = [], {}
                    for name in DATABASES:
                        remaining_seconds(deadline)
                        asset, original = assets[name], open_database(directory_fd, name)
                        matches = False
                        previous[name] = None
                        owner = None
                        if original is not None:
                            try:
                                info = os.fstat(original)
                                previous[name] = (info.st_dev, info.st_ino)
                                owner = (info.st_uid, info.st_gid)
                                if info.st_size == asset["size"] and file_digest(original) == asset["sha256"]:
                                    validate_mmdb(original, name)
                                    matches = True
                            finally:
                                os.close(original)
                        if matches:
                            continue
                        fd = os.open(name, os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                                     0o600, dir_fd=stage_fd)
                        with os.fdopen(fd, "w+b") as downloaded:
                            print(f"[GeoIP] Downloading {name} ({asset['size']} bytes)", flush=True)
                            download(asset["url"], downloaded, asset["size"], deadline)
                            if os.fstat(fd).st_size != asset["size"] or file_digest(fd) != asset["sha256"]:
                                raise UpdateError(f"{name} does not match the release size and SHA-256 digest")
                            validate_mmdb(fd, name)
                            os.fchmod(fd, 0o644)
                            if owner is not None:
                                os.fchown(fd, *owner)
                            os.fsync(fd)
                        changed.append(name)
                    remaining_seconds(deadline)
                    commit_staged(directory_fd, stage_fd, changed, previous)
                    print(f"[GeoIP] Release {tag} ready; {len(changed)} updated, {len(DATABASES) - len(changed)} unchanged")
                finally:
                    os.close(stage_fd)
        except RollbackError:
            raise
        except (UpdateError, OSError) as error:
            try:
                complete_cache(directory_fd)
            except (UpdateError, OSError) as cache_error:
                raise UpdateError(f"{error}; {cache_error}") from error
            print(f"[GeoIP] WARNING: {error}; using the complete validated cached databases", file=sys.stderr)
    finally:
        os.close(directory_fd)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", default="/data/nginx", help="Shared MMDB directory (default: /data/nginx)")
    arguments = parser.parse_args(argv)
    if os.environ.get("GEOIP_AUTO_UPDATE", "true").strip().lower() == "false":
        print("[GeoIP] Automatic database updates disabled by GEOIP_AUTO_UPDATE=false")
        return 0
    try:
        update(arguments.directory, time.monotonic() + MAX_UPDATE_SECONDS)
    except (UpdateError, OSError) as error:
        print(f"[GeoIP] ERROR: {error}; startup stopped (set GEOIP_AUTO_UPDATE=false for custom/offline setup)",
              file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
