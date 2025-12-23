import type { TableLayoutProps } from "src/components";
import { TableHeader as ShadcnTableHeader, TableRow, TableHead } from "src/components/ui/table";

function TableHeader<T>(props: TableLayoutProps<T>) {
	const { tableInstance } = props;
	const headerGroups = tableInstance.getHeaderGroups();

	return (
		<ShadcnTableHeader>
			{headerGroups.map((headerGroup) => (
				<TableRow key={headerGroup.id}>
					{headerGroup.headers.map((header) => {
						const { column } = header;
						const { className } = (column.columnDef.meta as any) ?? {};
						return (
							<TableHead key={header.id} className={className}>
								{typeof column.columnDef.header === "string" ? `${column.columnDef.header}` : null}
							</TableHead>
						);
					})}
				</TableRow>
			))}
		</ShadcnTableHeader>
	);
}

export { TableHeader };
