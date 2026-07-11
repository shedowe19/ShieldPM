interface PollingIntervalOptions {
	baseIntervalMs: number;
	failureCount: number;
	isDocumentVisible: boolean;
	isOnline: boolean;
	maxIntervalMs?: number;
}

export const getPollingInterval = ({
	baseIntervalMs,
	failureCount,
	isDocumentVisible,
	isOnline,
	maxIntervalMs = baseIntervalMs * 8,
}: PollingIntervalOptions): number | false => {
	if (!isDocumentVisible || !isOnline) {
		return false;
	}

	const backoffMultiplier = 2 ** Math.max(0, failureCount);
	return Math.min(baseIntervalMs * backoffMultiplier, maxIntervalMs);
};
