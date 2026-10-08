"""Exercise the real boot updater with native MMDB validation and bounded transport."""

from contextlib import redirect_stderr, redirect_stdout
import copy
import ctypes
import ctypes.util
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import time
import unittest
from unittest.mock import patch


REPO = Path(__file__).resolve().parents[2]
HELPER = REPO / "rootfs/usr/local/bin/update-geoip.py"
SPEC = importlib.util.spec_from_file_location("shieldpm_geoip_update", HELPER)
updater = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(updater)
FIXTURES = {
    "GeoLite2-Country.mmdb": REPO / "scripts/ci/fixtures/GeoIP2-Country-Test.mmdb",
    "GeoLite2-City.mmdb": REPO / "scripts/ci/fixtures/GeoIP2-City-Test.mmdb",
    "GeoLite2-ASN.mmdb": REPO / "scripts/ci/fixtures/GeoLite2-ASN-Test.mmdb",
}


def release(contents):
    return {
        "tag_name": "2026.10.04", "draft": False, "prerelease": False,
        "assets": [{"name": name, "state": "uploaded", "size": len(data),
                    "digest": "sha256:" + hashlib.sha256(data).hexdigest(),
                    "browser_download_url": f"https://github.com/shedowe19/GeoLite.mmdb/releases/download/2026.10.04/{name}"}
                   for name, data in contents.items()],
    }


class GeoipMetadataTests(unittest.TestCase):
    def setUp(self):
        self.payload = release({name: b"bytes" for name in updater.DATABASES})

    def test_requires_complete_stable_exact_release_with_hashes(self):
        tag, assets = updater.release_assets(self.payload)
        self.assertEqual(tag, "2026.10.04")
        self.assertEqual(set(assets), set(updater.DATABASES))
        cases = [
            {"draft": True}, {"prerelease": True}, {"tag_name": "../../evil"},
            {"assets": self.payload["assets"][:-1]},
            {"assets": [*self.payload["assets"], self.payload["assets"][0]]},
            {"assets": [{"name": []}]},
        ]
        for change in cases:
            with self.subTest(change=change), self.assertRaises(updater.UpdateError):
                updater.release_assets({**self.payload, **change})

    def test_rejects_wrong_size_digest_and_asset_origin(self):
        for field, value in (("size", True), ("size", 0), ("size", updater.MAX_DATABASE_BYTES + 1),
                             ("digest", "sha256:broken"), ("state", "new"),
                             ("browser_download_url", "https://github.com/other/repo/asset.mmdb")):
            with self.subTest(field=field, value=value):
                payload = copy.deepcopy(self.payload)
                payload["assets"][0][field] = value
                with self.assertRaises(updater.UpdateError):
                    updater.release_assets(payload)

    def test_trusted_https_urls_reject_credentials_ports_and_untrusted_hosts(self):
        self.assertEqual(updater.trusted_url(updater.LATEST_URL), updater.LATEST_URL)
        self.assertEqual(updater.trusted_url("https://release-assets.githubusercontent.com/a?token=abc"),
                         "https://release-assets.githubusercontent.com/a?token=abc")
        for url in ("http://github.com/a", "https://github.com.evil.test/a", "https://127.0.0.1/a",
                    "https://user:password@github.com/a", "https://github.com:444/a",
                    "https://github.com/a#fragment", "https://github.com/a\nHeader:evil"):
            with self.subTest(url=url), self.assertRaises(updater.UpdateError):
                updater.trusted_url(url)

    def test_headers_use_final_response_and_reject_ambiguous_locations(self):
        response = b"HTTP/1.1 200 Connection established\r\n\r\nHTTP/2 302\r\nLocation: /next\r\n\r\n"
        self.assertEqual(updater.response_headers(response), (302, "/next"))
        with self.assertRaises(updater.UpdateError):
            updater.response_headers(b"HTTP/2 302\r\nLocation: /a\r\nLocation: /b\r\n\r\n")
        with self.assertRaises(updater.UpdateError):
            updater.response_headers(b"A" * (updater.MAX_HEADER_BYTES + 1))

    def test_redirect_is_validated_before_the_next_request(self):
        output = io.BytesIO()
        with patch.object(updater, "curl_once", return_value=(302, "http://127.0.0.1/private")) as curl:
            with self.assertRaises(updater.UpdateError):
                updater.download(updater.LATEST_URL, output, 20, time.monotonic() + 10)
            self.assertEqual(curl.call_count, 1)

    def test_redirect_limits_and_retries_restart_without_partial_body(self):
        output = io.BytesIO()
        seen = []
        def once(url, target, limit, timeout):
            seen.append(target.getvalue())
            target.write(b"partial" if len(seen) == 1 else b"complete")
            if len(seen) == 1:
                raise updater.TransferError("offline")
            return 200, None
        with patch.object(updater, "curl_once", side_effect=once), patch.object(updater.time, "sleep"):
            updater.download(updater.LATEST_URL, output, 20, time.monotonic() + 10)
        self.assertEqual(seen, [b"", b""])
        self.assertEqual(output.getvalue(), b"complete")
        with patch.object(updater, "curl_once", return_value=(302, "/loop")) as curl:
            with self.assertRaises(updater.UpdateError):
                updater.download(updater.LATEST_URL, output, 20, time.monotonic() + 10)
            self.assertEqual(curl.call_count, updater.MAX_REDIRECTS + 1)

    def test_total_deadline_expires_before_starting_another_transfer(self):
        with patch.object(updater, "curl_once") as curl, self.assertRaises(updater.UpdateError):
            updater.download(updater.LATEST_URL, io.BytesIO(), 10, time.monotonic() - 1)
        curl.assert_not_called()

    def test_disabled_cli_does_not_create_directory_or_request_metadata(self):
        with tempfile.TemporaryDirectory() as root:
            directory = Path(root) / "missing"
            with patch.dict(os.environ, {"GEOIP_AUTO_UPDATE": " FALSE "}), patch.object(updater, "download") as fetch:
                with redirect_stdout(io.StringIO()):
                    self.assertEqual(updater.main(["--directory", str(directory)]), 0)
            self.assertFalse(directory.exists())
            fetch.assert_not_called()


class GeoipUpdateTests(unittest.TestCase):
    def setUp(self):
        # CI installs libmaxminddb0. Local development can use the existing Nginx
        # test library via LD_LIBRARY_PATH; never replace the production validator.
        try:
            ctypes.CDLL(ctypes.util.find_library("maxminddb") or "libmaxminddb.so.0")
        except OSError:
            self.skipTest("libmaxminddb0 is required for native database validation")
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.directory = Path(temporary.name) / "nginx"
        self.directory.mkdir()
        self.contents = {name: fixture.read_bytes() for name, fixture in FIXTURES.items()}
        self.payload = release(self.contents)
        self.requests = []

    def fetch(self, url, output, limit, deadline):
        self.requests.append(url)
        data = json.dumps(self.payload).encode() if url == updater.LATEST_URL else self.contents[url.rsplit("/", 1)[1]]
        self.assertLessEqual(len(data), limit)
        output.write(data)
        output.flush()

    def run_update(self, fetch=None):
        stdout, stderr = io.StringIO(), io.StringIO()
        with patch.object(updater, "download", side_effect=fetch or self.fetch), redirect_stdout(stdout), redirect_stderr(stderr):
            updater.update(self.directory, time.monotonic() + 30)
        return stdout.getvalue(), stderr.getvalue()

    def seed_cache(self):
        for name, data in self.contents.items():
            (self.directory / name).write_bytes(data)

    def assert_cache(self, expected=None):
        for name, data in (expected or self.contents).items():
            self.assertEqual((self.directory / name).read_bytes(), data)

    def test_first_boot_installs_all_native_databases_and_unchanged_boot_keeps_inodes(self):
        stdout, stderr = self.run_update()
        self.assertIn("3 updated, 0 unchanged", stdout)
        self.assertEqual(stderr, "")
        self.assert_cache()
        inodes = {name: (self.directory / name).stat().st_ino for name in self.contents}
        for name in self.contents:
            self.assertEqual((self.directory / name).stat().st_mode & 0o777, 0o644)
        self.requests.clear()
        stdout, stderr = self.run_update()
        self.assertEqual(self.requests, [updater.LATEST_URL])
        self.assertIn("0 updated, 3 unchanged", stdout)
        self.assertEqual(inodes, {name: (self.directory / name).stat().st_ino for name in self.contents})

    def test_zero_byte_and_corrupt_regular_cache_files_are_repaired_online(self):
        self.seed_cache()
        names = list(self.contents)
        (self.directory / names[0]).write_bytes(b"")
        (self.directory / names[1]).write_bytes(b"not a database")
        stdout, stderr = self.run_update()
        self.assertIn("2 updated, 1 unchanged", stdout)
        self.assertEqual(stderr, "")
        self.assert_cache()

    def test_oversize_regular_cache_is_repaired_without_reading_it(self):
        self.seed_cache()
        name = next(iter(self.contents))
        with (self.directory / name).open("wb") as output:
            output.truncate(updater.MAX_DATABASE_BYTES + 1)
        self.run_update()
        self.assert_cache()

    def test_native_validation_rejects_wrong_edition_corrupt_and_truncated_database(self):
        target = self.directory / "test.mmdb"
        for data in (self.contents["GeoLite2-ASN.mmdb"], b"not MMDB", self.contents["GeoLite2-Country.mmdb"][:100]):
            with self.subTest(size=len(data)):
                target.write_bytes(data)
                with target.open("rb") as handle, self.assertRaises(updater.UpdateError):
                    updater.validate_mmdb(handle.fileno(), "GeoLite2-Country.mmdb")

    def test_no_partial_replacement_when_the_last_asset_has_wrong_hash(self):
        self.seed_cache()
        before = dict(self.contents)
        for name in self.contents:
            # Trailing unused bytes keep the fixture natively valid while making
            # its release hash/size differ from the good previous release.
            self.contents[name] += b"new release"
        self.payload = release(self.contents)
        self.payload["assets"][-1]["digest"] = "sha256:" + "0" * 64
        stdout, stderr = self.run_update()
        self.assertIn("using the complete validated cached databases", stderr)
        self.assert_cache(before)
        self.assertFalse(list(self.directory.glob(".geoip-update-*")))

    def test_hash_size_and_native_validation_failures_never_destroy_good_cache(self):
        self.seed_cache()
        before = dict(self.contents)
        name = next(iter(self.contents))
        self.contents[name] = self.contents["GeoLite2-ASN.mmdb"]
        self.payload = release(self.contents)
        stdout, stderr = self.run_update()
        self.assertIn("unexpected MMDB database type", stderr)
        self.assert_cache(before)
        self.assertFalse(list(self.directory.glob(".geoip-update-*")))

    def test_network_and_incomplete_release_fall_back_only_to_complete_native_cache(self):
        self.seed_cache()
        for fetch in (lambda *args: (_ for _ in ()).throw(updater.TransferError("network unavailable")), self.fetch):
            self.payload["assets"] = self.payload["assets"][:2]
            stdout, stderr = self.run_update(fetch)
            self.assertIn("WARNING", stderr)
            self.assert_cache()
        (self.directory / "GeoLite2-ASN.mmdb").unlink()
        with self.assertRaisesRegex(updater.UpdateError, "No complete usable GeoIP cache"):
            self.run_update(lambda *args: (_ for _ in ()).throw(updater.TransferError("offline")))

    def test_malformed_asset_names_use_validated_cache_instead_of_uncaught_typeerror(self):
        self.seed_cache()
        self.payload["assets"] = [{"name": []}]
        stdout, stderr = self.run_update()
        self.assertIn("invalid asset metadata", stderr)
        self.assert_cache()

    def test_first_boot_failure_is_nonzero_without_usable_cache(self):
        with patch.object(updater, "download", side_effect=updater.TransferError("offline")), redirect_stderr(io.StringIO()):
            self.assertEqual(updater.main(["--directory", str(self.directory)]), 1)
        self.assertFalse(list(self.directory.iterdir()))

    def test_invalid_cache_cannot_be_used_for_network_fallback(self):
        self.seed_cache()
        (self.directory / "GeoLite2-ASN.mmdb").write_bytes(self.contents["GeoLite2-Country.mmdb"])
        with self.assertRaisesRegex(updater.UpdateError, "unexpected MMDB database type"):
            self.run_update(lambda *args: (_ for _ in ()).throw(updater.TransferError("offline")))

    def test_symlink_fifo_and_directory_destinations_fail_before_download(self):
        name = next(iter(self.contents))
        outside = self.directory.parent / "outside"
        outside.write_bytes(b"preserve")
        for kind in ("symlink", "fifo", "directory"):
            with self.subTest(kind=kind):
                target = self.directory / name
                if kind == "symlink":
                    target.symlink_to(outside)
                elif kind == "fifo":
                    os.mkfifo(target)
                else:
                    target.mkdir()
                with self.assertRaises(updater.UpdateError):
                    self.run_update()
                self.assertEqual(self.requests, [])
                self.assertEqual(outside.read_bytes(), b"preserve")
                target.rmdir() if kind == "directory" else target.unlink()

    def test_symlink_directory_component_and_concurrent_update_are_rejected(self):
        linked = self.directory.parent / "linked"
        linked.symlink_to(self.directory, target_is_directory=True)
        with self.assertRaises(updater.UpdateError):
            updater.safe_directory(linked)
        path, fd = updater.safe_directory(self.directory)
        try:
            with self.assertRaisesRegex(updater.UpdateError, "another updater"):
                updater.safe_directory(self.directory)
        finally:
            os.close(fd)

    def test_directory_substitution_during_fetch_cannot_redirect_staging_or_replacements(self):
        original = self.directory.parent / "original"
        foreign = self.directory.parent / "foreign"
        foreign.mkdir()
        def replace_path_after_open(url, output, limit, deadline):
            if url == updater.LATEST_URL:
                self.directory.rename(original)
                self.directory.symlink_to(foreign, target_is_directory=True)
            self.fetch(url, output, limit, deadline)
        self.run_update(replace_path_after_open)
        self.assertEqual(list(foreign.iterdir()), [])
        for name, data in self.contents.items():
            self.assertEqual((original / name).read_bytes(), data)
        self.assertFalse(list(original.glob(".geoip-update-*")))

    def prepare_changed_release(self):
        self.seed_cache()
        before = dict(self.contents)
        for name in self.contents:
            self.contents[name] += b"new release"
        self.payload = release(self.contents)
        return before

    def test_commit_failure_restores_all_previous_files_before_cache_fallback(self):
        before = self.prepare_changed_release()
        real_replace, calls = os.replace, []
        def fail_second(src, dst, **kwargs):
            calls.append(src)
            if len(calls) == 2:
                raise OSError("disk failure")
            return real_replace(src, dst, **kwargs)
        with patch.object(updater.os, "replace", side_effect=fail_second):
            stdout, stderr = self.run_update()
        self.assertIn("previous databases were restored", stderr)
        self.assert_cache(before)
        self.assertFalse(list(self.directory.glob(".geoip-update-*")))

    def test_first_boot_commit_failure_removes_new_files_and_stops_start(self):
        real_replace, calls = os.replace, []
        def fail_second(src, dst, **kwargs):
            calls.append(src)
            if len(calls) == 2:
                raise OSError("disk failure")
            return real_replace(src, dst, **kwargs)
        with patch.object(updater.os, "replace", side_effect=fail_second):
            with self.assertRaisesRegex(updater.UpdateError, "previous databases were restored"):
                self.run_update()
        self.assertEqual(list(self.directory.iterdir()), [])

    def test_directory_sync_failure_after_full_commit_restores_every_old_file(self):
        before = self.prepare_changed_release()
        real_sync, calls = os.fsync, []
        def fail_commit_sync(fd):
            calls.append(fd)
            if len(calls) == 4:  # Three staged files, then the destination directory.
                raise OSError("directory sync failure")
            return real_sync(fd)
        with patch.object(updater.os, "fsync", side_effect=fail_commit_sync):
            stdout, stderr = self.run_update()
        self.assertIn("previous databases were restored", stderr)
        self.assert_cache(before)
        self.assertFalse(list(self.directory.glob(".geoip-update-*")))

    def test_incomplete_rollback_stops_start_and_preserves_recoverable_backup(self):
        before = self.prepare_changed_release()
        real_replace, calls = os.replace, []
        def fail_commit_and_restore(src, dst, **kwargs):
            calls.append(src)
            if len(calls) >= 2:
                raise OSError("persistent disk failure")
            return real_replace(src, dst, **kwargs)
        with patch.object(updater.os, "replace", side_effect=fail_commit_and_restore):
            with self.assertRaisesRegex(updater.RollbackError, "recovery backups retained"):
                self.run_update()
        stages = list(self.directory.glob(".geoip-update-*"))
        self.assertEqual(len(stages), 1)
        first = next(iter(self.contents))
        self.assertEqual((stages[0] / (first + ".backup")).read_bytes(), before[first])


class CurlProcessTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.curl = self.root / "curl"

    def executable(self, program):
        self.curl.write_text(f"#!{sys.executable}\n" + program)
        self.curl.chmod(0o755)

    def recording_transport(self):
        self.requests = self.root / "requests.jsonl"
        self.executable('''import json, os, sys
from pathlib import Path
args = sys.argv[1:]
url = args[args.index('--url') + 1]
assert 'GEOIP_GITHUB_TOKEN' not in os.environ
values = [args[index + 1] for index, value in enumerate(args) if value == '--header']
authorization = [Path(value[1:]).read_text() for value in values if value.startswith('@')]
with open(os.environ['CURL_REQUESTS'], 'a') as output:
    output.write(json.dumps({'url': url, 'argv': args, 'authorization': authorization}) + '\\n')
location = os.environ.get('CURL_METADATA_REDIRECT')
if location and url.endswith('/releases/latest'):
    response = 'HTTP/2 302\\r\\nLocation: ' + location + '\\r\\n\\r\\n'
else:
    response = 'HTTP/2 200\\r\\n\\r\\n'
Path(args[args.index('--dump-header') + 1]).write_bytes(response.encode())
os.write(1, b'fixture')
''')
        return {"PATH": str(self.root) + os.pathsep + os.environ["PATH"],
                "CURL_REQUESTS": str(self.requests), "CURL_METADATA_REDIRECT": ""}

    def test_token_authenticates_only_exact_metadata_without_argv_or_environment_exposure(self):
        environment = self.recording_transport()
        token = "fixture_github_token"
        urls = (updater.LATEST_URL,
                "https://github.com/shedowe19/GeoLite.mmdb/releases/download/2026.10.07/GeoLite2-ASN.mmdb",
                "https://release-assets.githubusercontent.com/fixture.mmdb",
                "https://api.github.com/repos/shedowe19/GeoLite.mmdb/releases/123")
        with patch.dict(os.environ, {**environment, "GEOIP_GITHUB_TOKEN": token}):
            for url in urls:
                self.assertEqual(updater.curl_once(url, io.BytesIO(), 100, 2), (200, None))
        requests = [json.loads(line) for line in self.requests.read_text().splitlines()]
        self.assertEqual(requests[0]["authorization"], [f"Authorization: Bearer {token}\n"])
        self.assertEqual([request["authorization"] for request in requests[1:]], [[], [], []])
        for request in requests:
            self.assertNotIn(token, " ".join(request["argv"]))

    def test_metadata_redirect_to_same_api_host_does_not_forward_token(self):
        environment = self.recording_transport()
        redirected = "https://api.github.com/repos/shedowe19/GeoLite.mmdb/releases/123"
        with patch.dict(os.environ, {**environment, "GEOIP_GITHUB_TOKEN": "fixture_github_token",
                                    "CURL_METADATA_REDIRECT": redirected}):
            output = io.BytesIO()
            updater.download(updater.LATEST_URL, output, 100, time.monotonic() + 10)
        requests = [json.loads(line) for line in self.requests.read_text().splitlines()]
        self.assertEqual([request["url"] for request in requests], [updater.LATEST_URL, redirected])
        self.assertEqual(len(requests[0]["authorization"]), 1)
        self.assertEqual(requests[1]["authorization"], [])
        self.assertEqual(output.getvalue(), b"fixture")

    def test_public_metadata_request_still_works_without_token(self):
        environment = self.recording_transport()
        with patch.dict(os.environ, {**environment, "GEOIP_GITHUB_TOKEN": ""}):
            self.assertEqual(updater.curl_once(updater.LATEST_URL, io.BytesIO(), 100, 2), (200, None))
        request = json.loads(self.requests.read_text())
        self.assertEqual(request["authorization"], [])
        self.assertIn("Accept: application/json", request["argv"])

    def test_invalid_token_cannot_inject_headers_and_is_not_reported(self):
        for token in ("fixture\r\nInjected: value", "fixture token", "fixture\u00e9", "x" * 4097):
            with self.subTest(token_length=len(token)), patch.dict(os.environ, {"GEOIP_GITHUB_TOKEN": token}):
                with patch.object(updater.subprocess, "Popen") as spawn:
                    with self.assertRaises(updater.UpdateError) as error:
                        updater.curl_once(updater.LATEST_URL, io.BytesIO(), 100, 2)
                spawn.assert_not_called()
                self.assertNotIn(token, str(error.exception))

    def test_real_child_watchdog_terminates_silent_hanging_download(self):
        self.executable("import time\ntime.sleep(20)\n")
        started = time.monotonic()
        with patch.dict(os.environ, {"PATH": str(self.root) + os.pathsep + os.environ["PATH"]}):
            with self.assertRaises(updater.TransferError):
                updater.curl_once(updater.LATEST_URL, io.BytesIO(), 100, 0.15)
        self.assertLess(time.monotonic() - started, 2)

    def test_stream_byte_limit_terminates_child_and_trusted_request_has_no_automatic_redirects(self):
        self.executable("import os,sys\nassert sys.argv[1]=='-q'\nassert '--location' not in sys.argv\n"
                        "assert '=https' in sys.argv\nos.write(1,b'X'*200000)\n")
        output = io.BytesIO()
        with patch.dict(os.environ, {"PATH": str(self.root) + os.pathsep + os.environ["PATH"]}):
            with self.assertRaisesRegex(updater.UpdateError, "size limit"):
                updater.curl_once(updater.LATEST_URL, output, 100, 2)
        self.assertLessEqual(len(output.getvalue()), 100)

    def test_continuous_body_progress_does_not_extend_the_deadline(self):
        self.executable("import os,time\nwhile True:\n os.write(1,b'x')\n time.sleep(0.02)\n")
        started = time.monotonic()
        with patch.dict(os.environ, {"PATH": str(self.root) + os.pathsep + os.environ["PATH"]}):
            with self.assertRaises(updater.TransferError):
                updater.curl_once(updater.LATEST_URL, io.BytesIO(), 100000, 0.15)
        self.assertLess(time.monotonic() - started, 2)


if __name__ == "__main__":
    unittest.main()
