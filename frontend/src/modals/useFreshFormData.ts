import { useEffect, useState } from "react";

interface FormQuery<T> {
	data: T | undefined;
	isLoading: boolean;
	isFetching?: boolean;
	error: Error | null;
}

// Callers revalidate on mount. Once the opening request succeeds, keep the
// form's source stable so background refreshes cannot replace an open draft.
export function useFreshFormData<T>(id: number | string, query: FormQuery<T>) {
	const settled = !query.isLoading && !query.isFetching && !query.error;
	const [snapshot, setSnapshot] = useState<{ id: number | string; data: T | undefined }>(() => ({
		id,
		data: settled ? query.data : undefined,
	}));
	const data = snapshot.id === id ? snapshot.data : undefined;

	useEffect(() => {
		if (data === undefined && settled && query.data !== undefined) {
			setSnapshot({ id, data: query.data });
		}
	}, [data, id, query.data, settled]);

	return {
		data,
		isLoading: data === undefined && !query.error,
		error: data === undefined ? query.error : null,
	};
}
