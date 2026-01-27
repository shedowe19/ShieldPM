export interface TablePagination {
	limit: number;
	offset: number;
	total: number;
}

export interface TableSortBy {
	id: string;
	desc: boolean;
}

export interface TableFilter {
	id: string;
	value: unknown;
}

const tableEvents = {
	FILTERS_CHANGED: "FILTERS_CHANGED",
	PAGE_CHANGED: "PAGE_CHANGED",
	PAGE_SIZE_CHANGED: "PAGE_SIZE_CHANGED",
	TOTAL_COUNT_CHANGED: "TOTAL_COUNT_CHANGED",
	SORT_CHANGED: "SORT_CHANGED",
} as const;

interface TableState {
	limit: number;
	offset: number;
	total: number;
	sortBy?: TableSortBy;
	filters?: TableFilter[];
}

type TableAction =
	| { type: typeof tableEvents.PAGE_CHANGED; payload: number }
	| { type: typeof tableEvents.PAGE_SIZE_CHANGED; payload: number }
	| { type: typeof tableEvents.TOTAL_COUNT_CHANGED; payload: number }
	| { type: typeof tableEvents.SORT_CHANGED; payload: TableSortBy }
	| { type: typeof tableEvents.FILTERS_CHANGED; payload: TableFilter[] };

const tableEventReducer = (state: TableState, action: TableAction): TableState => {
	const { type, payload } = action;
	let offset = state.offset;
	switch (type) {
		case tableEvents.PAGE_CHANGED:
			return {
				...state,
				offset: (payload as number) * state.limit,
			};
		case tableEvents.PAGE_SIZE_CHANGED:
			return {
				...state,
				limit: payload as number,
			};
		case tableEvents.TOTAL_COUNT_CHANGED:
			return {
				...state,
				total: payload as number,
			};
		case tableEvents.SORT_CHANGED:
			return {
				...state,
				sortBy: payload as TableSortBy,
			};
		case tableEvents.FILTERS_CHANGED: {
			const filters = payload as TableFilter[];
			if (state.filters !== filters) {
				// this actually was a legit change
				// sets to page 1 when filter is modified
				offset = 0;
			}
			return {
				...state,
				filters,
				offset,
			};
		}
		default:
			throw new Error(`Unhandled action type: ${(action as { type: string }).type}`);
	}
};

export { tableEvents, tableEventReducer };
