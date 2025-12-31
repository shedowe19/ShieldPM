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

				// Check if we just entered maintenance (start time was within last minute)
				if (start && start.isAfter(now.subtract(1, "minute")) && start.isBefore(now.add(1, "second"))) {
					logger.info(`Host #${host.id} entering maintenance window. Reloading Nginx.`);
					reloadNeeded = true;
				}

				// Check if we just exited maintenance (end time was within last minute)
				if (end && end.isAfter(now.subtract(1, "minute")) && end.isBefore(now.add(1, "second"))) {
					logger.info(`Host #${host.id} exiting maintenance window. Reloading Nginx.`);
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
