import fs from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const readFile = (path) => fs.readFileSync(join(repoRoot, path), "utf8");

describe("Nextcloud AIO bootstrap security", () => {
	it("uses an explicit short-lived access token without legacy initial credentials", () => {
		const script = readFile("rootfs/usr/local/bin/aio.sh");

		expect(script).toContain("SHIELDPM_AIO_ACCESS_TOKEN");
		expect(script).toContain("--config -");
		expect(script).not.toContain("INITIAL_ADMIN_EMAIL");
		expect(script).not.toContain("INITIAL_ADMIN_PASSWORD");
		expect(script).not.toMatch(/\/tokens(?:\s|["'])/);
	});

	it("writes a private completion lock only after the host request succeeds", () => {
		const script = readFile("rootfs/usr/local/bin/aio.sh");
		const request = script.indexOf("if printf");
		const lock = script.indexOf("install -m 0600 /dev/null /data/aio.lock");

		expect(request).toBeGreaterThan(-1);
		expect(lock).toBeGreaterThan(request);
		expect(script).toContain("--fail-with-body");
	});

	it("documents the secret-file path and removes legacy compose credentials", () => {
		const compose = readFile("compose.yaml");

		expect(compose).toContain("SHIELDPM_AIO_ACCESS_TOKEN_FILE");
		expect(compose).not.toContain("INITIAL_ADMIN_EMAIL");
		expect(compose).not.toContain("INITIAL_ADMIN_PASSWORD");
	});

	it("keeps the official container definitions on the single internal proxy trust boundary", () => {
		for (const composeFile of ["compose.yaml", "compose.easy.yaml"]) {
			expect(readFile(composeFile)).toContain('"TRUST_PROXY=1"');
		}
		expect(readFile("docker-compose.demo.yaml")).toContain("TRUST_PROXY: '1'");
	});
});
