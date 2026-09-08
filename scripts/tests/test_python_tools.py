"""Test generated graph escaping and CrowdSec CLI behavior with no network."""

import contextlib
import importlib.util
import io
import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

REPO = Path(__file__).resolve().parents[2]


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class PythonToolTests(unittest.TestCase):
    def setUp(self):
        # The CLI's optional requests dependency is replaced entirely: the suite
        # does not require installing it and cannot accidentally access a network.
        request_module = SimpleNamespace(
            get=Mock(side_effect=AssertionError("Unexpected HTTP request")),
            RequestException=type("RequestException", (Exception,), {}),
        )
        replacement = patch.dict(sys.modules, {"requests": request_module})
        replacement.start()
        self.addCleanup(replacement.stop)

    def test_graph_tooltips_escape_names_and_keep_graph_identifiers(self):
        graph = load_module("wiki_graph", REPO / "scripts/wiki-graph.py")
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            name = 'page<img onerror="alert(1)">.md'
            (root / name).write_text("# Example")
            nodes, edges = graph.build_graph(root)
        self.assertEqual(nodes[0]["id"], name)
        self.assertIn("&lt;img", nodes[0]["title"])
        self.assertNotIn("<img", nodes[0]["title"])
        self.assertEqual(edges, [])

    def test_graph_inline_data_cannot_end_script_and_round_trips_unicode(self):
        graph = load_module("wiki_graph", REPO / "scripts/wiki-graph.py")
        value = [{"id": '</script><img src=x onerror="alert(1)"> & ä.md'}]
        serialized = graph.script_json(value)
        self.assertEqual(json.loads(serialized), value)
        self.assertNotIn("<", serialized)
        self.assertNotIn(">", serialized)
        self.assertNotIn("&", serialized)

    def test_graph_generation_keeps_template_marker_filenames_literal(self):
        graph = load_module("wiki_graph", REPO / "scripts/wiki-graph.py")
        names = ["__NODES__.md", "__EDGES__.md", "__COLORS__.md", "__BUILD_TS__.md"]
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "index.md").write_text("\n".join(f"[Page](./{name})" for name in names))
            for name in names:
                (root / name).write_text("# Template marker example\n")
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(graph.main(["wiki-graph.py", directory]), 0)
            generated = (root / "wiki-graph.html").read_text()
        declarations = re.search(r"const NODES = (.*);\nconst EDGES = (.*);\nconst COLORS =", generated)
        self.assertIsNotNone(declarations)
        nodes, edges = map(json.loads, declarations.groups())
        self.assertEqual({node["id"] for node in nodes}, {"index.md", *names})
        self.assertEqual({edge["to"] for edge in edges}, set(names))

    def test_graph_javascript_preserves_special_groups_when_filtering(self):
        graph = load_module("wiki_graph", REPO / "scripts/wiki-graph.py")
        program = graph.HTML_TEMPLATE.split("const groupVisible = {};", 1)[1].split("\n\n", 1)[0]
        fixture = """
const groupVisible = {};
const COLORS = {_root: '#aaa', _other: '#bbb', module: '#ccc'};
const $ = () => ({appendChild() {}});
const document = {createElement() {return {style: {}, classList: {toggle() {}}, addEventListener() {}}}};
"""
        result = subprocess.run(["node", "-e", fixture + program + "\nconsole.log(JSON.stringify(groupVisible));"],
                                text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout), {"_root": True, "_other": True, "module": True})

    def test_crowdsec_import_does_not_make_requests(self):
        with patch("requests.get") as request:
            load_module("pentest_crowdsec", REPO / "pentest_crowdsec.py")
        request.assert_not_called()

    def test_crowdsec_cli_requires_explicit_valid_origin_and_bounded_rounds(self):
        probe = load_module("pentest_crowdsec", REPO / "pentest_crowdsec.py")
        invalid = [[], ["file:///tmp/x"], ["https://example.com/path"],
                   ["https://user:pass@example.com"], ["https://example.com:0"],
                   ["https://example.com:bad"], ["https://example.com", "--rounds", "51"],
                   ["https://example.com", "--rounds", "0"]]
        with patch.object(probe, "attack") as attack, contextlib.redirect_stderr(io.StringIO()):
            for args in invalid:
                with self.subTest(args=args), self.assertRaises(SystemExit) as error:
                    probe.main(args)
                self.assertEqual(error.exception.code, 2)
        attack.assert_not_called()

    def test_crowdsec_default_is_one_round_and_failure_is_reported(self):
        probe = load_module("pentest_crowdsec", REPO / "pentest_crowdsec.py")
        with patch.object(probe, "attack", return_value=False) as attack, contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(probe.main(["https://example.com"]), 1)
        attack.assert_called_once_with("https://example.com")

    def test_crowdsec_probe_stops_at_block_without_following_redirects(self):
        probe = load_module("pentest_crowdsec", REPO / "pentest_crowdsec.py")
        with patch.object(probe.requests, "get", return_value=Mock(status_code=403, text="Access forbidden")) as request:
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertTrue(probe.attack("https://example.com/", delay=0))
        request.assert_called_once_with("https://example.com/.env", headers=probe.HEADERS,
                                        timeout=5, verify=True, allow_redirects=False)


if __name__ == "__main__":
    unittest.main()
