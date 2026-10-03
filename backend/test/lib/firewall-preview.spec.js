import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
	compactFirewallForPreview,
	MAX_PREVIEW_RAW_CONFIG_BYTES,
	readFirewallPreviewConfig,
	summarizeFirewallPreviewConfig,
} from "../../lib/firewall-preview.js";

const marker = "# Host-specific IP firewall. All directives contain validated CIDRs or numeric rule identifiers.";
const id = 17;
const types = ["allow", "manual", "list"];
const digest = (rules) =>
	createHash("sha256")
		.update(rules.map((rule) => `${rule.address} ${rule.value};\n`).join(""))
		.digest("hex");
const rules = {
	allow: [{ address: "192.0.2.1/32", value: 1 }],
	manual: [{ address: "2001:db8:1::/48", value: 1 }],
	list: [
		{ address: "198.51.100.0/24", value: 2 },
		{ address: "2001:db8:2::/48", value: 3 },
	],
};
const tail = "map $uri $example {\n    default 0;\n}\nserver {\n    server_name protected.test;\n}\n";
const configuration = (entries = rules, suffix = tail) =>
	`${marker}\n${types
		.map(
			(type) =>
				`geo $spm_fw_${id}_${type} {\n    default 0;\n${entries[type]
					.map((rule) => `    ${rule.address} ${rule.value};\n`)
					.join("")}\n}\n`,
		)
		.join("")}${suffix}`;

/** Model a file handle with arbitrary byte boundaries, including UTF-8 sequences split across reads. */
const handleFor = (text, chunkSize = 61) => {
	const content = Buffer.from(text, "utf8");
	let cursor = 0;
	return {
		read: vi.fn(async (buffer, offset, length, position) => {
			const start = position === null || position === undefined ? cursor : position;
			const bytesRead = Math.min(length, chunkSize, content.length - start);
			content.copy(buffer, offset, start, start + bytesRead);
			cursor = start + bytesRead;
			return { bytesRead, buffer };
		}),
	};
};

describe("bounded firewall configuration preview presentation", () => {
	it("compacts all generated address tables without mutating runtime rules or reason records", () => {
		const firewall = {
			id,
			allow_rules: rules.allow,
			manual_rules: rules.manual,
			list_rules: rules.list,
			details: [{ id: 1, reason: "Private network policy", source: "Selected list", source_type: "list" }],
			country_rules: [{ code: "DE", value: 4 }],
			public_message: "Contact the operator",
		};
		const original = structuredClone(firewall);
		const result = compactFirewallForPreview(firewall);
		expect(firewall).toEqual(original);
		expect(result.firewall).toMatchObject({
			id,
			allow_rules: [],
			manual_rules: [],
			list_rules: [],
			details: original.details,
			country_rules: original.country_rules,
			public_message: original.public_message,
		});
		for (const type of types) {
			expect(result.summaries.get(type)).toEqual({ count: rules[type].length, sha256: digest(rules[type]) });
		}
	});

	it("removes CIDRs from all three generated tables while preserving their default and other directives", () => {
		const result = summarizeFirewallPreviewConfig(configuration(), id);
		expect(result.summarized).toBe(true);
		expect(result.config).toContain(tail);
		for (const type of types) {
			expect(result.config).toContain(`geo $spm_fw_${id}_${type} {`);
			expect(result.config).toContain(digest(rules[type]));
			for (const rule of rules[type]) expect(result.config).not.toContain(rule.address);
		}
		expect(result.config.match(/default 0;/g)).toHaveLength(4);
	});

	it("keeps hashes identical after CRLF and nginxbeautifier-only indentation changes", () => {
		const source = configuration();
		const beautified = source
			.split("\n")
			.map((line) => `\t  ${line}`)
			.join("\r\n");
		const left = summarizeFirewallPreviewConfig(source, id);
		const right = summarizeFirewallPreviewConfig(beautified, id);
		for (const type of types) {
			expect(left.config).toContain(digest(rules[type]));
			expect(right.config).toContain(digest(rules[type]));
		}
		expect(right.summarized).toBe(true);
	});

	it.each([
		{ changed: [{ address: "203.0.113.0/24", value: 2 }, rules.list[1]] },
		{ changed: [{ ...rules.list[0], value: 8 }, rules.list[1]] },
	])("changes the digest when an address or its numeric rule reference changes: %j", ({ changed }) => {
		const result = summarizeFirewallPreviewConfig(configuration({ ...rules, list: changed }), id);
		expect(result.config).toContain(digest(changed));
		expect(result.config).not.toContain(digest(rules.list));
	});

	it("summarizes empty tables using the SHA-256 digest of an empty directive stream", () => {
		const result = summarizeFirewallPreviewConfig(configuration({ allow: [], manual: [], list: [] }), id);
		expect(result.summarized).toBe(true);
		expect(result.config.match(new RegExp(digest([]), "g"))).toHaveLength(3);
		const compact = compactFirewallForPreview({ id, allow_rules: [], manual_rules: [], list_rules: [] });
		for (const type of types) expect(compact.summaries.get(type)).toEqual({ count: 0, sha256: digest([]) });
	});

	it("uses trusted precomputed summaries for compacted proposed tables", () => {
		const firewall = { id, allow_rules: rules.allow, manual_rules: rules.manual, list_rules: rules.list };
		const compact = compactFirewallForPreview(firewall);
		const text = configuration({ allow: [], manual: [], list: [] });
		const result = summarizeFirewallPreviewConfig(text, id, { summaries: compact.summaries });
		for (const type of types) expect(result.config).toContain(digest(rules[type]));
		expect(result.config).not.toContain(digest([]));
	});

	it("does not change non-firewall geo tables, custom configuration or Lua strings after the generated prefix", () => {
		const custom = `geo $custom_access {\n    default 0;\n    203.0.113.0/24 1;\n}\nserver {\n    content_by_lua_block {\n        local text = [[\n${configuration()}\n]]\n    }\n}\n`;
		const result = summarizeFirewallPreviewConfig(configuration(rules, custom), id);
		expect(result.config.endsWith(custom)).toBe(true);
		expect(summarizeFirewallPreviewConfig(custom, id)).toEqual({ config: custom, summarized: false });
	});

	it("ignores firewall-looking text without the generated-prefix marker", () => {
		const text = configuration().replace(`${marker}\n`, "# Custom geo configuration\n");
		expect(summarizeFirewallPreviewConfig(text, id)).toEqual({ config: text, summarized: false });
	});

	it.each([
		(text) => text.replace("198.51.100.0/24 2;", "include /private/other.conf;"),
		(text) => text.replace("198.51.100.0/24 2;", "198.51.100.0/24 $unexpected;"),
		(text) => text.replace("198.51.100.0/24 2;", "invalid-address 2;"),
		(text) => text.replace("198.51.100.0/24 2;", "198.51.100.0/24 2; return 200;"),
		(text) => text.replace("geo $spm_fw_17_list {", "geo $spm_fw_17_list {\n    nested {"),
		(text) => text.slice(0, text.indexOf("geo $spm_fw_17_list {") + 25),
	])("rejects unknown or incomplete generated body syntax without returning partial CIDRs", (malformed) => {
		expect(() => summarizeFirewallPreviewConfig(malformed(configuration()), id)).toThrow();
	});

	it("applies the output byte cap after summarization and counts UTF-8 bytes", () => {
		const list = Array.from({ length: 12000 }, (_, index) => ({
			address: `10.${index >> 8}.${index & 255}.0/24`,
			value: 2,
		}));
		const text = configuration({ ...rules, list });
		const result = summarizeFirewallPreviewConfig(text, id, { maxBytes: 2048 });
		expect(Buffer.byteLength(text, "utf8")).toBeGreaterThan(2048);
		expect(Buffer.byteLength(result.config, "utf8")).toBeLessThanOrEqual(2048);
		expect(result.config).toContain(digest(list));
		const unicode = "# äöü\n";
		expect(() => summarizeFirewallPreviewConfig(unicode, id, { maxBytes: unicode.length })).toThrow();
		expect(() =>
			summarizeFirewallPreviewConfig(`${text}${"# unchanged\n".repeat(1000)}`, id, { maxBytes: 2048 }),
		).toThrow();
	});

	it("streams an active table larger than 2 MiB into the same bounded count and digest", async () => {
		const list = Array.from({ length: 100000 }, (_, index) => ({
			address: `2001:db8:${(index >> 16).toString(16)}:${(index & 65535).toString(16)}::/64`,
			value: 2,
		}));
		const text = configuration({ ...rules, list }, `${tail}# Öffentliche Konfiguration\n`);
		expect(Buffer.byteLength(text, "utf8")).toBeGreaterThan(2 * 1024 * 1024);
		const handle = handleFor(text, 8191);
		const streamed = await readFirewallPreviewConfig(handle, id);
		const inline = summarizeFirewallPreviewConfig(text, id);
		expect(streamed).toEqual(inline);
		expect(Buffer.byteLength(streamed.config, "utf8")).toBeLessThan(2048);
		expect(streamed.config).toContain(digest(list));
		expect(streamed.config).toContain("# Öffentliche Konfiguration");
		expect(handle.read.mock.calls.length).toBeGreaterThan(1);
	}, 15000);

	it("preserves UTF-8 characters and final lines across one-byte active-file reads", async () => {
		const text = configuration(rules, `${tail}# äöü🔒`);
		expect(await readFirewallPreviewConfig(handleFor(text, 1), id)).toEqual(
			summarizeFirewallPreviewConfig(text, id),
		);
	});

	it("rejects streamed malformed tables and propagates file read failures", async () => {
		const malformed = configuration().replace("198.51.100.0/24 2;", "include /private/other.conf;");
		await expect(readFirewallPreviewConfig(handleFor(malformed, 5), id)).rejects.toThrow();
		const failure = new Error("Read failed");
		const handle = { read: vi.fn().mockRejectedValue(failure) };
		await expect(readFirewallPreviewConfig(handle, id)).rejects.toThrow();
		expect(handle.read).toHaveBeenCalledOnce();
	});

	it("stops a growing active file once unsummarized output exceeds the presentation limit", async () => {
		let supplied = 0;
		const handle = {
			read: vi.fn(async (buffer, offset, length) => {
				const bytesRead = Math.min(length, 65536);
				buffer.fill(35, offset, offset + bytesRead);
				buffer[offset + bytesRead - 1] = 10;
				supplied += bytesRead;
				return { bytesRead, buffer };
			}),
		};
		await expect(readFirewallPreviewConfig(handle, id)).rejects.toThrow();
		expect(supplied).toBeLessThanOrEqual(3 * 1024 * 1024);
	});

	it("also bounds a growing raw table whose comments contribute no presentation bytes", async () => {
		const prefix = Buffer.from(
			configuration({ allow: [], manual: [], list: [] }).split("geo $spm_fw_17_list {")[0],
		);
		const opening = Buffer.concat([prefix, Buffer.from("geo $spm_fw_17_list {\n    default 0;\n")]);
		let supplied = 0;
		let initial = true;
		const handle = {
			read: vi.fn(async (buffer, offset, length) => {
				let bytesRead;
				if (initial) {
					initial = false;
					bytesRead = opening.length;
					opening.copy(buffer, offset);
				} else {
					bytesRead = length;
					buffer.fill(35, offset, offset + bytesRead);
					buffer[offset + bytesRead - 1] = 10;
				}
				supplied += bytesRead;
				return { bytesRead, buffer };
			}),
		};
		await expect(readFirewallPreviewConfig(handle, id)).rejects.toThrow(/Active host configuration is too large/);
		expect(supplied).toBeGreaterThan(MAX_PREVIEW_RAW_CONFIG_BYTES);
		expect(supplied).toBeLessThanOrEqual(MAX_PREVIEW_RAW_CONFIG_BYTES + 65536);
	}, 15000);
});
