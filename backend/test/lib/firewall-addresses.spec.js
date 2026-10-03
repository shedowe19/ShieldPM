import { describe, expect, it } from "vitest";
import { MAX_LIST_BYTES, MAX_LIST_LINES, normalizeAddress, parseIpList } from "../../lib/firewall-addresses.js";
import { normalizeListInput } from "../../lib/firewall-list-validation.js";

describe("firewall TXT imports", () => {
	it("normalizes mixed IP families, masks CIDRs, ignores comments, and deduplicates equivalent networks", () => {
		const result = parseIpList(
			"\uFEFF# Source\r\n192.0.2.19/24 # VPN\r\n192.0.2.0/24\r\n2001:0db8:0000::abcd/64\r\n2001:db8::/64\r\n203.0.113.9/32\r\n203.0.113.9\r\n\r\n",
		);
		expect(result).toEqual({
			entries: ["192.0.2.0/24", "2001:db8::/64", "203.0.113.9"],
			duplicates: 3,
			invalid: [],
			totalLines: 8,
		});
	});

	it("reports original line numbers and values without expanding or silently accepting malformed content", () => {
		const result = parseIpList(
			"1.2.3.4\n\n1.2.3.4/33\n2001:db8::/129\n10.1\n10.0.0.1; deny all\nhttps://example.com\n",
		);
		expect(result.entries).toEqual(["1.2.3.4"]);
		expect(result.invalid).toEqual([
			{ line: 3, value: "1.2.3.4/33" },
			{ line: 4, value: "2001:db8::/129" },
			{ line: 5, value: "10.1" },
			{ line: 6, value: "10.0.0.1; deny all" },
			{ line: 7, value: "https://example.com" },
		]);
	});

	it.each(["123", "010.0.0.1", "0x7f000001", "fe80::1%eth0", "1.2.3.4/-1", "1.2.3.4/01", "1.2.3.4/32/1", "all"])(
		"rejects non-canonical or directive-like input %s",
		(value) => expect(() => normalizeAddress(value)).toThrow(),
	);

	it("accepts default routes and full IPv6 prefixes without expanding them", () => {
		expect(normalizeAddress("192.0.2.1/0")).toBe("0.0.0.0/0");
		expect(normalizeAddress("2001:db8::1234/0")).toBe("::/0");
		expect(normalizeAddress("2001:0db8::abcd/128")).toBe("2001:db8::abcd");
	});
	it("matches Nginx's IPv4 tree for mapped IPv6 addresses and deduplicates their equivalent rules", () => {
		expect(parseIpList("::ffff:192.0.2.9\n192.0.2.9/32\n::ffff:192.0.2.19/120\n192.0.2.0/24")).toMatchObject({
			entries: ["192.0.2.9", "192.0.2.0/24"],
			duplicates: 2,
			invalid: [],
		});
		expect(normalizeAddress("::ffff:192.0.2.9/128")).toBe("192.0.2.9");
		expect(normalizeAddress("::ffff:192.0.2.9/96")).toBe("0.0.0.0/0");
		expect(() => normalizeAddress("::ffff:192.0.2.9/95")).toThrow(/prefix of at least 96/);
	});

	it("enforces physical-line and UTF-8 byte limits, including comment-only content", () => {
		expect(() => parseIpList("#\n".repeat(MAX_LIST_LINES))).not.toThrow();
		expect(() => parseIpList("#\n".repeat(MAX_LIST_LINES + 1))).toThrow(/line limit/);
		expect(() => parseIpList("é".repeat(MAX_LIST_BYTES / 2 + 1))).toThrow(/8 MiB/);
	});

	it("handles an empty list and a single trailing newline", () => {
		expect(parseIpList("")).toEqual({ entries: [], duplicates: 0, invalid: [], totalLines: 0 });
		expect(parseIpList("1.2.3.4\n").totalLines).toBe(1);
	});
});

describe("pure firewall backup validation", () => {
	it("canonicalizes cached subscription entries without contacting the source", () => {
		const result = normalizeListInput({
			name: "VPN",
			reason: "Restricted networks",
			source_type: "url",
			source_url: "https://example.com/ips.txt",
			entries: "192.0.2.11/24\n192.0.2.0/24",
		});
		expect(result.entries).toBe("192.0.2.0/24");
		expect(result.entry_count).toBe(1);
		expect(result.update_interval_hours).toBe(24);
	});

	it("rejects invalid imports and private source URLs even while disabled", () => {
		expect(() =>
			normalizeListInput({ name: "Draft", reason: "Reason", entries: "not-an-ip", enabled: false }),
		).toThrow(/Invalid firewall list entries/);
		expect(() =>
			normalizeListInput({
				name: "VPN",
				reason: "Reason",
				source_type: "url",
				source_url: "https://127.0.0.1/ips.txt",
			}),
		).toThrow(/public IP/);
		expect(() => normalizeListInput({ name: "VPN", reason: "Reason", update_interval_hours: 1 })).toThrow(
			/6 and 168/,
		);
	});
});
