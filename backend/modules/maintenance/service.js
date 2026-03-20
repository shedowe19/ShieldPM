import dayjs from "dayjs";
import { global as logger } from "../../logger.js";
import proxyHostModel from "../../models/proxy_host.js";
import { nginxService } from "../../modules/nginx/index.js";
import { maintenanceState } from "./state.js";

const scheduleTimers = (hostId, start, end) => {
	const now = dayjs();
	const timerKey = `host_${hostId}`;
	if (maintenanceState.scheduledTimers.has(timerKey)) {
		const existingTimers = maintenanceState.scheduledTimers.get(timerKey);
		existingTimers.forEach((timer) => clearTimeout(timer));
	}
	const newTimers = [];
	if (start && now.isBefore(start)) {
		const msUntilStart = start.diff(now);
		logger.info(`Scheduling maintenance START for Host #${hostId} in ${Math.round(msUntilStart / 1000)}s`);
		const startTimer = setTimeout(() => {
			logger.info(`Maintenance START triggered for Host #${hostId}`);
			processMaintenance();
		}, msUntilStart);
		newTimers.push(startTimer);
	}
	if (end && now.isBefore(end)) {
		const msUntilEnd = end.diff(now);
		logger.info(`Scheduling maintenance END for Host #${hostId} in ${Math.round(msUntilEnd / 1000)}s`);
		const endTimer = setTimeout(() => {
			logger.info(`Maintenance END triggered for Host #${hostId}`);
			processMaintenance();
		}, msUntilEnd);
		newTimers.push(endTimer);
	}
	if (newTimers.length > 0) maintenanceState.scheduledTimers.set(timerKey, newTimers);
};

const processMaintenance = async () => {
	if (maintenanceState.intervalProcessing) return;
	maintenanceState.intervalProcessing = true;
	try {
		const now = dayjs();
		const hosts = await proxyHostModel.query().where("is_deleted", 0).andWhere(function () {
			this.whereNotNull("maintenance_start").orWhereNotNull("maintenance_end");
		});
		let reloadNeeded = false;
		for (const host of hosts) {
			const start = host.maintenance_start ? dayjs(host.maintenance_start) : null;
			const end = host.maintenance_end ? dayjs(host.maintenance_end) : null;
			scheduleTimers(host.id, start, end);
			let shouldBeActive = false;
			if (start && now.isAfter(start)) {
				if (!end || now.isBefore(end)) shouldBeActive = true;
			}
			const isCurrentlyActive = !!host.maintenance_active;
			if (shouldBeActive !== isCurrentlyActive) {
				logger.info(`Maintenance State Change for Host #${host.id}: ${isCurrentlyActive} -> ${shouldBeActive}`);
				const patchData = { maintenance_active: shouldBeActive ? 1 : 0 };
				if (shouldBeActive && !end) {
					patchData.maintenance_start = null;
					logger.info(`Cleared one-shot schedule for Host #${host.id}`);
				} else if (!shouldBeActive && end && now.isAfter(end)) {
					patchData.maintenance_start = null;
					patchData.maintenance_end = null;
					logger.info(`Cleared expired maintenance window for Host #${host.id}`);
				}
				await proxyHostModel.query().findById(host.id).patch(patchData);
				const updatedHost = await proxyHostModel.query().findById(host.id).withGraphFetched("[owner, access_list, certificate]");
				await nginxService.configure(proxyHostModel, "proxy_host", updatedHost, { skip_reload: true });
				reloadNeeded = true;
			}
		}
		if (reloadNeeded) await nginxService.reload();
	} catch (err) {
		logger.error(err);
	} finally {
		maintenanceState.intervalProcessing = false;
	}
};

const initTimer = () => {
	logger.info("Maintenance Timer initialized");
	processMaintenance();
	maintenanceState.interval = setInterval(processMaintenance, 30 * 1000);
};

export default { initTimer, processMaintenance, scheduleTimers, ...maintenanceState };
