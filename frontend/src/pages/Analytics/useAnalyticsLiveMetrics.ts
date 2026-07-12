import { useEffect, useState } from "react";
import { type DbStats, getDbStats } from "src/api/backend";
import { getAnalyticsStatus } from "src/api/backend/getAnalyticsStatus";
import { getPollingInterval, isPollingAllowed } from "src/hooks/pollingPolicy";

const canPoll = () =>
	isPollingAllowed({ isDocumentVisible: document.visibilityState === "visible", isOnline: navigator.onLine });

export const useAnalyticsLiveMetrics = () => {
	const [networkSpeed, setNetworkSpeed] = useState(0);
	const [dbStats, setDbStats] = useState<DbStats | null>(null);

	useEffect(() => {
		let cancelled = false;
		let latestRequestId = 0;
		let liveRequestInFlight: number | undefined;
		let timeout: ReturnType<typeof setTimeout> | undefined;

		const clearScheduledFetch = () => {
			if (timeout !== undefined) {
				clearTimeout(timeout);
				timeout = undefined;
			}
		};

		const fetchLiveParams = async (): Promise<boolean | undefined> => {
			if (liveRequestInFlight !== undefined) return;
			const requestId = ++latestRequestId;
			liveRequestInFlight = requestId;
			let succeeded = true;
			try {
				try {
					const data = await getAnalyticsStatus();
					if (cancelled || requestId !== latestRequestId) return;
					setNetworkSpeed(data.totalSec || 0);
				} catch (_err) {
					// quiet failure
					succeeded = false;
				}

				if (cancelled || requestId !== latestRequestId) return;

				try {
					const data = await getDbStats();
					if (cancelled || requestId !== latestRequestId) return;
					setDbStats(data);
				} catch (_err) {
					// quiet failure
					succeeded = false;
				}

				if (cancelled || requestId !== latestRequestId) return;
				return succeeded;
			} finally {
				if (liveRequestInFlight === requestId) {
					liveRequestInFlight = undefined;
				}
			}
		};

		const scheduleNextFetch = (failureCount: number) => {
			clearScheduledFetch();
			const interval = getPollingInterval({
				baseIntervalMs: 2_000,
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
			const succeeded = await fetchLiveParams();
			if (!cancelled && succeeded !== undefined) {
				scheduleNextFetch(succeeded ? 0 : failureCount + 1);
			}
		};

		const fetchIfEligible = () => {
			clearScheduledFetch();
			if (canPoll()) {
				void fetchAndSchedule(0);
			}
		};
		const cancelPendingRequest = () => {
			latestRequestId += 1;
			liveRequestInFlight = undefined;
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
			liveRequestInFlight = undefined;
			clearScheduledFetch();
			document.removeEventListener("visibilitychange", handleVisibilityChange);
			window.removeEventListener("online", handleOnline);
			window.removeEventListener("offline", handleOffline);
		};
	}, []);

	return { dbStats, networkSpeed };
};
