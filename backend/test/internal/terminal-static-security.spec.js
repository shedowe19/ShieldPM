import crypto from "node:crypto";
import fs from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { backendSourcePath } from "../helpers/source-path.js";

const repositoryRoot = resolve(backendSourcePath(), "..");

describe("terminal static delivery security", () => {
	it("pins every third-party terminal asset with SRI", () => {
		const html = fs.readFileSync(resolve(repositoryRoot, "rootfs/html/terminal/index.html"), "utf8");
		expect(html).not.toContain("xterm@5.3.0");
		expect(html.match(/integrity="sha384-[^"]+"/gu)).toHaveLength(4);
		expect(html.match(/crossorigin="anonymous"/gu)).toHaveLength(4);
	});

	it("keeps the CSP hashes synchronized with the inline style and script", () => {
		const html = fs.readFileSync(resolve(repositoryRoot, "rootfs/html/terminal/index.html"), "utf8");
		const template = fs.readFileSync(backendSourcePath("templates", "_proxy_logic.conf"), "utf8");
		const style = html.match(/<style>([\s\S]*?)<\/style>/u)?.[1];
		const script = html.match(/<script>([\s\S]*?)<\/script>/u)?.[1];
		const hash = (value) => crypto.createHash("sha256").update(value).digest("base64");

		expect(style).toEqual(expect.any(String));
		expect(script).toEqual(expect.any(String));
		expect(template).toContain(`'sha256-${hash(style)}'`);
		expect(template).toContain(`'sha256-${hash(script)}'`);
		expect(template).toContain("frame-ancestors 'none'");
	});

	it("does not bypass host authentication for the exact WebSocket endpoint", () => {
		const template = fs.readFileSync(backendSourcePath("templates", "_proxy_logic.conf"), "utf8");
		expect(template).toContain("location = /terminal-ticket");
		expect(template).toContain("location = /ws");
		expect(template).not.toContain("auth_basic off");
		expect(template).toContain("proxy_set_header Authorization $terminal_gateway_authorization;");
		expect(template).toContain('proxy_set_header Cookie "";');
		expect(template).toContain("X-ShieldPM-Terminal-Signature");
		expect(template).toContain("X-ShieldPM-Terminal-ACL-Revision");
	});
});
