import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { useMemo } from "react";
import {
	type AnalyticsSummary,
	type DbStats,
	getAnalyticsSeries,
	getAnalyticsSummary,
	type TimeSeriesPoint,
} from "src/api/backend";

interface AnalyticsStatus {
	rx_sec: number;
	tx_sec: number;
	total_sec: number;
}

const getAnalyticsStatus = async (): Promise<AnalyticsStatus> => {
	const response = await fetch("/api/analytics/status");
	if (!response.ok) {
		throw new Error("Failed to fetch analytics status");
	}
	return response.json();
};

export const useAnalyticsDashboard = (hostId?: number, range = "24h", enabled = true) => {
	const summaryQuery = useQuery<AnalyticsSummary>({
		queryKey: ["analytics", "summary", hostId, range],
		queryFn: () => getAnalyticsSummary(hostId, range),
		enabled,
		refetchInterval: enabled ? 30_000 : false,
	});

	const seriesQuery = useQuery<TimeSeriesPoint[]>({
		queryKey: ["analytics", "series", hostId, range],
		queryFn: () => getAnalyticsSeries(hostId, range),
		enabled,
		refetchInterval: enabled ? 30_000 : false,
	});

	const statusQuery = useQuery<AnalyticsStatus>({
		queryKey: ["analytics", "status"],
		queryFn: getAnalyticsStatus,
		enabled,
		refetchInterval: enabled ? 10_000 : false,
		staleTime: 5_000,
	});

	const dbStatsQuery = useQuery<DbStats>({
		queryKey: ["analytics", "db-stats"],
		queryFn: () =>
			fetch("/api/analytics/db-stats").then((res) => {
				if (!res.ok) throw new Error("Failed to fetch DB stats");
				return res.json();
			}),
		enabled,
		refetchInterval: enabled ? 30_000 : false,
		staleTime: 15_000,
	});

	const formattedSeries = useMemo<(TimeSeriesPoint & { timeDisplay: string })[]>(() => {
		return (seriesQuery.data || []).map((item) => ({
			...item,
			timeDisplay: dayjs(item.timestamp).format(range === "30d" || range === "7d" ? "DD.MM" : "HH:mm"),
		}));
	}, [seriesQuery.data, range]);

	return {
		summary: summaryQuery.data ?? null,
		series: formattedSeries,
		networkSpeed: statusQuery.data?.total_sec ?? 0,
		dbStats: dbStatsQuery.data ?? null,
		isLoading: summaryQuery.isLoading || seriesQuery.isLoading,
		isFetching: summaryQuery.isFetching || seriesQuery.isFetching,
		isError: summaryQuery.isError || seriesQuery.isError || statusQuery.isError || dbStatsQuery.isError,
	};
};
