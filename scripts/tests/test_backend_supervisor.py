import os
from pathlib import Path
import signal
import subprocess
import tempfile
import time
import unittest


REPO = Path(__file__).resolve().parents[2]
SUPERVISOR = REPO / "rootfs/usr/local/bin/shieldpm-backend.sh"


class BackendSupervisorTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.directory = Path(self.temporary.name)
        self.node = self.directory / "node"
        self.environment = {**os.environ, "PATH": f"{self.directory}:{os.environ['PATH']}"}

    def install_node(self, body):
        self.node.write_text("#!/bin/sh\n" + body)
        self.node.chmod(0o700)

    def test_only_database_transition_restarts(self):
        self.install_node('''
if [ ! -f count ]; then
    printf first > count
    exit 75
fi
printf second >> count
exit 0
''')
        result = subprocess.run(["sh", str(SUPERVISOR)], cwd=self.directory,
                                env=self.environment, capture_output=True, text=True, timeout=5)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((self.directory / "count").read_text(), "firstsecond")
        self.assertEqual(result.stdout.count("restarting backend"), 1)

    def test_unexpected_exit_reaches_critical_service_supervision(self):
        self.install_node('printf x >> count\nexit 7\n')
        result = subprocess.run(["sh", str(SUPERVISOR)], cwd=self.directory,
                                env=self.environment, capture_output=True, text=True, timeout=5)
        self.assertEqual(result.returncode, 7)
        self.assertEqual((self.directory / "count").read_text(), "x")
        self.assertNotIn("restarting backend", result.stdout)

    def test_shutdown_terminates_and_reaps_backend(self):
        self.install_node('''
trap 'printf stopped > stopped; exit 0' TERM
printf '%s' "$$" > child.pid
while true; do sleep 0.05; done
''')
        process = subprocess.Popen(["sh", str(SUPERVISOR)], cwd=self.directory,
                                   env=self.environment, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        self.addCleanup(lambda: process.kill() if process.poll() is None else None)
        deadline = time.monotonic() + 3
        while not (self.directory / "child.pid").exists():
            self.assertLess(time.monotonic(), deadline, "backend did not start")
            time.sleep(0.01)
        child = int((self.directory / "child.pid").read_text())
        process.send_signal(signal.SIGTERM)
        process.communicate(timeout=3)
        self.assertEqual(process.returncode, 0)
        self.assertEqual((self.directory / "stopped").read_text(), "stopped")
        with self.assertRaises(ProcessLookupError):
            os.kill(child, 0)


if __name__ == "__main__":
    unittest.main()
