import { createHash } from "node:crypto";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";

export const FLOW_WINDOW_MS = 60_000;
export const FLOW_LIMIT = 1000;
export const FLOW_PORT = 15149;
export const flowEnabled = () => process.env.TRAFFIC_FLOW_ENABLED === "true";
const key = (value) => createHash("sha256").update(value).digest("hex").slice(0, 20);

/** Keep network prefixes only; an address is never treated as a person or device. */
export function clientPrefix(value) {
	if (typeof value !== "string" || value.length > 45 || !isIP(value)) return null;
	let address = ipaddr.parse(value);
	if (address instanceof ipaddr.IPv6 && address.isIPv4MappedAddress()) address = address.toIPv4Address();
	const bytes = address.toByteArray();
	const keep = bytes.length === 4 ? 3 : 6;
	return `${ipaddr.fromByteArray(bytes.map((byte, index) => (index < keep ? byte : 0))).toString()}/${keep * 8}`;
}

/** Only concrete TCP peer addresses are observations, never DNS names or arbitrary log text. */
export function upstreamPeers(value) {
	if (typeof value !== "string" || value.length > 2048) return [];
	return value
		.split(/\s*,\s*|\s+:\s+/)
		.slice(0, 16)
		.filter((peer) => {
			const match = /^(?:\[([^\]]+)\]|([^:]+)):(\d{1,5})$/.exec(peer);
			return match && isIP(match[1] || match[2]) && Number(match[3]) > 0 && Number(match[3]) <= 65535;
		});
}

/** A bounded, ephemeral completion sample. No current throughput is inferred from it. */
export class FlowBuffer {
	constructor() {
		this.events = [];
	}

	prune(now) {
		this.events = this.events.filter((event) => event.time > now - FLOW_WINDOW_MS && event.time <= now);
	}

	clear() {
		this.events = [];
	}

	ingest(row, now = Date.now()) {
		this.prune(now);
		if (!row || typeof row !== "object" || !Number.isSafeInteger(row.host) || row.host < 1) return;
		const prefix = clientPrefix(row.client);
		const time = Number(row.time) * 1000;
		const bytes = Number(row.bytes);
		if (!prefix || !Number.isFinite(time) || time <= now - FLOW_WINDOW_MS || time > now + 1000) return;
		if (!Number.isSafeInteger(bytes) || bytes < 0) return;
		this.events.push({
			host: row.host,
			client: prefix,
			time: Math.min(time, now),
			bytes,
			// HIT/UPDATING can serve locally; never invent an upstream for them.
			peers: ["HIT", "UPDATING"].includes(row.cache) ? [] : upstreamPeers(row.upstream),
		});
		if (this.events.length > FLOW_LIMIT) this.events.shift();
	}

	/** Select authorized host IDs before deriving any counters or state. */
	snapshot(hosts, now = Date.now()) {
		this.prune(now);
		return hosts.map((host) => {
			const events = this.events.filter((event) => event.host === host.id);
			const clients = new Map();
			const peers = new Map();
			for (const event of events) {
				const client = clients.get(event.client) || {
					id: `client:${host.id}:${key(event.client)}`,
					label: event.client,
					requests: 0,
					completed_bytes: 0,
					last_seen: "",
					current_bytes_per_second: null,
				};
				client.requests++;
				client.completed_bytes = Math.min(Number.MAX_SAFE_INTEGER, client.completed_bytes + event.bytes);
				client.last_seen = new Date(Math.max(Date.parse(client.last_seen) || 0, event.time)).toISOString();
				clients.set(event.client, client);
				// Each request counted once per concrete peer, even if it retries that peer.
				for (const peer of new Set(event.peers)) {
					const target = peers.get(peer) || {
						id: `observed:${host.id}:${key(peer)}`,
						label: peer,
						kind: "observed",
						requests: 0,
						last_seen: "",
						current_bytes_per_second: null,
					};
					target.requests++;
					target.last_seen = new Date(Math.max(Date.parse(target.last_seen) || 0, event.time)).toISOString();
					peers.set(peer, target);
				}
			}
			return {
				id: host.id,
				domains: (host.domain_names || []).slice(0, 20).map((domain) => String(domain).slice(0, 253)),
				enabled: Boolean(host.enabled),
				targets: [...configuredTargets(host), ...Array.from(peers.values()).slice(0, 32)],
				clients: Array.from(clients.values())
					.sort((a, b) => a.id.localeCompare(b.id))
					.slice(0, 32),
				truncated: clients.size > 32 || peers.size > 32,
			};
		});
	}
}

/** Configured endpoints do not prove DNS resolution, route selection, or a live connection. */
export function configuredTargets(host) {
	const targets = [];
	const add = (id, address, port) => {
		if (typeof address !== "string" || !address || address.length > 253 || /[\s/@$]/.test(address)) return;
		targets.push({
			id: `configured:${host.id}:${id}`,
			label: `${address.includes(":") ? `[${address}]` : address}:${port}`,
			kind: "configured",
			requests: null,
			last_seen: null,
			current_bytes_per_second: null,
		});
	};
	if (["http", "https"].includes(host.forward_scheme)) {
		if (host.meta?.upstream_pool?.enabled) {
			for (const target of (host.meta.upstream_pool.targets || []).slice(0, 16))
				add(`pool:${target.id}`, target.host, target.port);
		} else add("default", host.forward_host, host.forward_port);
		for (const [index, location] of (host.locations || []).slice(0, 16).entries()) {
			if (["http", "https"].includes(location.forward_scheme))
				add(`location:${index}`, location.forward_host, location.forward_port);
		}
	}
	if (!targets.length || host.advanced_config?.trim() || host.anubis_enabled) {
		targets.push({
			id: `unknown:${host.id}`,
			label: "Unknown route",
			kind: "unknown",
			requests: null,
			last_seen: null,
			current_bytes_per_second: null,
		});
	}
	return targets;
}
