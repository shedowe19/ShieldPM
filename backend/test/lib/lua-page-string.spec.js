import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";
import utils from "../../lib/utils.js";

const render = (value, filter = "luaPageString") =>
	utils.getRenderEngine().parseAndRender(`{{ value | ${filter} }}`, { value });

/**
 * Decode the generated Lua literals independently of the serialization filter.
 * Decimal escapes consume exactly three digits; concatenation adds no bytes.
 * @param {string} expression
 * @returns {string[]}
 */
const decodeLiterals = (expression) => {
	const literalPattern = /"(?:\\\d{3}|[^"\\])*"/gu;
	const tokens = expression.match(literalPattern) || [];
	expect(tokens.length).toBeGreaterThan(0);
	expect(expression.replace(literalPattern, "")).toMatch(/^(?:\s*\.\.\s*)*$/);
	return tokens.map((token) => {
		// ngx_http_lua must parse every token before Lua evaluates the concatenation.
		expect(Buffer.byteLength(token, "utf8")).toBeLessThanOrEqual(1002);
		// biome-ignore lint/suspicious/noControlCharactersInRegex: The Lua source must contain decimal escapes for these bytes.
		expect(token.slice(1, -1)).not.toMatch(/[\x00-\x1f\x7f]/);
		return token.slice(1, -1).replace(/\\(\d{3})/g, (_, digits) => {
			const value = Number(digits);
			expect(value).toBeLessThanOrEqual(255);
			return String.fromCharCode(value);
		});
	});
};

describe("Lua page serialization", () => {
	it("preserves the actual firewall HTML beyond the Nginx parser's single-token limit", async () => {
		const page = await fs.readFile(new URL("../../templates/ip-blocked.html", import.meta.url), "utf8");
		expect(Buffer.byteLength(page, "utf8")).toBeGreaterThan(8192);
		const expression = await render(page);
		const decoded = decodeLiterals(expression);
		expect(decoded.length).toBeGreaterThan(1);
		expect(decoded.join("")).toBe(page);
	});

	it("round-trips quotes, backslashes, every ASCII control byte and adjacent digits in a large page", async () => {
		const controls = Array.from({ length: 32 }, (_, index) => String.fromCharCode(index)).join("");
		const fragment = `"quoted" \\ path '${controls}\x7f123 😀 <section>Firewall</section>\n`;
		const page = fragment.repeat(200);
		expect(Buffer.byteLength(page, "utf8")).toBeGreaterThan(8192);
		expect(decodeLiterals(await render(page)).join("")).toBe(page);
	});

	it("keeps an astral character whole at the 250th Unicode code point", async () => {
		const page = `${"x".repeat(249)}😀\\\0"123${"🛡".repeat(2000)}`;
		const decoded = decodeLiterals(await render(page));
		expect(decoded[0]).toBe(`${"x".repeat(249)}😀`);
		expect(Array.from(decoded[0])).toHaveLength(250);
		expect(decoded[1].startsWith('\\\0"123')).toBe(true);
		expect(decoded.join("")).toBe(page);
	});

	it.each([
		["four-byte Unicode characters", "😀".repeat(3000)],
		["fully escaped characters", "\0".repeat(3000)],
	])("bounds every encoded token for %s", async (_, page) => {
		const expression = await render(page);
		const decoded = decodeLiterals(expression);
		expect(decoded).toHaveLength(12);
		expect(decoded.every((chunk) => Array.from(chunk).length === 250)).toBe(true);
		expect(decoded.join("")).toBe(page);
	});

	it.each(["", null, undefined])(
		"serializes an empty or absent page as a valid empty Lua literal: %s",
		async (page) => {
			const expression = await render(page);
			expect(expression).toBe('""');
			expect(decodeLiterals(expression).join("")).toBe("");
		},
	);

	it("retains the existing single-literal escaping for short luaString values", async () => {
		const value = 'a"\\\n\0' + "7 😀 'single quotes'";
		const expression = await render(value, "luaString");
		expect(expression).toBe(String.raw`"a\034\092\010\0007 😀 'single quotes'"`);
		expect(expression).not.toContain(" ..");
		expect(decodeLiterals(expression)).toEqual([value]);
		expect(await render("", "luaString")).toBe('""');
	});
});
