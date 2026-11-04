import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

const source = fs
	.readFileSync(fileURLToPath(new URL("../../../scripts/install.sh", import.meta.url)), "utf8")
	.replace(/\r\n?/g, "\n");
const block = source.match(/cat > "\$APPSEC_CONF_DIR\/local_policy\.yaml" << 'APPSEC_EOF'\n([\s\S]*?)\nAPPSEC_EOF/);
const policy = block ? load(block[1]) : null;
const MODES = ["prevent-learn", "detect-learn", "prevent", "detect", "inactive"];

describe("OpenAppSec local policy in the native installer", () => {
	it("is embedded as a YAML heredoc", () => {
		expect(block).not.toBeNull();
		expect(policy).toBeTypeOf("object");
	});

	it("uses a supported policy mode", () => {
		expect(MODES).toContain(policy.policies.default.mode);
	});

	it("references named practice resources that exist", () => {
		const references = policy.policies.default.practices;
		const names = policy.practices.map((practice) => practice.name);
		expect(Array.isArray(references)).toBe(true);
		expect(references.length).toBeGreaterThan(0);
		for (const reference of references) expect(names).toContain(reference);
	});

	it("references named log-trigger resources that exist", () => {
		const references = policy.policies.default.triggers;
		const names = policy["log-triggers"].map((trigger) => trigger.name);
		expect(Array.isArray(references)).toBe(true);
		expect(references.length).toBeGreaterThan(0);
		for (const reference of references) expect(names).toContain(reference);
	});

	it("keeps practice and trigger bodies out of the policy block", () => {
		for (const entry of [...policy.policies.default.practices, ...policy.policies.default.triggers]) {
			expect(typeof entry).toBe("string");
		}
		expect(policy.practices[0]["web-attacks"]).toBeTypeOf("object");
		expect(policy["log-triggers"][0]["log-destination"]).toBeTypeOf("object");
	});

	it("applies the policy after writing it", () => {
		expect(source).toContain("open-appsec-ctl --apply-policy");
	});
});
