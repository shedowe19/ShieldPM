import type { Table as ReactTable } from "@tanstack/react-table";
import { Table } from "src/components/ui/table";
import { TableBody } from "./TableBody";
import { TableHeader } from "./TableHeader";

interface TableLayoutProps<TFields> {
	tableInstance: ReactTable<TFields>;
	emptyState?: React.ReactNode;
	extraStyles?: {
		row: (rowData: TFields) => React.HTMLAttributes<HTMLTableRowElement> | undefined;
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
