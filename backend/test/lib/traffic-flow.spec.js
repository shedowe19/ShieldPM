import { describe, expect, it } from "vitest";
import { clientPrefix, configuredTargets, FLOW_LIMIT, FlowBuffer, upstreamPeers } from "../../lib/traffic-flow.js";

const now = 1_800_000_000_000;
const host = {
	id: 1,
	domain_names: ["a.example", "b.example"],
	enabled: true,
	forward_scheme: "http",
	forward_host: "origin.example",
	forward_port: 80,
};
const row = (overrides = {}) => ({
	host: 1,
	client: "192.0.2.9",
	time: String(now / 1000),
	bytes: "123",
	upstream: "127.0.0.1:8000",
	cache: "MISS",
	...overrides,
});

describe("traffic flow completion sample", () => {
	it("masks IPv4, IPv6 and mapped IPv4 without retaining individual addresses", () => {
		expect(clientPrefix("192.0.2.129")).toBe("192.0.2.0/24");
		expect(clientPrefix("2001:db8:abcd:1234::1")).toBe("2001:db8:abcd::/48");
		expect(clientPrefix("::ffff:192.0.2.9")).toBe("192.0.2.0/24");
		expect(clientPrefix("spoofed.example")).toBeNull();
	});
	it("keeps completed bytes separate from unknown current rates and groups domain aliases once", () => {
		const buffer = new FlowBuffer();
		buffer.ingest(row(), now);
		buffer.ingest(row({ client: "192.0.2.88", bytes: "7" }), now);
		const result = buffer.snapshot([host], now);
		expect(result).toHaveLength(1);
		expect(result[0].clients).toHaveLength(1);
		expect(result[0].clients[0]).toMatchObject({
			label: "192.0.2.0/24",
			requests: 2,
			completed_bytes: 130,
			current_bytes_per_second: null,
		});
		expect(JSON.stringify(buffer.events)).not.toContain("192.0.2.88");
		expect(result[0].targets.map((target) => target.kind)).toEqual(["configured", "observed"]);
	});
	it("does not equate configured DNS with an observed peer or multiply client requests on retry", () => {
		const buffer = new FlowBuffer();
		buffer.ingest(row({ upstream: "127.0.0.1:8000, 127.0.0.1:8000, [::1]:8001 : 192.0.2.1:80" }), now);
		const result = buffer.snapshot([host], now)[0];
		expect(result.clients[0].requests).toBe(1);
		expect(result.targets.filter((target) => target.kind === "observed")).toHaveLength(3);
		expect(result.targets.every((target) => target.current_bytes_per_second === null)).toBe(true);
		expect(upstreamPeers("origin.example:80, unix:/run/test.sock, -")).toEqual([]);
	});
	it("does not invent upstream traffic for cached or unmatched completions", () => {
		const buffer = new FlowBuffer();
		buffer.ingest(row({ cache: "HIT" }), now);
		buffer.ingest(row({ upstream: "-" }), now);
		expect(buffer.snapshot([host], now)[0].targets.every((target) => target.kind !== "observed")).toBe(true);
	});
	it("drops invalid, old and future data and expires all client observations", () => {
		const buffer = new FlowBuffer();
		for (const overrides of [
			{ bytes: "-1" },
			{ bytes: "1.5" },
			{ client: "invalid" },
			{ host: 0 },
			{ time: String(now / 1000 - 61) },
			{ time: String(now / 1000 + 10) },
		])
			buffer.ingest(row(overrides), now);
		expect(buffer.events).toHaveLength(0);
		buffer.ingest(row(), now);
		expect(buffer.snapshot([host], now + 60_000)[0].clients).toEqual([]);
	});
	it("bounds memory, returned clients and peers, and filters unauthorized hosts before totals", () => {
		const buffer = new FlowBuffer();
		for (let index = 0; index < FLOW_LIMIT + 100; index++)
			buffer.ingest(row({ host: index % 2 ? 1 : 2, client: `10.${index % 255}.0.1` }), now);
		expect(buffer.events).toHaveLength(FLOW_LIMIT);
		const result = buffer.snapshot([host], now);
		expect(result).toHaveLength(1);
		expect(result[0].clients).toHaveLength(32);
		expect(result[0].truncated).toBe(true);
		buffer.clear();
		expect(buffer.events).toEqual([]);
	});
	it("distinguishes pool and custom routes and never exposes raw advanced config", () => {
		const targets = configuredTargets({
			...host,
			advanced_config: "proxy_pass secret;",
			meta: { upstream_pool: { enabled: true, targets: [{ id: "a", host: "192.0.2.1", port: 80 }] } },
			locations: [{ forward_scheme: "https", forward_host: "other.example", forward_port: 443 }],
		});
		expect(targets.map((target) => target.kind)).toEqual(["configured", "configured", "unknown"]);
		expect(JSON.stringify(targets)).not.toContain("secret");
	});
});
