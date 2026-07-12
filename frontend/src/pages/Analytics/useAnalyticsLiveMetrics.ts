import { useEffect, useState } from "react";
import { type DbStats, getDbStats } from "src/api/backend";
import { getAnalyticsStatus } from "src/api/backend/getAnalyticsStatus";
import { getPollingInterval, isPollingAllowed } from "src/hooks/pollingPolicy";

const canPoll = () =>
	isPollingAllowed({ isDocumentVisible: document.visibilityState === "visible", isOnline: navigator.onLine });

const LIVE_STATUS_INTERVAL_MS = 2_000;
const DB_STATS_INTERVAL_MS = 30_000;

export const useAnalyticsLiveMetrics = () => {
	const [networkSpeed, setNetworkSpeed] = useState(0);
	const [dbStats, setDbStats] = useState<DbStats | null>(null);

	useEffect(() => {
		let cancelled = false;
		let latestLiveRequestId = 0;
		let latestDbStatsRequestId = 0;
		let liveRequestInFlight: number | undefined;
		let dbStatsRequestInFlight: number | undefined;
		let liveTimeout: ReturnType<typeof setTimeout> | undefined;
		let dbStatsTimeout: ReturnType<typeof setTimeout> | undefined;

		const clearScheduledLiveFetch = () => {
			if (liveTimeout !== undefined) {
				clearTimeout(liveTimeout);
				liveTimeout = undefined;
			}
		};
		const clearScheduledDbStatsFetch = () => {
			if (dbStatsTimeout !== undefined) {
				clearTimeout(dbStatsTimeout);
				dbStatsTimeout = undefined;
			}
		};

		const fetchNetworkSpeed = async (): Promise<boolean | undefined> => {
			if (liveRequestInFlight !== undefined) return;
			const requestId = ++latestLiveRequestId;
			liveRequestInFlight = requestId;
			try {
				const data = await getAnalyticsStatus();
				if (cancelled || requestId !== latestLiveRequestId) return;
				setNetworkSpeed(data.totalSec || 0);
				return true;
			} catch (_err) {
				// quiet failure
				if (cancelled || requestId !== latestLiveRequestId) return;
				return false;
			} finally {
				if (liveRequestInFlight === requestId) {
					liveRequestInFlight = undefined;
				}
			}
		};

		const fetchDbStatistics = async (): Promise<boolean | undefined> => {
			if (dbStatsRequestInFlight !== undefined) return;
			const requestId = ++latestDbStatsRequestId;
			dbStatsRequestInFlight = requestId;
			try {
				const data = await getDbStats();
				if (cancelled || requestId !== latestDbStatsRequestId) return;
				setDbStats(data);
				return true;
			} catch (_err) {
				// quiet failure
				if (cancelled || requestId !== latestDbStatsRequestId) return;
				return false;
			} finally {
				if (dbStatsRequestInFlight === requestId) {
					dbStatsRequestInFlight = undefined;
				}
			}
		};

		const scheduleNextLiveFetch = (failureCount: number) => {
			clearScheduledLiveFetch();
			const interval = getPollingInterval({
				baseIntervalMs: LIVE_STATUS_INTERVAL_MS,
				failureCount,
				isDocumentVisible: document.visibilityState === "visible",
				isOnline: navigator.onLine,
			});
			if (interval !== false) {
				liveTimeout = setTimeout(() => {
					void fetchNetworkSpeedAndSchedule(failureCount);
				}, interval);
			}
		};

		const scheduleNextDbStatsFetch = (failureCount: number) => {
			clearScheduledDbStatsFetch();
			const interval = getPollingInterval({
				baseIntervalMs: DB_STATS_INTERVAL_MS,
				failureCount,
				isDocumentVisible: document.visibilityState === "visible",
				isOnline: navigator.onLine,
				maxIntervalMs: DB_STATS_INTERVAL_MS * 8,
			});
			if (interval !== false) {
				dbStatsTimeout = setTimeout(() => {
					void fetchDbStatisticsAndSchedule(failureCount);
				}, interval);
			}
		};

		const fetchNetworkSpeedAndSchedule = async (failureCount: number) => {
			if (!canPoll()) return;
			const succeeded = await fetchNetworkSpeed();
			if (!cancelled && succeeded !== undefined) {
				scheduleNextLiveFetch(succeeded ? 0 : failureCount + 1);
			}
		};

		const fetchDbStatisticsAndSchedule = async (failureCount: number) => {
			if (!canPoll()) return;
			const succeeded = await fetchDbStatistics();
			if (!cancelled && succeeded !== undefined) {
				scheduleNextDbStatsFetch(succeeded ? 0 : failureCount + 1);
			}
		};

		const fetchIfEligible = () => {
			clearScheduledLiveFetch();
			clearScheduledDbStatsFetch();
			if (canPoll()) {
				void fetchNetworkSpeedAndSchedule(0);
				void fetchDbStatisticsAndSchedule(0);
			}
		};
		const cancelPendingRequest = () => {
			latestLiveRequestId += 1;
			latestDbStatsRequestId += 1;
			liveRequestInFlight = undefined;
			dbStatsRequestInFlight = undefined;
			clearScheduledLiveFetch();
			clearScheduledDbStatsFetch();
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
			liveRequestInFlight = undefined;
			dbStatsRequestInFlight = undefined;
			clearScheduledLiveFetch();
			clearScheduledDbStatsFetch();
			document.removeEventListener("visibilitychange", handleVisibilityChange);
			window.removeEventListener("online", handleOnline);
			window.removeEventListener("offline", handleOffline);
		};
	}, []);

	return { dbStats, networkSpeed };
};
