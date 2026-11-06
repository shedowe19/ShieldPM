import { createHash } from "node:crypto";
import { clientPrefix, upstreamPeers } from "./traffic-flow.js";

export const LIVE_FLOW_LIMIT = 1000;
export const LIVE_FLOW_STALE_MS = 3500;
export const liveFlowEnabled = () => process.env.TRAFFIC_FLOW_LIVE_ENABLED === "true";
const RETENTION_MS = 60_000;
const hash = (value) => createHash("sha256").update(value).digest("hex").slice(0, 20);
const counter = (value) => Number.isSafeInteger(value) && value >= 0;

/** HTTP bytes accepted by Nginx transport; never packets, TCP acknowledgements or completion-log rates. */
export class LiveFlowBuffer {
	constructor() {
		this.requests = new Map();
	}

	clear() {
		this.requests.clear();
	}

	prune(now) {
		for (const [id, record] of this.requests) {
			if (record.receivedAt <= now - RETENTION_MS) this.requests.delete(id);
		}
	}

	/** Keep prefixes only and validate bounded native fields before retaining them. */
	ingest(row, now = Date.now()) {
		if (row?.schema !== 1 || row.type !== "live_sample" || !Number.isSafeInteger(row.host) || row.host < 1) return;
		const client = clientPrefix(row.client);
		if (
			!client ||
			!counter(row.time_ms) ||
			Math.abs(row.time_ms - now) > LIVE_FLOW_STALE_MS ||
			!counter(row.monotonic_ms)
		)
			return;
		if (![row.generation, row.request_id].every((id) => typeof id === "string" && /^[\w:.-]{1,100}$/.test(id)))
			return;
		if (typeof row.supported !== "boolean" || !Array.isArray(row.attempts) || row.attempts.length > 16) return;
		const http3 = row.protocol === "HTTP/3.0";
		const h3Quality =
			row.client_sent_semantics === "quic_stream_unique_acked" &&
			row.client_received_semantics === "quic_stream_consumed";
		const supported =
			row.supported &&
			(http3
				? h3Quality && !(row.final === true && row.final_complete !== true)
				: ["HTTP/1.0", "HTTP/1.1", "HTTP/2.0"].includes(row.protocol));
		if (supported && ![row.client_sent, row.client_received].every(counter)) return;
		const id = `${row.generation}/${row.request_id}`;
		const previous = this.requests.get(id);
		if (previous && (row.monotonic_ms <= previous.monotonic || row.time_ms <= previous.time)) return;
		const record = {
			host: row.host,
			client,
			time: row.time_ms,
			monotonic: row.monotonic_ms,
			receivedAt: now,
			values: [row.client_sent, row.client_received],
			supported,
			unknownReason:
				http3 && row.final === true && row.final_complete !== true
					? "incomplete_final_acknowledgement"
					: http3 && !h3Quality
						? "unverified_byte_accounting"
						: null,
			final: row.final === true,
			truncated: row.truncated === true,
			clientRate: null,
			attempts: new Map(),
		};
		record.semantics = http3
			? ["quic_stream_consumed", "quic_stream_unique_acked"]
			: row.protocol === "HTTP/2.0"
				? ["http_request_consumed", "http2_stream_frames_sent"]
				: row.upgraded === true
					? ["upgrade_frames_received", "upgrade_frames_sent"]
					: ["http_request_received", "http_transport_accepted"];
		const comparable = previous?.host === row.host && previous.client === client && supported && previous.supported;
		if (comparable && previous.semantics.join() === record.semantics.join())
			record.clientRate = this.measure(previous, record, previous.clientRate, false);
		for (const attempt of row.attempts) {
			if (!attempt || typeof attempt !== "object") return;
			const peer = upstreamPeers(attempt.peer)[0];
			if (!peer || !Number.isSafeInteger(attempt.id) || attempt.id < 0 || record.attempts.has(attempt.id)) return;
			if (supported && ![attempt.sent, attempt.received].every(counter)) return;
			const current = {
				peer,
				values: [attempt.sent, attempt.received],
				time: record.time,
				monotonic: record.monotonic,
				final: attempt.final === true,
				semantics: ["upstream_transport_sent", "upstream_transport_received"],
				rate: null,
			};
			const old = previous?.attempts.get(attempt.id);
			if (comparable && old?.peer === peer) current.rate = this.measure(old, current, old.rate, true);
			record.attempts.set(attempt.id, current);
		}
		this.requests.delete(id);
		this.requests.set(id, record);
		while (this.requests.size > LIVE_FLOW_LIMIT) this.requests.delete(this.requests.keys().next().value);
	}

	measure(previous, current, oldRate, upstream) {
		const elapsed = current.monotonic - previous.monotonic;
		if (elapsed <= 0 || elapsed > LIVE_FLOW_STALE_MS) return null;
		const sent = current.values[0] - previous.values[0];
		const received = current.values[1] - previous.values[1];
		if (sent < 0 || received < 0) return null;
		const download = ((upstream ? received : sent) * 1000) / elapsed;
		const upload = ((upstream ? sent : received) * 1000) / elapsed;
		const exact = upload + download;
		return {
			upload_bytes_per_second: upload,
			download_bytes_per_second: download,
			bytes_per_second: exact,
			smoothed_bytes_per_second: oldRate ? oldRate.smoothed_bytes_per_second * 0.65 + exact * 0.35 : exact,
			upload_semantics: current.semantics[0],
			download_semantics: current.semantics[1],
			start: previous.time,
			end: current.time,
		};
	}

	/** Authorize host IDs before deriving source freshness, groups or rates. */
	apply(hosts, now = Date.now()) {
		this.prune(now);
		let observed = false;
		for (const host of hosts) {
			const retained = [...this.requests.values()].filter((entry) => entry.host === host.id);
			host.native_status = !retained.length
				? "native_not_received"
				: retained.every((entry) => now - entry.receivedAt >= LIVE_FLOW_STALE_MS)
					? "stale"
					: retained.every((entry) => !entry.supported)
						? "unsupported"
						: retained.every((entry) => entry.final)
							? "completed"
							: "waiting_baseline";
			host.native_last_observed_at = retained.length
				? new Date(Math.max(...retained.map((entry) => entry.receivedAt))).toISOString()
				: null;
			const records = retained.filter(
				(entry) =>
					entry.host === host.id &&
					now - entry.time < LIVE_FLOW_STALE_MS &&
					now - entry.receivedAt < LIVE_FLOW_STALE_MS &&
					(!entry.final || now - entry.receivedAt <= 1000),
			);
			if (!records.length) {
				for (const entry of [...host.clients, ...host.targets.filter((entry) => entry.kind === "observed")]) {
					const matching = retained.filter(
						(record) =>
							record.client === entry.label ||
							[...record.attempts.values()].some((attempt) => attempt.peer === entry.label),
					);
					entry.unknown_reason = matching.length
						? matching.every((record) => record.final)
							? "completed"
							: "stale"
						: "native_not_received";
				}
				continue;
			}
			observed ||= records.some((record) => record.supported);
			const clients = new Map(host.clients.map((entry) => [entry.label, entry]));
			const targets = new Map(
				host.targets.filter((entry) => entry.kind === "observed").map((entry) => [entry.label, entry]),
			);
			for (const record of records) {
				if (!clients.has(record.client))
					clients.set(record.client, this.entry(host.id, record.client, "client"));
				for (const attempt of record.attempts.values()) {
					if (!targets.has(attempt.peer))
						targets.set(attempt.peer, this.entry(host.id, attempt.peer, "observed"));
				}
			}
			for (const entry of clients.values())
				this.aggregate(
					entry,
					records
						.filter((record) => record.client === entry.label)
						.map((record) => ({ ...record, rate: record.clientRate })),
				);
			for (const entry of targets.values()) {
				this.aggregate(
					entry,
					records.flatMap((record) =>
						[...record.attempts.values()]
							.filter((attempt) => attempt.peer === entry.label)
							.map((attempt) => ({
								...attempt,
								supported: record.supported,
								unknownReason: record.unknownReason,
								truncated: record.truncated,
							})),
					),
				);
				if (records.some((record) => record.truncated)) {
					entry.rate_incomplete = true;
					entry.unknown_reason = "truncated";
					entry.current_bytes_per_second = null;
					delete entry.rate;
				}
			}
			const total = { current_bytes_per_second: null };
			this.aggregate(
				total,
				records.map((record) => ({ ...record, rate: record.clientRate })),
			);
			host.client_rate = total.rate || null;
			host.client_rate_incomplete = total.rate_incomplete;
			host.client_mixed_semantics = total.mixed_semantics;
			host.clients = [...clients.values()].sort((a, b) => a.id.localeCompare(b.id)).slice(0, 32);
			host.targets = [
				...host.targets.filter((entry) => entry.kind !== "observed"),
				...[...targets.values()].slice(0, 32),
			];
			host.truncated ||= clients.size > 32 || targets.size > 32 || records.some((record) => record.truncated);
		}
		return observed;
	}

	entry(host, label, kind) {
		return {
			id: `${kind}:${host}:${hash(label)}`,
			label,
			...(kind === "observed" ? { kind } : { completed_bytes: 0 }),
			requests: 0,
			last_seen: null,
			current_bytes_per_second: null,
		};
	}

	aggregate(entry, records) {
		if (!records.length) return;
		const rates = records.map((record) => record.rate);
		entry.active_requests = records.filter((record) => !record.final).length;
		entry.last_seen = new Date(Math.max(...records.map((record) => record.time))).toISOString();
		entry.unknown_reason =
			records.find((record) => record.unknownReason)?.unknownReason ||
			(records.some((record) => record.truncated)
				? "truncated"
				: records.some((record) => record.supported === false)
					? "unsupported"
					: records.every((record) => record.final)
						? "completed"
						: rates.some((rate) => !rate)
							? "waiting_baseline"
							: null);
		entry.rate_incomplete = rates.some((rate) => rate === null) || records.some((record) => record.truncated);
		if (entry.rate_incomplete) {
			const measured = records.filter((record) => record.rate && !record.truncated && record.supported !== false);
			if (measured.length) {
				const partial = {};
				this.aggregate(partial, measured);
				entry.measured_rate = partial.rate || null;
				entry.rate_components =
					partial.rate_components ||
					(partial.rate
						? [{ id: "measured_subset", active_requests: partial.active_requests, ...partial.rate }]
						: []);
			}
			return;
		}
		const upload = [...new Set(rates.map((rate) => rate.upload_semantics))].sort();
		const download = [...new Set(rates.map((rate) => rate.download_semantics))].sort();
		entry.mixed_semantics = upload.length > 1 || download.length > 1;
		entry.upload_semantics = upload;
		entry.download_semantics = download;
		if (entry.mixed_semantics) {
			entry.unknown_reason = "mixed_semantics";
			entry.rate_incomplete = true;
			const components = new Map();
			for (const record of records) {
				const id = `${record.rate.upload_semantics}:${record.rate.download_semantics}`;
				if (!components.has(id)) components.set(id, []);
				components.get(id).push(record);
			}
			entry.rate_components = [...components.entries()]
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([id, samples]) => {
					const component = {};
					this.aggregate(component, samples);
					return { id, active_requests: component.active_requests, ...component.rate };
				});
			return;
		}
		const sum = (name) => rates.reduce((total, rate) => total + rate[name], 0);
		entry.rate = {
			upload_semantics: upload,
			download_semantics: download,
			upload_bytes_per_second: sum("upload_bytes_per_second"),
			download_bytes_per_second: sum("download_bytes_per_second"),
			bytes_per_second: sum("bytes_per_second"),
			smoothed_bytes_per_second: sum("smoothed_bytes_per_second"),
			window_start: new Date(Math.min(...rates.map((rate) => rate.start))).toISOString(),
			window_end: new Date(Math.max(...rates.map((rate) => rate.end))).toISOString(),
			samples: rates.length,
		};
		entry.current_bytes_per_second = entry.rate.bytes_per_second;
	}
}
