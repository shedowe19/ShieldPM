import dayjs from "dayjs";
import { global as logger } from "../logger.js";
import proxyHostModel from "../models/proxy_host.js";
import internalNginx from "./nginx.js";

const MAX_TIMER_DELAY = 2 ** 31 - 1;

const desiredState = (host, now) => {
	const start = host.maintenance_start ? dayjs(host.maintenance_start) : null;
	const end = host.maintenance_end ? dayjs(host.maintenance_end) : null;
	if (start) return !now.isBefore(start) && (!end || now.isBefore(end));
	return Boolean(host.maintenance_active) && (!end || now.isBefore(end));
};

const completedSchedule = (host, now) => {
	/** @type {{maintenance_pending: number, maintenance_start?: null, maintenance_end?: null}} */
	const patch = { maintenance_pending: 0 };
	if (host.maintenance_active && !host.maintenance_end) patch.maintenance_start = null;
	else if (!host.maintenance_active && host.maintenance_end && !now.isBefore(dayjs(host.maintenance_end))) {
		patch.maintenance_start = null;
		patch.maintenance_end = null;
	}
	return patch;
};

/** Persist the activation job before touching files; a restart must retain unfinished work. */
const claimMaintenance = (id) =>
	proxyHostModel.transaction(async (trx) => {
		const host = await proxyHostModel.query(trx).findById(id).forUpdate();
		if (!host || host.is_deleted) return null;
		const now = dayjs();
		const active = desiredState(host, now);
		if (!host.maintenance_pending && active === Boolean(host.maintenance_active)) return null;
		const patch = { maintenance_active: active ? 1 : 0, maintenance_pending: host.enabled ? 1 : 0 };
		if (!host.enabled) Object.assign(patch, completedSchedule({ ...host, maintenance_active: active }, now));
		await proxyHostModel.query(trx).findById(id).patch(patch);
		return host.enabled ? { ...host, ...patch } : null;
	});

/** An edit arriving during reload owns its schedule and must not be cleared by the older job. */
const finishMaintenance = (stagedHost) =>
	proxyHostModel.transaction(async (trx) => {
		const current = await proxyHostModel.query(trx).findById(stagedHost.id).forUpdate();
		if (
			!current ||
			current.is_deleted ||
			Boolean(current.maintenance_active) !== Boolean(stagedHost.maintenance_active) ||
			current.maintenance_start !== stagedHost.maintenance_start ||
			current.maintenance_end !== stagedHost.maintenance_end
		)
			return;
		await proxyHostModel.query(trx).findById(current.id).patch(completedSchedule(current, dayjs()));
	});

const activateMaintenance = async (hosts) => {
	const stages = [];
	try {
		for (const snapshot of hosts) {
			const host = await claimMaintenance(snapshot.id);
			if (!host) continue;
			stages.push(
				await internalNginx.configureHost(proxyHostModel, "proxy_host", host, {
					defer_validation: true,
					skip_reload: true,
				}),
			);
		}
		if (!stages.length) return;
		// One validated activation for all changes, with every previous file retained.
		await internalNginx.reload();
	} catch (error) {
		const rollbacks = await Promise.allSettled(
			stages.map((stage) => internalNginx.rollbackStagedConfig(stage, error)),
		);
		for (const rollback of rollbacks) {
			if (rollback.status === "rejected") logger.error("Maintenance configuration rollback failed:", rollback.reason);
		}
		if (stages.length) {
			try {
				await internalNginx.reload();
			} catch (rollbackError) {
				logger.error("Maintenance rollback reload failed:", rollbackError);
			}
		}
		// The durable pending flags and original dates remain for the next poll/startup.
		throw error;
	}
	for (const stage of stages) {
		try {
			await internalNginx.commitStagedConfig(stage);
			await finishMaintenance(stage.host);
		} catch (error) {
			// Activation succeeded; keep the pending job and retry its cleanup safely.
			logger.error("Maintenance completion failed:", error);
		}
	}
};

const internalMaintenance = {
	interval: null,
	intervalProcessing: false,
	scheduledTimers: new Map(), // Track scheduled timers by hostId

	initTimer: () => {
		if (internalMaintenance.interval) return;
		logger.info("Maintenance Timer initialized");
		// Initial scan and set up precise timers
		internalMaintenance.processMaintenance();
		// Also keep polling as backup (every 30s) for hosts added during runtime
		internalMaintenance.interval = setInterval(internalMaintenance.processMaintenance, 30 * 1000);
	},

	/**
	 * Schedule precise timers for a specific host
	 */
	scheduleTimers: (hostId, start, end) => {
		const now = dayjs();
		const timerKey = `host_${hostId}`;

		// Clear any existing timers for this host
		if (internalMaintenance.scheduledTimers.has(timerKey)) {
			const existingTimers = internalMaintenance.scheduledTimers.get(timerKey);
			existingTimers.forEach((timer) => {
				clearTimeout(timer);
			});
		}

		const newTimers = [];

		// Schedule start timer
		if (start && now.isBefore(start) && start.diff(now) <= MAX_TIMER_DELAY) {
			const msUntilStart = start.diff(now);
			logger.info(`Scheduling maintenance START for Host #${hostId} in ${Math.round(msUntilStart / 1000)}s`);
			const startTimer = setTimeout(() => {
				logger.info(`Maintenance START triggered for Host #${hostId}`);
				internalMaintenance.processMaintenance();
			}, msUntilStart);
			newTimers.push(startTimer);
		}

		// Schedule end timer
		if (end && now.isBefore(end) && end.diff(now) <= MAX_TIMER_DELAY) {
			const msUntilEnd = end.diff(now);
			logger.info(`Scheduling maintenance END for Host #${hostId} in ${Math.round(msUntilEnd / 1000)}s`);
			const endTimer = setTimeout(() => {
				logger.info(`Maintenance END triggered for Host #${hostId}`);
				internalMaintenance.processMaintenance();
			}, msUntilEnd);
			newTimers.push(endTimer);
		}

		if (newTimers.length > 0) {
			internalMaintenance.scheduledTimers.set(timerKey, newTimers);
		} else {
			internalMaintenance.scheduledTimers.delete(timerKey);
		}
	},

	processMaintenance: async () => {
		if (internalMaintenance.intervalProcessing) return;
		internalMaintenance.intervalProcessing = true;

		try {
			// Fetch hosts that have a maintenance schedule
			const hosts = await proxyHostModel
				.query()
				.where("is_deleted", 0)
				.andWhere(function () {
					this.whereNotNull("maintenance_start").orWhereNotNull("maintenance_end").orWhere("maintenance_pending", 1);
				});

			const activeTimerKeys = new Set(hosts.map((host) => `host_${host.id}`));
			for (const [key, timers] of internalMaintenance.scheduledTimers) {
				if (!activeTimerKeys.has(key)) {
					timers.forEach(clearTimeout);
					internalMaintenance.scheduledTimers.delete(key);
				}
			}

			for (const host of hosts) {
				const start = host.maintenance_start ? dayjs(host.maintenance_start) : null;
				const end = host.maintenance_end ? dayjs(host.maintenance_end) : null;

				// Schedule precise timers for future events
				internalMaintenance.scheduleTimers(host.id, start, end);
			}
			await internalNginx.withConfigurationLock(() => activateMaintenance(hosts));
		} catch (err) {
			logger.error(err);
		} finally {
			internalMaintenance.intervalProcessing = false;
		}
	},
};

export default internalMaintenance;
