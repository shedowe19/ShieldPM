import dayjs from "dayjs";
import { global as logger } from "../logger.js";
import proxyHostModel from "../models/proxy_host.js";
import internalNginx from "./nginx.js";

const internalMaintenance = {
	interval: null,
	intervalProcessing: false,
	scheduledTimers: new Map(), // Track scheduled timers by hostId

	initTimer: () => {
		logger.info("Maintenance Timer initialized");
		// Initial scan and set up precise timers
		internalMaintenance.processMaintenance();
		// Also keep polling as backup (every 30s) for hosts added during runtime
		internalMaintenance.interval = setInterval(internalMaintenance.processMaintenance, 30 * 1000);
	},

	stopTimer: async () => {
		if (internalMaintenance.interval) {
			clearInterval(internalMaintenance.interval);
			internalMaintenance.interval = null;
		}
		for (const timers of internalMaintenance.scheduledTimers.values()) {
			for (const timer of timers) clearTimeout(timer);
		}
		internalMaintenance.scheduledTimers.clear();
		while (internalMaintenance.intervalProcessing) {
			await new Promise((resolve) => setTimeout(() => resolve(undefined), 25));
		}
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
		if (start && now.isBefore(start)) {
			const msUntilStart = start.diff(now);
			logger.info(`Scheduling maintenance START for Host #${hostId} in ${Math.round(msUntilStart / 1000)}s`);
			const startTimer = setTimeout(() => {
				logger.info(`Maintenance START triggered for Host #${hostId}`);
				internalMaintenance.processMaintenance();
			}, msUntilStart);
			newTimers.push(startTimer);
		}

		// Schedule end timer
		if (end && now.isBefore(end)) {
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
			const now = dayjs();
			// Fetch hosts that have a maintenance schedule
			const hosts = await proxyHostModel
				.query()
				.where("is_deleted", 0)
				.andWhere(function () {
					this.whereNotNull("maintenance_start").orWhereNotNull("maintenance_end");
				});

			let reloadNeeded = false;

			for (const host of hosts) {
				const start = host.maintenance_start ? dayjs(host.maintenance_start) : null;
				const end = host.maintenance_end ? dayjs(host.maintenance_end) : null;

				// Schedule precise timers for future events
				internalMaintenance.scheduleTimers(host.id, start, end);

				// STATE-BASED LOGIC:
				// 1. Determine if we SHOULD be in maintenance right now
				let shouldBeActive = false;
				if (start && now.isAfter(start)) {
					// It has started. Has it ended?
					if (!end || now.isBefore(end)) {
						shouldBeActive = true;
					}
				}

				// 2. Compare with current DB state
				const isCurrentlyActive = !!host.maintenance_active;

				if (shouldBeActive !== isCurrentlyActive) {
					logger.info(
						`Maintenance State Change for Host #${host.id}: ${isCurrentlyActive} -> ${shouldBeActive}`,
					);

					// Build patch object
					const patchData = {
						maintenance_active: shouldBeActive ? 1 : 0,
					};

					// Clear schedule after it has been processed to prevent constant re-triggering
					if (shouldBeActive && !end) {
						patchData.maintenance_start = null;
						logger.info(`Cleared one-shot schedule for Host #${host.id}`);
					} else if (!shouldBeActive && end && now.isAfter(end)) {
						patchData.maintenance_start = null;
						patchData.maintenance_end = null;
						logger.info(`Cleared expired maintenance window for Host #${host.id}`);
					}

					// Update DB
					await proxyHostModel.query().findById(host.id).patch(patchData);

					// Refetch host and regenerate nginx config
					const updatedHost = await proxyHostModel
						.query()
						.findById(host.id)
						.withGraphFetched("[owner, access_list, certificate]");

					await internalNginx.configure(proxyHostModel, "proxy_host", updatedHost, { skip_reload: true });

					reloadNeeded = true;
				}
			}

			if (reloadNeeded) {
				await internalNginx.reload();
			}
		} catch (err) {
			logger.error(err);
		} finally {
			internalMaintenance.intervalProcessing = false;
		}
	},
};

export default internalMaintenance;
