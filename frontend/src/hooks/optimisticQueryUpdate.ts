import type { QueryClient, QueryKey } from "@tanstack/react-query";

/** Update existing detail variants and roll back only data still owned by this mutation. */
export async function optimisticQueryUpdate<T>(
	queryClient: QueryClient,
	queryKey: QueryKey,
	update: (previous: T) => T,
): Promise<() => void> {
	const queries = queryClient.getQueryCache().findAll({ queryKey });
	await queryClient.cancelQueries({ queryKey });
	const snapshots = queries.flatMap((query) => {
		if (queryClient.getQueryCache().get(query.queryHash) !== query || query.state.data === undefined) return [];
		const previous = query.state.data as T;
		queryClient.setQueryData<T>(query.queryKey, update(previous));
		return [{ query, previous, updateCount: query.state.dataUpdateCount }];
	});

	return () => {
		for (const { query, previous, updateCount } of snapshots) {
			// A later fetch/mutation or a session cache clear takes precedence.
			if (
				queryClient.getQueryCache().get(query.queryHash) === query &&
				query.state.dataUpdateCount === updateCount
			) {
				queryClient.setQueryData(query.queryKey, previous);
			}
		}
	};
}
