import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { backendSourcePath } from "../helpers/source-path.js";

const launchScript = fs.readFileSync(backendSourcePath("..", "rootfs", "usr", "local", "bin", "launch.sh"), "utf8");

describe("container critical-process lifecycle", () => {
	it("keeps Nginx serving while restarting a crashed backend with backoff", () => {
		expect(launchScript).toContain("start_backend()");
		expect(launchScript).toContain("nginx_pid=$!");
		expect(launchScript).toContain("backend_pid=$!");
		expect(launchScript).toContain("restart_delay");
		expect(launchScript).toContain("restarting in ");
		expect(launchScript).toContain("s while Nginx keeps serving");
		expect(launchScript).toContain("Nginx exited with status $status; stopping container.");
		expect(launchScript).not.toContain("while true; do nginx -e stderr; sleep 1; done &");
	});

	it("does not keep an invalid Nginx configuration alive without service readiness", () => {
		expect(launchScript).toContain("Nginx configuration STILL fails. Exiting.");
		expect(launchScript).not.toContain("Nginx configuration STILL fails. Continuing anyway...");
	});
});
