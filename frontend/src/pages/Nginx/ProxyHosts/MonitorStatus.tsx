import type { ProxyHostMonitorStatus, ProxyHostMonitorSummary } from "src/api/backend/proxyHostMonitor";
import { Badge } from "src/components/ui/badge";
import { intl, T } from "src/locale";

const monitorLabels = {
	up: "proxy-host.monitor.up",
	down: "proxy-host.monitor.down",
	unknown: "proxy-host.monitor.unknown",
	paused: "proxy-host.monitor.paused",
} as const;

export function formatMonitorTime(value: string | null | undefined) {
	if (!value) return "–";
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? "–" : date.toLocaleString();
}

export function monitorMessage(message: string | null | undefined): string | null {
	if (message === "TLS certificate could not be verified") {
		return intl.formatMessage({ id: "proxy-host.monitor.tls-unverified" });
	}
	return message ?? null;
}

export function MonitorStatus({
	status,
	showResponseTime = true,
}: {
	status: ProxyHostMonitorStatus | null | undefined;
	showResponseTime?: boolean;
}) {
	const state = status?.state ?? "unknown";
	const label = state === "unknown" && status?.checkedAt ? "proxy-host.monitor.unverifiable" : monitorLabels[state];
	return (
		<span className="inline-flex flex-wrap items-center gap-2" title={monitorMessage(status?.message) ?? undefined}>
			<Badge
				variant={state === "up" ? "success" : state === "down" ? "destructive" : "secondary"}
				className="whitespace-nowrap"
			>
				<T id={label} />
			</Badge>
			{showResponseTime && typeof status?.responseMs === "number" && state !== "paused" && (
				<span className="text-xs text-muted-foreground">{Math.round(status.responseMs)} ms</span>
			)}
		</span>
	);
}

export function MonitorLatency({
	status,
	loading,
	error,
}: {
	status: ProxyHostMonitorSummary | undefined;
	loading: boolean;
	error: boolean;
}) {
	const responseMs = status?.responseMs;
	if (
		loading ||
		error ||
		!status?.checkedAt ||
		status.state === "paused" ||
		typeof responseMs !== "number" ||
		!Number.isFinite(responseMs) ||
		responseMs < 0
	) {
		return <span className="text-muted-foreground">–</span>;
	}
	return (
		<span
			className="whitespace-nowrap tabular-nums"
			title={`${intl.formatMessage({ id: "proxy-host.monitor.latency-description" })}\n${intl.formatMessage({ id: "proxy-host.monitor.last-checked" })}: ${formatMonitorTime(status.checkedAt)}`}
		>
			{Math.round(responseMs)} ms
		</span>
	);
}

export function MonitorSummary({
	status,
	loading,
	error,
}: {
	status: ProxyHostMonitorSummary | undefined;
	loading: boolean;
	error: boolean;
}) {
	if (loading) return <T id="proxy-host.monitor.loading" />;
	if (error) return <T id="proxy-host.monitor.unavailable" />;
	if (!status) return <T id="proxy-host.monitor.not-configured" />;
	return (
		<span
			title={
				status.checkedAt
					? `${intl.formatMessage({ id: "proxy-host.monitor.last-checked" })}: ${formatMonitorTime(status.checkedAt)}`
					: undefined
			}
		>
			<MonitorStatus status={status} showResponseTime={false} />
		</span>
	);
}
