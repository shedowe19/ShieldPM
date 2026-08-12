import { columnVisibilityFeature, tableFeatures } from "@tanstack/react-table";

const shieldTableFeatures = tableFeatures({
	columnMeta: {} as { className?: string },
	columnVisibilityFeature,
	tableMeta: {} as { isFetching?: boolean },
});

export { shieldTableFeatures };
