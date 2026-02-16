// Analytics wrapper
import internalReport from "../../report.js";

// Lazy load analytics module to avoid circular deps if any
export const get_analytics_summary = async (access, args) => {
	const internalAnalytics = (await import("../../analytics.js")).default;
	if (!args.host_id && !args.proxy_host_id) {
		const counts = await internalReport.getHostsReport(access);
		return JSON.stringify(counts);
	}
	const summary = await internalAnalytics.getHostSummary(args.host_id || args.proxy_host_id, args.range || "24h");
	return JSON.stringify(summary, null, 2);
};

export const get_analytics_series = async (access, args) => {
	const internalAnalytics = (await import("../../analytics.js")).default;
	const summary = await internalAnalytics.getHostSummary(
		args.proxy_host_id || args.host_id,
		args.time_range || args.range || "24h",
	);
	return JSON.stringify(summary, null, 2);
};

export const get_host_analytics = async (access, args) => {
	const internalAnalytics = (await import("../../analytics.js")).default;
	const summary = await internalAnalytics.getHostSummary(args.host_id, args.range || "24h");
	return JSON.stringify(summary, null, 2);
};
