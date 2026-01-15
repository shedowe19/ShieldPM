import dayjs from "dayjs";
import { global as logger } from "../logger.js";
import proxyHostModel from "../models/proxy_host.js";
import internalNginx from "./nginx.js";

const internalMaintenance = {
	interval: null,
	intervalProcessing: false,

	initTimer: () => {
		logger.info("Maintenance Timer initialized");
		internalMaintenance.interval = setInterval(internalMaintenance.processMaintenance, 60 * 1000); // Check every minute
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

					// Update DB
					await proxyHostModel
						.query()
						.findById(host.id)
						.patch({
							maintenance_active: shouldBeActive ? 1 : 0,
						});

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
