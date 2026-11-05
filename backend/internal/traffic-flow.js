import { createHash } from "node:crypto";
import dgram from "node:dgram";
import { FLOW_PORT, FLOW_WINDOW_MS, FlowBuffer, flowEnabled } from "../lib/traffic-flow.js";
import { LiveFlowBuffer, liveFlowEnabled } from "../lib/traffic-flow-live.js";
import ProxyHost from "../models/proxy_host.js";

const buffer = new FlowBuffer();
const liveBuffer = new LiveFlowBuffer();
let socket;
let state = "disabled";
let sweepTimer;
let budgetSecond = 0;
let acceptedThisSecond = 0;

const service = {
	/** Start one best-effort loopback receiver. Failure never prevents proxy startup. */
	start() {
		if (!flowEnabled() || socket) return;
		state = "waiting";
		sweepTimer = setInterval(() => {
			buffer.prune(Date.now());
			liveBuffer.prune(Date.now());
		}, 5000);
		sweepTimer.unref();
		socket = dgram.createSocket("udp4");
		socket.on("error", () => {
			state = "error";
			buffer.clear();
			liveBuffer.clear();
		});
		socket.on("message", (message, remote) => {
			if (remote.address !== "127.0.0.1" || message.length > 8192 || state === "error") return;
			const now = Date.now();
			const second = Math.floor(now / 1000);
			if (second !== budgetSecond) {
				budgetSecond = second;
				acceptedThisSecond = 0;
			}
			if (++acceptedThisSecond > 2000) return;
			try {
				const payload = message.toString("utf8");
				if (payload.startsWith("{") && liveFlowEnabled()) {
					liveBuffer.ingest(JSON.parse(payload), now);
					return;
				}
				const marker = payload.indexOf("shieldpm_flow: ");
				if (marker < 0) return;
				buffer.ingest(JSON.parse(payload.slice(marker + "shieldpm_flow: ".length)), now);
			} catch {
				// Malformed telemetry is discarded without affecting proxy requests.
			}
		});
		socket.bind(FLOW_PORT, "127.0.0.1");
		socket.unref();
	},

	/** Clear private observations during shutdown; they never persist across restarts. */
	stop() {
		clearInterval(sweepTimer);
		sweepTimer = null;
		const previous = socket;
		socket = null;
		state = "disabled";
		buffer.clear();
		liveBuffer.clear();
		try {
			previous?.close();
		} catch {
			// A failed bind can already have closed the socket.
		}
	},

	/**
	 * Revalidate current analytics and host visibility before reading the shared sample.
	 * @param {import("../lib/types.js").Access} access
	 * @returns {Promise<object>}
	 */
	async get(access) {
		await access.can("analytics:list");
		const permission = await access.can("proxy_hosts:list");
		const enabled = flowEnabled();
		const query = ProxyHost.query()
			.where("is_deleted", 0)
			.select(
				"id",
				"enabled",
				"forward_scheme",
				"forward_host",
				"forward_port",
				"locations",
				"meta",
				"advanced_config",
				"anubis_enabled",
			)
			.withGraphFetched("host_domains")
			.orderBy("id", "asc")
			.limit(101);
		if (permission.permission_visibility !== "all") query.andWhere("owner_user_id", access.token.getUserId(0));
		const rows = enabled ? await query : [];
		const now = Date.now();
		const hosts = buffer.snapshot(rows.slice(0, 100), now);
		const native = liveFlowEnabled() && liveBuffer.apply(hosts, now);
		const lastSeen =
			hosts
				.flatMap((host) => host.clients.map((client) => client.last_seen))
				.sort()
				.at(-1) || null;
		return {
			enabled,
			generated_at: new Date(now).toISOString(),
			window: { start: new Date(now - FLOW_WINDOW_MS).toISOString(), end: new Date(now).toISOString() },
			capabilities: {
				current_rates: native,
				source: native ? "native_http_transport" : "completed_requests",
				byte_semantics:
					"Per-edge byte accounting is explicit; no wire packet totals or TCP acknowledgement inference",
			},
			configuration_revision: createHash("sha256")
				.update(
					JSON.stringify(
						hosts.map(({ id, domains, enabled: active, targets }) => ({
							id,
							domains,
							active,
							targets: targets.filter((target) => target.kind !== "observed"),
						})),
					),
				)
				.digest("hex")
				.slice(0, 20),
			hosts,
			truncated: rows.length > 100 || hosts.some((host) => host.truncated),
			// UDP and bounded samples cannot prove completeness, even when no local truncation is visible.
			sample_complete: false,
			collector: {
				state: enabled ? (state === "error" ? "error" : lastSeen ? "receiving" : "waiting") : "disabled",
				last_observed_at: lastSeen,
			},
			poll_interval_ms: native ? 1000 : 5000,
		};
	},
};
export default service;
