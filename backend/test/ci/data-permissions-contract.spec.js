import fs from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const startScript = fs.readFileSync(join(repoRoot, "rootfs/usr/local/bin/start.sh"), "utf8");

describe("persistent data permission contract", () => {
	it("keeps application state private across every container start", () => {
		expect(startScript).toMatch(/find \/data\/shieldpm -type d[^\n]*-perm 700[^\n]*chmod 700/);
		expect(startScript).toMatch(/find \/data\/shieldpm -type f[^\n]*-perm 600[^\n]*chmod 600/);
		expect(startScript).not.toMatch(/\/data\/shieldpm\s+\\\n\s+-not -perm 770/);
	});
});
