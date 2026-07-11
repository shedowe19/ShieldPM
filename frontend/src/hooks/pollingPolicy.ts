interface PollingEnvironment {
	isDocumentVisible: boolean;
	isOnline: boolean;
}

interface PollingIntervalOptions extends PollingEnvironment {
	baseIntervalMs: number;
	failureCount: number;
	maxIntervalMs?: number;
}

export const isPollingAllowed = ({ isDocumentVisible, isOnline }: PollingEnvironment): boolean =>
	isDocumentVisible && isOnline;

export const getPollingInterval = ({
	baseIntervalMs,
	failureCount,
	isDocumentVisible,
	isOnline,
	maxIntervalMs = baseIntervalMs * 8,
}: PollingIntervalOptions): number | false => {
	if (!isPollingAllowed({ isDocumentVisible, isOnline })) {
		return false;
	}

	const backoffMultiplier = 2 ** Math.max(0, failureCount);
	return Math.min(baseIntervalMs * backoffMultiplier, maxIntervalMs);
};
