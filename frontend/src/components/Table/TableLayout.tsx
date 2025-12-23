import type { Table as ReactTable } from "@tanstack/react-table";
import { TableBody } from "./TableBody";
import { TableHeader } from "./TableHeader";
import { Table } from "src/components/ui/table";

interface TableLayoutProps<TFields> {
	tableInstance: ReactTable<TFields>;
	emptyState?: React.ReactNode;
	extraStyles?: {
		row: (rowData: TFields) => any | undefined;
	};
}
function TableLayout<TFields>(props: TableLayoutProps<TFields>) {

	return (
		<div className="rounded-md border">
			<Table>
				<TableHeader tableInstance={props.tableInstance} />
				<TableBody {...props} />
			</Table>
		</div>
	);
}

export { TableLayout, type TableLayoutProps };


