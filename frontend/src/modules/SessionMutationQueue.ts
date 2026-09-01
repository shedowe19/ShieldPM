let sessionMutationTail: Promise<void> = Promise.resolve();

export function serializeSessionMutation<T>(mutation: () => Promise<T>): Promise<T> {
	const result = sessionMutationTail.catch(() => undefined).then(mutation);
	sessionMutationTail = result.then(
		() => undefined,
		() => undefined,
	);
	return result;
}
