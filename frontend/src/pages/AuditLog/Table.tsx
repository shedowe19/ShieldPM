import { IconListDetails } from "@tabler/icons-react";
import { createColumnHelper, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useMemo } from "react";
import type { AuditLog } from "src/api/backend";
import { EventFormatter, UserAvatar } from "src/components";
import { TableLayout } from "src/components/Table/TableLayout";
import { Button } from "src/components/ui/button";
import { intl, T } from "src/locale";

interface Props {
	data: AuditLog[];
	isFetching?: boolean;
	onSelectItem?: (id: number) => void;
}
export default function Table({ data, isFetching, onSelectItem }: Props) {
	const columnHelper = createColumnHelper<AuditLog>();
	const columns = useMemo(
		() => [
			columnHelper.accessor("user", {
				id: "user.avatar",
				cell: (info) => {
					const value = info.getValue();
					return <UserAvatar url={value ? value.avatar : ""} name={value ? value.name : ""} />;
				},
				meta: {
					className: "w-1",
				},
			}),
			columnHelper.accessor((row) => row, {
				id: "objectType",
				header: intl.formatMessage({ id: "column.event" }),
				cell: (info) => {
					return <EventFormatter row={info.getValue()} />;
				},
			}),
			columnHelper.display({
				id: "id",
				header: "",
				cell: (info) => {
					return (
						<div className="text-right">
							<Button
								variant="ghost"
								size="icon"
								aria-label={intl.formatMessage({ id: "action.view-details" })}
								onClick={(e) => {
									e.preventDefault();
									onSelectItem?.(info.row.original.id);
								}}
								className="h-8 w-8 text-muted-foreground hover:text-foreground"
							>
								<IconListDetails className="h-4 w-4" />
								<span className="sr-only">
									<T id="action.view-details" />
								</span>
							</Button>
						</div>
					);
				},
				meta: {
					className: "w-[50px]",
				},
			}),
		],
		[columnHelper, onSelectItem],
	);

	const tableInstance = useReactTable<AuditLog>({
		columns,
		data,
		getCoreRowModel: getCoreRowModel(),
		rowCount: data.length,
		meta: {
			isFetching,
		},
		enableSortingRemoval: false,
	});

	return <TableLayout tableInstance={tableInstance} />;
}
