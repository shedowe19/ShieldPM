import type { ReactTable, RowData } from "@tanstack/react-table";
import { Table } from "src/components/ui/table";
import { TableBody } from "./TableBody";
import { TableHeader } from "./TableHeader";
import type { shieldTableFeatures } from "./tableFeatures";

interface TableLayoutProps<TFields extends RowData> {
	tableInstance: ReactTable<typeof shieldTableFeatures, TFields>;
	emptyState?: React.ReactNode;
	extraStyles?: {
		row: (rowData: TFields) => React.HTMLAttributes<HTMLTableRowElement> | undefined;
	};
}
function TableLayout<TFields extends RowData>(props: TableLayoutProps<TFields>) {
	return (
		<div className="rounded-md border">
			<Table>
				<TableHeader tableInstance={props.tableInstance} />
				<TableBody {...props} />
			</Table>
		</div>
	);
}

import React from "react";

const MemoizedTableLayout = React.memo(TableLayout) as typeof TableLayout;

export { MemoizedTableLayout as TableLayout, type TableLayoutProps };
