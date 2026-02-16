import internalSetting from "../../setting.js";
import internalMaintenance from "../../maintenance.js";
import internalProxyHost from "../../proxy-host.js";
import internalNginx from "../../nginx.js";
import ProxyHost from "../../../models/proxy_host.js";
import si from "systeminformation";
import internalReport from "../../report.js";
import internalAuditLog from "../../audit-log.js";
import internalIpRanges from "../../ip_ranges.js";
import { isDemoMode } from "../../../lib/config.js";

// Settings
export const get_global_settings = async (access, args) => {
	const settings = await internalSetting.getAll(access);
	return JSON.stringify(settings.map((s) => ({ id: s.id, value: s.value })));
};

export const update_global_setting = async (access, args) => {
	await internalSetting.update(access, { id: args.id, ...args });
	return `Updated Setting: ${args.id}`;
};

// System
export const get_system_status = async (access, args) => {
	const net = await si.networkStats();
	const rx = net.reduce((acc, iface) => acc + (iface.rx_sec || 0), 0);
	const tx = net.reduce((acc, iface) => acc + (iface.tx_sec || 0), 0);
	return JSON.stringify({ rx_sec: rx, tx_sec: tx, total_sec: rx + tx });
};

// Nginx
export const test_nginx_config = async (access, args) => {
	try {
		await internalNginx.test();
		return "Nginx configuration is valid.";
	} catch (err) {
		return `Nginx Test Failed: ${err.message}`;
	}
};

export const force_nginx_reload = async (access, args) => {
	await internalNginx.reload();
	return "Nginx Reloaded";
};

export const read_nginx_logs = async (access, args) => {
	if (isDemoMode()) throw new Error("Log reading is disabled in Demo Mode.");
	const logType = args.log_type || "error";
	const lines = args.lines || 50;
	const logs = await internalNginx.getLogs(access, logType);
	return logs.split("\n").slice(-lines).join("\n") || "No logs found.";
};

// Maintenance
export const set_maintenance_mode = async (access, args) => {
	const id = args.id || args.proxy_host_id || args.host_id;
	const payload = { id: id };

	if (typeof args.active !== "undefined") {
		payload.maintenance_active = args.active;
	}

	const startTime = args.maintenance_start || args.start || args.start_time || args.scheduled_start;
	const endTime = args.maintenance_end || args.end || args.end_time || args.scheduled_end;
	if (startTime) payload.maintenance_start = startTime;
	if (endTime) payload.maintenance_end = endTime;

	if (payload.maintenance_start && typeof payload.maintenance_active === "undefined") {
		payload.maintenance_active = false;
	}

	if (args.reason) payload.maintenance_reason = args.reason;
	else if (args.maintenance_reason) payload.maintenance_reason = args.maintenance_reason;

	await internalProxyHost.update(access, payload);

	const updatedHost = await internalProxyHost.get(access, {
		id: id,
		expand: ["owner", "access_list", "certificate"],
	});
	await internalNginx.configure(ProxyHost, "proxy_host", updatedHost);
	await internalNginx.reload();
	internalMaintenance.processMaintenance().catch(() => {});

	return `Maintenance Mode ${args.active ? "ENABLED" : "DISABLED"} for Host ID: ${id}`;
};

// Reports & Analytics
export const get_host_counts = async (access, args) => {
	const counts = await internalReport.getHostsReport(access);
	return JSON.stringify(counts);
};

export const get_audit_log = async (access, args) => {
	if (isDemoMode()) throw new Error("Audit Log is disabled in Demo Mode.");
	const logs = await internalAuditLog.getAll(access, ["user"]);
	return JSON.stringify(
		logs.map((l) => ({
			action: l.action,
			user: l.user ? l.user.name : "System",
			time: l.created_on,
			meta: l.meta,
		})),
	);
};

// IP Ranges
export const renew_ip_ranges = async (access, args) => {
	await internalIpRanges.fetch();
	return "IP Ranges renewal triggered.";
};
