import { decrypt, encrypt } from "../lib/encryption.js";
import errs from "../lib/error.js";
import { deliverNotification, validateNotificationUrl } from "../lib/notification-http.js";
import { global as logger } from "../logger.js";
import {
	MonitorDaily,
	MonitorIncident,
	MonitorLatency,
	MonitorMute,
	MonitorObservation,
	NotificationDelivery,
	NotificationTarget,
} from "../models/monitor_incident.js";
import ProxyHost from "../models/proxy_host.js";
import internalAuditLog from "./audit-log.js";

const DAY_MS = 86_400_000;
const MAX_ATTEMPTS = 5;
let timer = null;
let running = null;
let lifecycle = new AbortController();
let lastCleanup = 0;
const iso = (value = Date.now()) => new Date(value).toISOString();
const idNumber = (value) => {
	const result = Number(value);
	if (!Number.isSafeInteger(result) || result <= 0) throw new errs.ValidationError("Invalid identifier");
	return result;
};
const text = (value, max) =>
	typeof value === "string"
		? value
				.replace(/\p{Cc}/gu, " ")
				.trim()
				.slice(0, max)
		: "";
const publicTarget = (row) => {
	const { secret, ...result } = row.toJSON ? row.toJSON() : row;
	return { ...result, has_credentials: Boolean(secret) };
};
const getHost = async (access, hostId, operation = "get") => {
	const id = idNumber(hostId);
	const permission = await access.can(`proxy_hosts:${operation}`, id);
	const query = ProxyHost.query().findById(id).where("is_deleted", 0);
	if (permission !== true && permission.permission_visibility !== "all")
		query.where("owner_user_id", access.token.getUserId(1));
	const host = await query;
	if (!host) throw new errs.ItemNotFoundError(id);
	return host;
};
const ownTarget = async (access, targetId, operation, trx, permissionChecked = false) => {
	if (!permissionChecked) await access.can(`proxy_hosts:${operation}`);
	const query = NotificationTarget.query(trx)
		.findById(idNumber(targetId))
		.where("owner_user_id", access.token.getUserId(1));
	if (trx) query.forUpdate();
	const target = await query;
	if (!target) throw new errs.ItemNotFoundError(targetId);
	return target;
};
const getMute = (hostId, trx) => MonitorMute.query(trx).findById(hostId);
const isMuted = async (hostId, checkedAt = iso(), trx = undefined) => {
	const mute = await getMute(hostId, trx);
	return Boolean(mute && mute.starts_at <= checkedAt && checkedAt < mute.ends_at);
};

async function addDaily(trx, hostId, day, patch) {
	const row = await MonitorDaily.query(trx).findOne({ host_id: hostId, day });
	if (row)
		await row.$query(trx).patch({
			up_ms: Number(row.up_ms) + (patch.up_ms || 0),
			down_ms: Number(row.down_ms) + (patch.down_ms || 0),
			checks: row.checks + (patch.checks || 0),
		});
	else
		await MonitorDaily.query(trx).insert({
			host_id: hostId,
			day,
			up_ms: patch.up_ms || 0,
			down_ms: patch.down_ms || 0,
			checks: patch.checks || 0,
		});
}

async function enqueue(trx, host, config, incident, event, result, checkedAt, muted) {
	if (!config.alert_enabled) return;
	const targets = await NotificationTarget.query(trx)
		.where("owner_user_id", host.owner_user_id)
		.where("enabled", 1)
		.limit(100);
	for (const target of targets) {
		if (target.host_ids.length && !target.host_ids.includes(host.id)) continue;
		await NotificationDelivery.query(trx).insert({
			target_id: target.id,
			incident_id: incident.id,
			host_id: host.id,
			event,
			payload: {
				event,
				incident_id: incident.id,
				host_id: host.id,
				state: result.state,
				message: text(result.message, 255),
				checked_at: checkedAt,
			},
			status: muted ? "muted" : "pending",
			attempts: 0,
			next_attempt_at: checkedAt,
			created_on: checkedAt,
			last_error: muted ? "Suppressed by scheduled alarm mute" : null,
		});
	}
}

const incidents = {
	isMuted,
	/** Same transaction as the accepted check: incident/rollups/outbox never outlive a rolled-back check. */
	async recordCheck(trx, host, config, result, checkedAt, muted) {
		const previous = await MonitorObservation.query(trx).findById(host.id).forUpdate();
		if (previous && previous.checked_at >= checkedAt) return;
		if (previous && ["up", "down"].includes(previous.state)) {
			let start = Date.parse(previous.checked_at);
			const end = Math.min(Date.parse(checkedAt), start + previous.interval_seconds * 1000);
			while (start < end) {
				const day = iso(start).slice(0, 10);
				const boundary = Math.min(end, Date.parse(`${day}T00:00:00.000Z`) + DAY_MS);
				await addDaily(trx, host.id, day, { [`${previous.state}_ms`]: boundary - start });
				start = boundary;
			}
		}
		await addDaily(trx, host.id, checkedAt.slice(0, 10), { checks: 1 });
		if (result.state === "up" && Number.isFinite(result.response_ms)) {
			const bucket = `${checkedAt.slice(0, 16)}:00.000Z`;
			const row = await MonitorLatency.query(trx).findOne({ host_id: host.id, bucket });
			const value = Math.max(0, Math.round(result.response_ms));
			if (row)
				await row.$query(trx).patch({
					samples: row.samples + 1,
					total_ms: Number(row.total_ms) + value,
					min_ms: Math.min(row.min_ms, value),
					max_ms: Math.max(row.max_ms, value),
				});
			else
				await MonitorLatency.query(trx).insert({
					host_id: host.id,
					bucket,
					samples: 1,
					total_ms: value,
					min_ms: value,
					max_ms: value,
				});
		}
		const observation = {
			host_id: host.id,
			checked_at: checkedAt,
			state: result.state,
			interval_seconds: config.interval_seconds,
		};
		if (previous) await previous.$query(trx).patch(observation);
		else await MonitorObservation.query(trx).insert(observation);
		const open = await MonitorIncident.query(trx).where("host_id", host.id).whereNull("resolved_at").first();
		if (result.state === "down") {
			if (open)
				await open.$query(trx).patch({
					last_seen_at: checkedAt,
					failure_count: open.failure_count + 1,
					message: text(result.message, 255),
				});
			else {
				const incident = await MonitorIncident.query(trx).insert({
					host_id: host.id,
					opened_at: checkedAt,
					last_seen_at: checkedAt,
					message: text(result.message, 255),
					failure_count: 1,
				});
				await enqueue(trx, host, config, incident, "incident.opened", result, checkedAt, muted);
			}
		} else if (result.state === "up" && open) {
			await open.$query(trx).patch({ resolved_at: checkedAt, last_seen_at: checkedAt, resolution: "recovered" });
			await enqueue(trx, host, config, open, "incident.resolved", result, checkedAt, muted);
		}
	},

	/** Stop extending a previous observation after settings, targets or enablement change. */
	async resetHost(hostId, trx) {
		await MonitorObservation.query(trx).where("host_id", hostId).delete();
		await MonitorIncident.query(trx)
			.where("host_id", hostId)
			.whereNull("resolved_at")
			.patch({ resolved_at: iso(), resolution: "monitor_changed" });
	},
	async removeHost(hostId, trx) {
		for (const model of /** @type {Array<import("objection").ModelClass<import("objection").Model>>} */ ([
			NotificationDelivery,
			MonitorIncident,
			MonitorObservation,
			MonitorDaily,
			MonitorLatency,
			MonitorMute,
		]))
			await model.query(trx).where("host_id", hostId).delete();
	},

	async hosts(access) {
		const permission = await access.can("proxy_hosts:list");
		const query = ProxyHost.query()
			.select("proxy_host.id", "proxy_host.enabled", "proxy_host.owner_user_id")
			.where("proxy_host.is_deleted", 0)
			.withGraphFetched("host_domains")
			.orderBy("proxy_host.id")
			.limit(2000);
		if (permission !== true && permission.permission_visibility !== "all")
			query.where("proxy_host.owner_user_id", access.token.getUserId(1));
		return (await query).map((row) => ({
			id: row.id,
			domain_names: row.domain_names,
			enabled: row.enabled,
			owned: row.owner_user_id === access.token.getUserId(1),
		}));
	},
	async list(access, options = {}) {
		const permission = await access.can("proxy_hosts:list");
		const query = MonitorIncident.query()
			.join("proxy_host", "monitor_incident.host_id", "proxy_host.id")
			.select("monitor_incident.*")
			.where("proxy_host.is_deleted", 0);
		if (permission !== true && permission.permission_visibility !== "all")
			query.where("proxy_host.owner_user_id", access.token.getUserId(1));
		if (options.host_id) query.where("monitor_incident.host_id", idNumber(options.host_id));
		if (options.status === "open") query.whereNull("resolved_at");
		else if (options.status === "resolved") query.whereNotNull("resolved_at");
		if (options.before) query.where("monitor_incident.id", "<", idNumber(options.before));
		return query.orderBy("monitor_incident.id", "desc").limit(100);
	},

	async hostDetail(access, hostId, days = 30) {
		const host = await getHost(access, hostId);
		const dayCount = Number(days);
		if (!Number.isInteger(dayCount) || dayCount < 1 || dayCount > 365)
			throw new errs.ValidationError("Days must be from 1 to 365");
		const now = Date.now();
		const today = Date.parse(`${iso(now).slice(0, 10)}T00:00:00.000Z`);
		const first = today - (dayCount - 1) * DAY_MS;
		const [rows, observation, mute, latency] = await Promise.all([
			MonitorDaily.query().where("host_id", host.id).where("day", ">=", iso(first).slice(0, 10)),
			MonitorObservation.query().findById(host.id),
			getMute(host.id),
			MonitorLatency.query()
				.where("host_id", host.id)
				.where("bucket", ">=", iso(now - DAY_MS))
				.orderBy("bucket")
				.limit(1441),
		]);
		const byDay = new Map(rows.map((row) => [row.day, row]));
		const daily = [];
		for (let date = first; date <= today; date += DAY_MS) {
			const day = iso(date).slice(0, 10);
			const row = byDay.get(day);
			const duration = Math.max(0, Math.min(DAY_MS, now - date));
			let up = Number(row?.up_ms || 0);
			let down = Number(row?.down_ms || 0);
			if (observation && ["up", "down"].includes(observation.state) && host.enabled) {
				const start = Math.max(date, Date.parse(observation.checked_at));
				const end = Math.min(
					now,
					date + DAY_MS,
					Date.parse(observation.checked_at) + observation.interval_seconds * 1000,
				);
				if (end > start) {
					if (observation.state === "up") up += end - start;
					else down += end - start;
				}
			}
			const known = up + down;
			daily.push({
				day,
				up_ms: up,
				down_ms: down,
				unknown_ms: Math.max(0, duration - known),
				coverage_percent: duration ? (known / duration) * 100 : 0,
				uptime_percent: known ? (up / known) * 100 : null,
				checks: row?.checks || 0,
			});
		}
		return {
			host_id: host.id,
			daily,
			mute: mute || null,
			latency: latency.map((row) => ({
				bucket: row.bucket,
				samples: row.samples,
				avg_ms: Number(row.total_ms) / row.samples,
				min_ms: row.min_ms,
				max_ms: row.max_ms,
			})),
			current: observation || null,
		};
	},

	async setMute(access, hostId, data) {
		const host = await getHost(access, hostId, "update");
		if (data === null) {
			await MonitorMute.query().where("host_id", host.id).delete();
			await internalAuditLog.add(access, {
				action: "updated",
				object_type: "proxy-host",
				object_id: host.id,
				meta: { alarm_mute: null },
			});
			return null;
		}
		const starts = Date.parse(data.starts_at);
		const ends = Date.parse(data.ends_at);
		if (
			!Number.isFinite(starts) ||
			!Number.isFinite(ends) ||
			ends <= starts ||
			ends - starts > 366 * DAY_MS ||
			ends <= Date.now()
		)
			throw new errs.ValidationError("Provide a future alarm mute window, at most 366 days");
		const mute = { host_id: host.id, starts_at: iso(starts), ends_at: iso(ends), reason: text(data.reason, 255) };
		await MonitorMute.query().insert(mute).onConflict("host_id").merge();
		await internalAuditLog.add(access, {
			action: "updated",
			object_type: "proxy-host",
			object_id: host.id,
			meta: { alarm_mute: mute },
		});
		return mute;
	},

	async targets(access) {
		await access.can("proxy_hosts:list");
		return (await NotificationTarget.query().where("owner_user_id", access.token.getUserId(1)).orderBy("id")).map(
			publicTarget,
		);
	},
	async saveTarget(access, targetId, data) {
		await access.can("proxy_hosts:update");
		const owner = access.token.getUserId(1);
		if (!targetId && (await NotificationTarget.query().where("owner_user_id", owner).resultSize()) >= 100)
			throw new errs.ValidationError("At most 100 notification targets are allowed");
		for (const hostId of data.host_ids || []) {
			const host = await getHost(access, hostId, "update");
			if (host.owner_user_id !== owner)
				throw new errs.ValidationError("Notification targets may subscribe only to your own hosts");
		}
		const saved = await NotificationTarget.transaction(async (trx) => {
			const current = targetId ? await ownTarget(access, targetId, "update", trx, true) : null;
			if (current && current.version !== data.version)
				throw new errs.ValidationError("Notification target changed; reload before saving");
			let secret = current && current.type === data.type ? JSON.parse(decrypt(current.secret)) : {};
			secret = { url: data.url || secret.url, token: data.token === undefined ? secret.token || "" : data.token };
			validateNotificationUrl(secret.url, data.type);
			if (
				secret.token &&
				(typeof secret.token !== "string" || /[\r\n]/.test(secret.token) || secret.token.length > 4096)
			)
				throw new errs.ValidationError("Invalid notification bearer token");
			const patch = {
				owner_user_id: owner,
				name: data.name,
				type: data.type,
				enabled: data.enabled,
				host_ids: data.host_ids || [],
				secret: encrypt(JSON.stringify(secret)),
				version: (current?.version || 0) + 1,
			};
			const row = current
				? await current.$query(trx).patchAndFetch(patch)
				: await NotificationTarget.query(trx).insertAndFetch(patch);
			return publicTarget(row);
		});
		await internalAuditLog.add(access, {
			action: targetId ? "updated" : "created",
			object_type: "setting",
			object_id: saved.id,
			meta: {
				name: saved.name,
				module: "notification-channel",
				channel_type: saved.type,
				target_id: saved.id,
				enabled: saved.enabled,
				host_ids: saved.host_ids,
			},
		});
		return saved;
	},
	async deleteTarget(access, targetId) {
		const target = await ownTarget(access, targetId, "update");
		await NotificationTarget.transaction(async (trx) => {
			await NotificationDelivery.query(trx).where("target_id", target.id).delete();
			await NotificationTarget.query(trx).deleteById(target.id);
		});
		await internalAuditLog.add(access, {
			action: "deleted",
			object_type: "setting",
			object_id: target.id,
			meta: {
				name: target.name,
				module: "notification-channel",
				channel_type: target.type,
				target_id: target.id,
			},
		});
		return true;
	},
	async deliveries(access) {
		await access.can("proxy_hosts:list");
		const rows = await NotificationDelivery.query()
			.join("notification_target", "notification_delivery.target_id", "notification_target.id")
			.select("notification_delivery.*", "notification_target.name as target_name")
			.where("notification_target.owner_user_id", access.token.getUserId(1))
			.orderBy("notification_delivery.id", "desc")
			.limit(100);
		return rows;
	},
	async retry(access, deliveryId) {
		const row = await NotificationDelivery.query().findById(idNumber(deliveryId));
		if (!row) throw new errs.ItemNotFoundError(deliveryId);
		await ownTarget(access, row.target_id, "update");
		await getHost(access, row.host_id, "update");
		if (!["failed", "pending", "muted"].includes(row.status))
			throw new errs.ValidationError("Only failed, pending or muted deliveries may be retried");
		const changed = await NotificationDelivery.query()
			.where("id", row.id)
			.where("status", row.status)
			.where("attempts", row.attempts)
			.patch({ status: "pending", attempts: 0, next_attempt_at: iso(), last_error: null });
		if (!changed) throw new errs.ValidationError("Delivery changed while retrying; refresh its status");
		await internalAuditLog.add(access, {
			action: "updated",
			object_type: "setting",
			object_id: row.target_id,
			meta: {
				name: "Notification delivery retry",
				module: "notification-channel",
				delivery_id: row.id,
				target_id: row.target_id,
				host_id: row.host_id,
				incident_id: row.incident_id,
			},
		});
		return true;
	},

	async deliverOne(id, signal) {
		const claimed = await NotificationDelivery.transaction(async (trx) => {
			const row = await NotificationDelivery.query(trx).findById(id).forUpdate();
			if (row?.status !== "pending" || row.next_attempt_at > iso()) return null;
			await row.$query(trx).patch({
				status: "sending",
				attempts: row.attempts + 1,
				next_attempt_at: iso(Date.now() + 5 * 60_000),
			});
			return row;
		});
		if (!claimed) return;
		try {
			const [target, host] = await Promise.all([
				NotificationTarget.query().findById(claimed.target_id),
				ProxyHost.query().findById(claimed.host_id).where("is_deleted", 0),
			]);
			if (
				!target?.enabled ||
				!host ||
				host.owner_user_id !== target.owner_user_id ||
				(target.host_ids.length && !target.host_ids.includes(host.id))
			) {
				await claimed
					.$query()
					.patch({ status: "cancelled", last_error: "Target or host subscription is no longer enabled" });
				return;
			}
			if (await isMuted(host.id)) {
				await claimed.$query().patch({ status: "muted", last_error: "Suppressed by scheduled alarm mute" });
				return;
			}
			await deliverNotification(target, JSON.parse(decrypt(target.secret)), claimed.payload, claimed.id, signal);
			await claimed.$query().patch({ status: "sent", sent_at: iso(), last_error: null });
		} catch (error) {
			// Never copy a URL, token, HTTP body or raw transport diagnostic into a public failure.
			const message = /^Notification endpoint returned HTTP \d{3}$/.test(error.message)
				? error.message
				: "Notification delivery failed; check endpoint, HTTPS and credentials";
			await claimed.$query().patch({
				status: claimed.attempts >= MAX_ATTEMPTS ? "failed" : "pending",
				next_attempt_at: iso(Date.now() + Math.min(3_600_000, 30_000 * 2 ** (claimed.attempts - 1))),
				last_error: message,
			});
		}
	},
	async tick() {
		if (running || lifecycle.signal.aborted) return running;
		running = (async () => {
			const now = iso();
			await NotificationDelivery.query()
				.where("status", "sending")
				.where("next_attempt_at", "<=", now)
				.where("attempts", ">=", MAX_ATTEMPTS)
				.patch({
					status: "failed",
					last_error: "Final delivery attempt was interrupted; retry explicitly if needed",
				});
			await NotificationDelivery.query()
				.where("status", "sending")
				.where("next_attempt_at", "<=", now)
				.where("attempts", "<", MAX_ATTEMPTS)
				.patch({ status: "pending", last_error: "Previous delivery attempt was interrupted" });
			const due = await NotificationDelivery.query()
				.where("status", "pending")
				.where("next_attempt_at", "<=", now)
				.orderBy("id")
				.limit(20);
			for (let index = 0; index < due.length && !lifecycle.signal.aborted; index += 2)
				await Promise.allSettled(
					due.slice(index, index + 2).map((row) => this.deliverOne(row.id, lifecycle.signal)),
				);
			if (Date.now() - lastCleanup > 3_600_000) {
				lastCleanup = Date.now();
				await MonitorLatency.query()
					.where("bucket", "<", iso(Date.now() - 7 * DAY_MS))
					.delete();
				await MonitorDaily.query()
					.where("day", "<", iso(Date.now() - 366 * DAY_MS).slice(0, 10))
					.delete();
				await NotificationDelivery.query()
					.where("created_on", "<", iso(Date.now() - 366 * DAY_MS))
					.whereNot("status", "sending")
					.delete();
				await MonitorIncident.query()
					.where("resolved_at", "<", iso(Date.now() - 366 * DAY_MS))
					.delete();
			}
		})()
			.catch((error) => logger.error("[Incidents] Notification worker failed", error))
			.finally(() => {
				running = null;
			});
		return running;
	},
	init() {
		if (timer) return;
		lifecycle = new AbortController();
		timer = setInterval(() => void this.tick(), 5000);
		timer.unref?.();
		void this.tick();
	},
	async stop() {
		if (timer) clearInterval(timer);
		timer = null;
		lifecycle.abort();
		await running;
	},
};

export default incidents;
