import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("WireguardTunnels", () => {
	it("does not statically depend on the shared modal loader", () => {
		const pageSource = readFileSync(resolve(process.cwd(), "src/pages/Nginx/WireguardTunnels.tsx"), "utf8");

		expect(pageSource).not.toContain("modals/lazy");
	});
});
