import { createHash } from "node:crypto";
import { StringDecoder } from "node:string_decoder";
import errs from "./error.js";

export const MAX_PREVIEW_CONFIG_BYTES = 2 * 1024 * 1024;
// 32 lists may each contain 200,000 CIDRs. Bound the raw input separately from the compact presentation.
export const MAX_PREVIEW_RAW_CONFIG_BYTES = 512 * 1024 * 1024;

const marker = "# Host-specific IP firewall. All directives contain validated CIDRs or numeric rule identifiers.";
const kinds = ["allow", "manual", "list"];

const ruleDigest = (rules) => {
	const hash = createHash("sha256");
	for (const rule of rules) hash.update(`${rule.address} ${rule.value};\n`);
	return { count: rules.length, sha256: hash.digest("hex") };
};

/** Keep the compiled policy details but avoid rendering millions of CIDRs into a preview string. */
export const compactFirewallForPreview = (firewall) => {
	const summaries = new Map(kinds.map((kind) => [kind, ruleDigest(firewall[`${kind}_rules`])]));
	return {
		firewall: { ...firewall, allow_rules: [], manual_rules: [], list_rules: [] },
		summaries,
	};
};

/**
 * Only the generated prefix is summarized. Custom geo/Lua/config text after the first server remains intact.
 * Unknown syntax in a protected table fails closed instead of exposing its body.
 * @param {number} id
 * @param {{summaries?: Map<string, {count: number, sha256: string}>, maxBytes?: number}} [options]
 */
const createSummarizer = (id, { summaries, maxBytes = MAX_PREVIEW_CONFIG_BYTES } = {}) => {
	const output = [];
	let outputBytes = 0;
	let prefix = true;
	let protectedPrefix = false;
	let nextKind = 0;
	let table = null;
	const append = (line) => {
		outputBytes += Buffer.byteLength(line, "utf8") + 1;
		if (outputBytes > maxBytes) throw new errs.ValidationError("Host configuration is too large for a preview");
		output.push(line);
	};
	const malformed = () => {
		throw new errs.ConfigurationError("Unable to summarize the host firewall configuration for preview");
	};
	return {
		line: (line) => {
			const trimmed = line.trim();
			if (table) {
				if (!trimmed || trimmed.startsWith("#")) return;
				if (trimmed === "default 0;") {
					if (table.defaultSeen || table.count) malformed();
					table.defaultSeen = true;
					return;
				}
				if (trimmed === "}") {
					if (!table.defaultSeen) malformed();
					const digest = { count: table.count, sha256: table.hash.digest("hex") };
					const summary = summaries?.get(kinds[nextKind]) || digest;
					// Overrides only accompany the intentionally empty tables rendered from a compact draft.
					if (summaries && table.count) malformed();
					append("    default 0;");
					append(`    # Preview: ${summary.count} rules; SHA-256 ${summary.sha256}. CIDRs omitted.`);
					append(line);
					table = null;
					nextKind++;
					return;
				}
				const rule = /^([0-9a-fA-F:.]+(?:\/[0-9]{1,3})?)\s+([1-9][0-9]*)\s*;$/.exec(trimmed);
				if (!table.defaultSeen || !rule) malformed();
				table.hash.update(`${rule[1]} ${rule[2]};\n`);
				table.count++;
				return;
			}
			if (prefix && !protectedPrefix && trimmed === marker) protectedPrefix = true;
			else if (prefix && protectedPrefix && nextKind < kinds.length && trimmed && !trimmed.startsWith("#")) {
				if (trimmed !== `geo $spm_fw_${id}_${kinds[nextKind]} {`) malformed();
				table = { hash: createHash("sha256"), count: 0, defaultSeen: false };
			}
			if (/^server\s*\{/.test(trimmed)) prefix = false;
			append(line);
		},
		finish: () => {
			if (table || (protectedPrefix && nextKind !== kinds.length)) malformed();
			return { config: output.join("\n"), summarized: protectedPrefix };
		},
	};
};

/** Summarize a bounded rendered draft; runtime configurations never use this transformation.
 * @param {string} text
 * @param {number} id
 * @param {{summaries?: Map<string, {count: number, sha256: string}>, maxBytes?: number}} [options]
 */
export const summarizeFirewallPreviewConfig = (text, id, options = {}) => {
	const scanner = createSummarizer(id, options);
	for (const line of text.split(/\r?\n/)) scanner.line(line);
	return scanner.finish();
};

/** Read an already authorized, no-follow file handle in bounded chunks instead of buffering its CIDRs. */
export const readFirewallPreviewConfig = async (handle, id) => {
	const scanner = createSummarizer(id);
	const buffer = Buffer.alloc(64 * 1024);
	const decoder = new StringDecoder("utf8");
	let bytes = 0;
	let pending = "";
	const consume = (chunk) => {
		pending += chunk;
		let start = 0;
		let end = pending.indexOf("\n");
		while (end !== -1) {
			scanner.line(pending.slice(start, end).replace(/\r$/, ""));
			start = end + 1;
			end = pending.indexOf("\n", start);
		}
		pending = pending.slice(start);
		// Generated CIDR rows are short. A single oversized custom line must also respect the presentation cap.
		if (Buffer.byteLength(pending, "utf8") > MAX_PREVIEW_CONFIG_BYTES) {
			throw new errs.ValidationError("Host configuration is too large for a preview");
		}
	};
	while (true) {
		const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
		if (!bytesRead) break;
		bytes += bytesRead;
		if (bytes > MAX_PREVIEW_RAW_CONFIG_BYTES) {
			throw new errs.ValidationError("Active host configuration is too large for a preview");
		}
		consume(decoder.write(buffer.subarray(0, bytesRead)));
	}
	consume(decoder.end());
	scanner.line(pending.replace(/\r$/, ""));
	return scanner.finish();
};
