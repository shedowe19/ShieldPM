import type { ReactTable, RowData } from "@tanstack/react-table";
import { TableCell, TableRow } from "src/components/ui/table";
import type { shieldTableFeatures } from "./tableFeatures";

interface Props<TFields extends RowData> {
	tableInstance: ReactTable<typeof shieldTableFeatures, TFields>;
}
function EmptyRow<TFields extends RowData>({ tableInstance }: Props<TFields>) {
	return (
		<TableRow>
			<TableCell colSpan={tableInstance.getVisibleFlatColumns().length} className="h-24 text-center">
				The are no items
			</TableCell>
		</TableRow>
	);
}

export { EmptyRow };
