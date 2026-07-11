import { fromUnixTime, intlFormat, parseISO } from "date-fns";

const MAX_UNIX_SECONDS = 32503680000;
const MAX_UNIX_MILLISECONDS = MAX_UNIX_SECONDS * 1000;

const isUnixTimestamp = (value: unknown): boolean => {
	if (typeof value !== "number" && typeof value !== "string") return false;
	const num = Number(value);
	if (!Number.isFinite(num)) return false;
	// Check plausible Unix timestamp range: from 1970 to ~year 3000
	// Prefer seconds through the supported range; larger values are milliseconds.
	if (num > 0 && num <= MAX_UNIX_SECONDS) return true;
	if (num > MAX_UNIX_SECONDS && num <= MAX_UNIX_MILLISECONDS) return true;
	return false;
};

const parseDate = (value: string | number): Date | null => {
	if (typeof value !== "number" && typeof value !== "string") return null;
	try {
		const timestamp = Number(value);
		if (isUnixTimestamp(timestamp)) {
			return fromUnixTime(timestamp > MAX_UNIX_SECONDS ? timestamp / 1000 : timestamp);
		}
		return parseISO(`${value}`);
	} catch {
		return null;
	}
};

const formatDateTime = (value: string | number): string => {
	const d = parseDate(value);
	if (!d) return `${value}`;
	try {
		return intlFormat(d, {
			weekday: "long",
			year: "numeric",
			month: "numeric",
			day: "numeric",
			hour: "numeric",
			minute: "numeric",
			second: "numeric",
			hour12: false,
		});
	} catch {
		return `${value}`;
	}
};

export { formatDateTime, isUnixTimestamp, parseDate };
