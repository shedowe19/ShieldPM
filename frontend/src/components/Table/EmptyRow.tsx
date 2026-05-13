import type { Table as ReactTable } from "@tanstack/react-table";
import { TableCell, TableRow } from "src/components/ui/table";
import { T } from "src/locale";

interface Props {
	tableInstance: ReactTable<unknown>;
}
function EmptyRow({ tableInstance }: Props) {
	return (
		<TableRow>
			<TableCell colSpan={tableInstance.getVisibleFlatColumns().length} className="h-24 text-center">
				<T id="object.empty" tData={{ objects: "items" }} />
			</TableCell>
		</TableRow>
	);
}

export { EmptyRow };
