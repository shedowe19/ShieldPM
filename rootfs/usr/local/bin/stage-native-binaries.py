#!/usr/bin/env python3
"""Validate native release archives and stage their payload before downtime."""

from pathlib import Path, PurePosixPath
import posixpath
import shutil
import sys
import tarfile

ELF_MACHINES = {"amd64": 62, "arm64": 183}
MAX_MEMBERS = 100000
MAX_BYTES = 8 * 1024 * 1024 * 1024


def verify_elf(binary, arch):
    with binary.open("rb") as handle:
        header = handle.read(20)
    if len(header) != 20 or header[:4] != b"\x7fELF" or header[4] != 2 or header[5] not in (1, 2):
        raise ValueError("Expected a 64-bit ELF executable")
    byteorder = "little" if header[5] == 1 else "big"
    if int.from_bytes(header[18:20], byteorder) != ELF_MACHINES[arch]:
        raise ValueError(f"Binary does not match {arch}")
    if not binary.stat().st_mode & 0o111:
        raise ValueError("Binary is not executable")


def archive_path(name):
    path = PurePosixPath(name)
    if path.is_absolute() or ".." in path.parts:
        raise ValueError(f"Unsafe archive member: {name}")
    normalized = posixpath.normpath(name)
    if normalized != "." and not normalized.startswith("usr/") and normalized != "usr":
        raise ValueError(f"Unexpected native payload path: {name}")
    return normalized


def link_target(member, name):
    target = member.linkname
    if member.issym():
        resolved = posixpath.normpath(target.lstrip("/") if target.startswith("/") else
                                     posixpath.join(posixpath.dirname(name), target))
    else:
        resolved = archive_path(target)
    if resolved != "usr" and not resolved.startswith("usr/"):
        raise ValueError(f"Archive link escapes /usr: {member.name}")
    # Keep absolute /usr links inside staging without changing their live meaning.
    return posixpath.relpath(resolved, posixpath.dirname(name))


def copy_member(archive, member, target):
    target.parent.mkdir(parents=True, exist_ok=True)
    stream = archive.extractfile(member)
    if stream is None:
        raise ValueError(f"Unreadable archive file: {member.name}")
    with stream, target.open("xb") as output:
        shutil.copyfileobj(stream, output)
    target.chmod(member.mode & 0o777)


def stage_nginx(archive, destination, arch):
    members = archive.getmembers()
    if len(members) > MAX_MEMBERS or sum(member.size for member in members) > MAX_BYTES:
        raise ValueError("Native archive exceeds extraction limits")
    paths = {}
    links = {}
    for member in members:
        name = archive_path(member.name)
        if name == "." and member.isdir():
            continue
        if name in paths:
            raise ValueError(f"Duplicate archive member: {name}")
        if not (member.isdir() or member.isfile() or member.issym() or member.islnk()):
            raise ValueError(f"Unsupported archive member: {name}")
        paths[name] = member
        if member.issym() or member.islnk():
            links[name] = link_target(member, name)
    for name in paths:
        if any(str(parent) in links for parent in PurePosixPath(name).parents):
            raise ValueError(f"Archive writes through a link: {name}")
    required = paths.get("usr/local/nginx/sbin/nginx")
    if required is None or not required.isfile():
        raise ValueError("Nginx executable is missing from the native archive")
    destination.mkdir(parents=True, exist_ok=False)
    for name, member in paths.items():
        target = destination / name
        if member.isdir():
            target.mkdir(parents=True, exist_ok=True)
        elif member.isfile() or member.islnk():
            # Materialize hardlinks as files; tarfile resolves only archive members.
            copy_member(archive, member, target)
    for name, relative_target in links.items():
        if paths[name].issym():
            target = destination / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.symlink_to(relative_target)
    verify_elf(destination / "usr/local/nginx/sbin/nginx", arch)
    for name, member in sorted(paths.items(), key=lambda entry: len(entry[0]), reverse=True):
        if member.isdir():
            (destination / name).chmod(member.mode & 0o777)


def stage_binary(archive, destination, member_name, arch):
    member = archive.getmember(member_name)
    if not member.isfile() or not 0 < member.size <= MAX_BYTES:
        raise ValueError("Expected a regular binary archive member")
    copy_member(archive, member, destination)
    verify_elf(destination, arch)


def main():
    kind, archive_name, destination_name, arch, *extra = sys.argv[1:]
    if arch not in ELF_MACHINES:
        raise ValueError("Unsupported native architecture")
    destination = Path(destination_name)
    with tarfile.open(archive_name, "r:gz") as archive:
        if kind == "nginx" and not extra:
            stage_nginx(archive, destination, arch)
        elif kind == "binary" and len(extra) == 1:
            stage_binary(archive, destination, extra[0], arch)
        else:
            raise ValueError("Usage: stage-native-binaries.py nginx|binary ARCHIVE TARGET ARCH [MEMBER]")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError, tarfile.TarError) as error:
        print(f"Native binary preflight failed: {error}", file=sys.stderr)
        sys.exit(1)
