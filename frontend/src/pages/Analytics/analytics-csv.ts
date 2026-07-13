import type { TimeSeriesPoint } from "src/api/backend";

interface AnalyticsCsvHeaders {
	bytes: string;
	requests: string;
	time: string;
}

const toCsvCell = (value: string | number | undefined) => {
	const text = String(value ?? "");
	const safeText = /^\s*[=+\-@]/.test(text) ? `'${text}` : text;
	return `"${safeText.replace(/"/g, '""')}"`;
};

export const createAnalyticsCsv = (series: TimeSeriesPoint[], headers: AnalyticsCsvHeaders) => {
	const rows = [
		[headers.time, headers.requests, headers.bytes, "2xx", "3xx", "4xx", "5xx"],
		...series.map((point) => [
			point.timestamp,
			point.count,
			point.bytes,
			point.s2xx,
			point.s3xx,
			point.s4xx,
			point.s5xx,
		]),
	];

	return rows.map((row) => row.map(toCsvCell).join(",")).join("\r\n");
};
