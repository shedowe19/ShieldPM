import type { FlowRate } from "src/api/backend/getTrafficFlow";
import { intl } from "src/locale";
import styles from "./TrafficFlow.module.css";

const text = (key: string, values?: Record<string, string | number>) =>
	intl.formatMessage({ id: `analytics.flow.${key}` }, values);

/** Fixed logarithmic scale shared by every edge. Width uses the EMA; details retain exact measurements. */
export const flowLineWidth = (rate: number | null | undefined) =>
	rate === null || rate === undefined ? 2 : Math.min(16, 2 + Math.log2(1 + Math.max(0, rate) / 1024));

const knownReasons = new Set([
	"disabled",
	"native_disabled",
	"native_not_received",
	"collector_error",
	"waiting_baseline",
	"completed",
	"stale",
	"unsupported",
	"mixed_semantics",
	"truncated",
	"not_measured",
	"incomplete_final_acknowledgement",
	"unverified_byte_accounting",
]);

export const rateDescription = (rate?: FlowRate | null, incomplete?: boolean, mixed?: boolean, reason?: string) =>
	rate
		? text("rate-detail", {
				upload: String(rate.uploadBytesPerSecond),
				download: String(rate.downloadBytesPerSecond),
				total: String(rate.bytesPerSecond),
				smooth: String(rate.smoothedBytesPerSecond),
				start: rate.windowStart,
				end: rate.windowEnd,
				samples: rate.samples,
				uploadQuality: (rate.uploadSemantics || ["http_request_received"])
					.map((value) => text(`quality.${value}`))
					.join(", "),
				downloadQuality: (rate.downloadSemantics || ["http_transport_accepted"])
					.map((value) => text(`quality.${value}`))
					.join(", "),
			})
		: text(
				reason && knownReasons.has(reason)
					? `reason.${reason}`
					: mixed
						? "rate-mixed"
						: incomplete
							? "rate-incomplete"
							: "unknown-rate",
			);

export function FlowRateLabel({
	rate,
	incomplete,
	mixed,
	reason,
}: {
	rate?: FlowRate | null;
	incomplete?: boolean;
	mixed?: boolean;
	reason?: string;
}) {
	return (
		<span title={rateDescription(rate, incomplete, mixed, reason)}>
			{rate
				? text("rate-label", {
						upload: intl.formatNumber(rate.uploadBytesPerSecond, { maximumFractionDigits: 1 }),
						download: intl.formatNumber(rate.downloadBytesPerSecond, { maximumFractionDigits: 1 }),
					})
				: reason && knownReasons.has(reason)
					? text(`reason-short.${reason}`)
					: mixed
						? text("rate-mixed-short")
						: text("unknown-rate")}
		</span>
	);
}

export function FlowRateComponents({
	components,
	live = false,
}: {
	components?: (FlowRate & { id: string; activeRequests?: number })[];
	live?: boolean;
}) {
	if (!components?.length) return null;
	return (
		<details className="mt-1 text-xs">
			<summary className="cursor-pointer">{text("accounting-groups")}</summary>
			<ul className="space-y-1">
				{components.map((rate) => (
					<li key={rate.id} className="flex items-center">
						<FlowConnection kind="observed" rate={rate} live={live && (rate.activeRequests || 0) > 0} />
						<FlowRateLabel rate={rate} />
					</li>
				))}
			</ul>
		</details>
	);
}

export function FlowConnection({
	kind,
	rate,
	live = false,
}: {
	kind: "configured" | "observed" | "unknown";
	rate?: FlowRate | null;
	live?: boolean;
}) {
	const age = rate ? Date.now() - Date.parse(rate.windowEnd) : Number.POSITIVE_INFINITY;
	const flowing = live && rate && rate.bytesPerSecond > 0 && age >= -1000 && age < 3500;
	return (
		<svg width="32" height="24" viewBox="0 0 32 24" aria-hidden="true" className="shrink-0 text-muted-foreground">
			<line
				x1="0"
				x2="32"
				y1="12"
				y2="12"
				stroke="currentColor"
				strokeWidth={flowLineWidth(rate?.smoothedBytesPerSecond)}
				strokeDasharray={kind === "configured" ? "6 4" : kind === "unknown" ? "2 3" : undefined}
			/>
			{flowing && (
				<circle
					data-flow-motion="verified"
					className={styles.particle}
					cx="0"
					cy="12"
					r="3"
					fill="hsl(var(--primary))"
					stroke="hsl(var(--background))"
					strokeWidth="1.5"
				/>
			)}
		</svg>
	);
}

export function FlowRateLegend({ showDescription = true }: { showDescription?: boolean }) {
	return (
		<div className="flex flex-wrap items-center gap-3 text-xs">
			{[0, 1024, 65536, 1048576, 16777216].map((value) => (
				<span className="flex items-center gap-1" key={value}>
					<svg width="32" height="24" aria-hidden="true">
						<line x1="0" x2="32" y1="12" y2="12" stroke="currentColor" strokeWidth={flowLineWidth(value)} />
					</svg>
					{value === 0
						? "0 B/s"
						: value === 1024
							? "1 KiB/s"
							: value === 65536
								? "64 KiB/s"
								: value === 1048576
									? "1 MiB/s"
									: "≥16 MiB/s"}
				</span>
			))}
			{showDescription && <span>{text("rate-scale")}</span>}
		</div>
	);
}
