import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { backendSourcePath } from "../helpers/source-path.js";

const launchScript = fs.readFileSync(backendSourcePath("..", "rootfs", "usr", "local", "bin", "launch.sh"), "utf8");

describe("container critical-process lifecycle", () => {
	it("fails the container when Nginx or the backend exits instead of retrying forever", () => {
		expect(launchScript).toContain("wait_for_critical_children()");
		expect(launchScript).toContain("nginx_pid=$!");
		expect(launchScript).toContain("backend_pid=$!");
		expect(launchScript).not.toContain("while true; do nginx -e stderr; sleep 1; done &");
	});

	it("does not keep an invalid Nginx configuration alive without service readiness", () => {
		expect(launchScript).toContain("Nginx configuration STILL fails. Exiting.");
		expect(launchScript).not.toContain("Nginx configuration STILL fails. Continuing anyway...");
	});
});
