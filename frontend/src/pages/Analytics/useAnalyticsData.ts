import dayjs from "dayjs";
import { useEffect, useState } from "react";
import { type AnalyticsSummary, getAnalyticsSeries, getAnalyticsSummary, type TimeSeriesPoint } from "src/api/backend";
import { getPollingInterval, isPollingAllowed } from "src/hooks/pollingPolicy";

type ChartSeriesPoint = TimeSeriesPoint & { timeDisplay: string };

const canPoll = () =>
	isPollingAllowed({ isDocumentVisible: document.visibilityState === "visible", isOnline: navigator.onLine });

export const useAnalyticsData = (selectedHostId: string, range: string) => {
	const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
	const [series, setSeries] = useState<ChartSeriesPoint[]>([]);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		let cancelled = false;
		let latestRequestId = 0;
		let timeout: ReturnType<typeof setTimeout> | undefined;

		const clearScheduledFetch = () => {
			if (timeout !== undefined) {
				clearTimeout(timeout);
				timeout = undefined;
			}
		};

		const fetchData = async (): Promise<boolean | undefined> => {
			if (!selectedHostId) return undefined;
			const requestId = ++latestRequestId;
			setLoading(true);
			try {
				const hostId = Number.parseInt(selectedHostId, 10);
				const summaryData = await getAnalyticsSummary(hostId, range);
				if (cancelled || requestId !== latestRequestId) return undefined;
				setSummary(summaryData);

				const seriesData = await getAnalyticsSeries(hostId, range);
				if (cancelled || requestId !== latestRequestId) return undefined;
				setSeries(
					seriesData.map((point) => ({
						...point,
						timeDisplay: dayjs(point.timestamp).format("HH:mm"),
					})),
				);
				return true;
			} catch (error) {
				if (!cancelled && requestId === latestRequestId) {
					console.error("Failed to fetch analytics:", error);
				}
				return false;
			} finally {
				if (!cancelled && requestId === latestRequestId) {
					setLoading(false);
				}
			}
		};

		const scheduleNextFetch = (failureCount: number) => {
			clearScheduledFetch();
			const interval = getPollingInterval({
				baseIntervalMs: 10_000,
				failureCount,
				isDocumentVisible: document.visibilityState === "visible",
				isOnline: navigator.onLine,
			});
			if (interval !== false) {
				timeout = setTimeout(() => {
					void fetchAndSchedule(failureCount);
				}, interval);
			}
		};

		const fetchAndSchedule = async (failureCount: number) => {
			if (!canPoll()) return;
			const succeeded = await fetchData();
			if (!cancelled && succeeded !== undefined) {
				scheduleNextFetch(succeeded ? 0 : failureCount + 1);
			}
		};

		const fetchIfEligible = () => {
			clearScheduledFetch();
			if (canPoll()) void fetchAndSchedule(0);
		};
		const cancelPendingRequest = () => {
			latestRequestId += 1;
			clearScheduledFetch();
		};

		const handleVisibilityChange = () => {
			if (canPoll()) {
				fetchIfEligible();
			} else {
				cancelPendingRequest();
			}
		};
		const handleOnline = () => fetchIfEligible();
		const handleOffline = () => cancelPendingRequest();

		fetchIfEligible();

		document.addEventListener("visibilitychange", handleVisibilityChange);
		window.addEventListener("online", handleOnline);
		window.addEventListener("offline", handleOffline);
		return () => {
			cancelled = true;
			clearScheduledFetch();
			document.removeEventListener("visibilitychange", handleVisibilityChange);
			window.removeEventListener("online", handleOnline);
			window.removeEventListener("offline", handleOffline);
		};
	}, [selectedHostId, range]);

	return { loading, series, summary };
};
