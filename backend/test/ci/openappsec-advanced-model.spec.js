import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = fs
	.readFileSync(fileURLToPath(new URL("../../../scripts/install.sh", import.meta.url)), "utf8")
	.replace(/\r\n?/g, "\n");

describe("OpenAppSec Advanced Model in the native installer", () => {
	it("stores the model at the documented path", () => {
		expect(source).toContain("/advanced-model/open-appsec-advanced-model.tgz");
		expect(source).not.toContain("/etc/cp/conf/open-appsec-advanced-model.tgz");
	});

	it("stops the agent, extracts the model and starts the agent again", () => {
		expect(source).toContain("open-appsec-ctl --stop-agent");
		expect(source).toContain("tar -xzf /advanced-model/open-appsec-advanced-model.tgz -C /etc/cp/conf/waap");
		expect(source).toContain("open-appsec-ctl --start-agent");
	});

	it("reports the active model", () => {
		expect(source).toContain("open-appsec-ctl --status");
	});
});
