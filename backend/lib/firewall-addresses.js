import { isIP } from "node:net";
import ipaddr from "ipaddr.js";
import errs from "./error.js";

export const MAX_LIST_BYTES = 8 * 1024 * 1024;
export const MAX_LIST_LINES = 200000;

/** Normalize an IP or CIDR without expanding a network into its members. */
export const normalizeAddress = (value) => {
	if (typeof value !== "string") throw new errs.ValidationError("Firewall addresses must be strings");
	const parts = value.trim().split("/");
	const family = isIP(parts[0]);
	if (!family || parts[0].includes("%") || parts.length > 2) {
		throw new errs.ValidationError("Firewall addresses must be IPv4, IPv6, or CIDR networks");
	}
	const address = ipaddr.parse(parts[0]);
	const mapped = address instanceof ipaddr.IPv6 && address.isIPv4MappedAddress();
	if (parts.length === 1) return (mapped ? address.toIPv4Address() : address).toString();
	const maxPrefix = family === 4 ? 32 : 128;
	if (!/^(0|[1-9]\d*)$/.test(parts[1]) || Number(parts[1]) > maxPrefix) {
		throw new errs.ValidationError("Invalid firewall CIDR prefix");
	}
	const prefix = Number(parts[1]);
	// Nginx geo looks up mapped clients in its IPv4 tree, so equivalent rules must use that tree too.
	if (mapped) {
		if (prefix < 96)
			throw new errs.ValidationError("IPv4-mapped firewall networks require a prefix of at least 96");
		const ipv4 = address.toIPv4Address();
		const ipv4Prefix = prefix - 96;
		return ipv4Prefix === 32
			? ipv4.toString()
			: `${ipaddr.IPv4.networkAddressFromCIDR(`${ipv4}/${ipv4Prefix}`)}/${ipv4Prefix}`;
	}
	if (prefix === maxPrefix) return address.toString();
	const network =
		family === 4
			? ipaddr.IPv4.networkAddressFromCIDR(`${parts[0]}/${prefix}`)
			: ipaddr.IPv6.networkAddressFromCIDR(`${parts[0]}/${prefix}`);
	return `${network.toString()}/${prefix}`;
};

/** Parse one IP/CIDR per line; comments, blank lines, and duplicates are harmless. */
export const parseIpList = (content) => {
	if (typeof content !== "string") throw new errs.ValidationError("Firewall list content must be text");
	if (Buffer.byteLength(content, "utf8") > MAX_LIST_BYTES) {
		throw new errs.ValidationError("Firewall list exceeds the 8 MiB limit");
	}
	const lines = content.replace(/^\uFEFF/, "").split(/\r\n|\n|\r/);
	if (lines.at(-1) === "") lines.pop();
	if (lines.length > MAX_LIST_LINES) {
		throw new errs.ValidationError("Firewall list exceeds the 200000 line limit");
	}
	const entries = [];
	const seen = new Set();
	const invalid = [];
	let duplicates = 0;
	for (const [index, line] of lines.entries()) {
		const value = line.split("#", 1)[0].trim();
		if (!value) continue;
		try {
			const normalized = normalizeAddress(value);
			if (seen.has(normalized)) duplicates++;
			else {
				seen.add(normalized);
				entries.push(normalized);
			}
		} catch {
			invalid.push({ line: index + 1, value });
		}
	}
	return { entries, duplicates, invalid, totalLines: lines.length };
};
