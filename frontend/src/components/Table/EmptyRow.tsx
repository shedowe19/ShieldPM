import type { Table as ReactTable } from "@tanstack/react-table";
import { TableRow, TableCell } from "src/components/ui/table";

interface Props {
	tableInstance: ReactTable<any>;
}
function EmptyRow({ tableInstance }: Props) {
	return (
		<TableRow>
			<TableCell colSpan={tableInstance.getVisibleFlatColumns().length} className="h-24 text-center">
				The are no items
			</TableCell>
		</TableRow>
	);
}

export { EmptyRow };
