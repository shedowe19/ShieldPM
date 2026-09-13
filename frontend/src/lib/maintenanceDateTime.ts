/** Display an API timestamp in the browser's timezone for a datetime-local input. */
export function formatMaintenanceDateTime(value?: string | null): string {
	if (!value) return "";
	const date = new Date(value);
	if (!Number.isFinite(date.getTime())) return "";
	const pad = (part: number) => String(part).padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** Preserve the chosen instant across browser/server timezones; null clears a schedule. */
export function serializeMaintenanceDateTime(value?: string | null): string | null | undefined {
	if (value === undefined) return undefined;
	if (!value) return null;
	return new Date(value).toISOString();
}
