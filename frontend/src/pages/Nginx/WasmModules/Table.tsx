import { IconDotsVertical, IconEdit, IconTrash } from "@tabler/icons-react";
import { createColumnHelper, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useMemo } from "react";
import type { WasmModule } from "src/api/backend";
import { EmptyData, UserAvatar } from "src/components";
import { HasPermission } from "src/components/HasPermission";
import { TableLayout } from "src/components/Table/TableLayout";
import { DateFormatter } from "src/components/Table/Formatter/DateFormatter";
import { Button } from "src/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "src/components/ui/dropdown-menu";
import { intl, T } from "src/locale";
import { MANAGE, SETTINGS } from "src/modules/Permissions";
import { AUDIT_LOG_OBJECT_TYPE } from "src/types/enums";

interface Props {
	data: WasmModule[];
	isFiltered?: boolean;
	isFetching?: boolean;
	onEdit?: (id: number) => void;
	onDelete?: (id: number) => void;
	onNew?: () => void;
}

export default function Table({ data, isFetching, onEdit, onDelete, onNew, isFiltered }: Props) {
	const columnHelper = createColumnHelper<WasmModule>();

	const columns = useMemo(
		() => [
			columnHelper.accessor("owner", {
				id: "owner",
				header: "",
				cell: (info) => {
					const owner = info.getValue();
					return <UserAvatar url={owner?.avatar} name={owner?.name} />;
				},
				meta: { className: "w-[50px]" },
			}),
			columnHelper.accessor("name", {
				id: "name",
				header: intl.formatMessage({ id: "column.name" }),
				cell: (info) => <div className="font-medium">{info.getValue()}</div>,
			}),
			columnHelper.accessor("description", {
				id: "description",
				header: intl.formatMessage({ id: "details" }),
				cell: (info) => <span className="text-muted-foreground text-sm">{info.getValue() || "—"}</span>,
			}),
			columnHelper.accessor("filename", {
				id: "filename",
				header: intl.formatMessage({ id: "name" }),
				cell: (info) => (
					<span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{info.getValue()}</span>
				),
			}),
			columnHelper.accessor("createdOn", {
				id: "createdOn",
				header: intl.formatMessage({ id: "column.created" }),
				cell: (info) => <DateFormatter value={info.getValue()} />,
			}),
			columnHelper.display({
				id: "actions",
				cell: (info) => (
					<HasPermission section={SETTINGS} permission={MANAGE} hideError>
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button variant="ghost" className="h-8 w-8 p-0">
									<span className="sr-only">Open menu</span>
									<IconDotsVertical className="h-4 w-4" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								<DropdownMenuLabel>
									<T id="options" />
								</DropdownMenuLabel>
								<DropdownMenuItem onClick={() => onEdit?.(info.row.original.id)}>
									<IconEdit className="mr-2 h-4 w-4" />
									<T id="action.edit" />
								</DropdownMenuItem>
								<DropdownMenuSeparator />
								<DropdownMenuItem
									className="text-red-600 focus:text-red-500"
									onClick={() => onDelete?.(info.row.original.id)}
								>
									<IconTrash className="mr-2 h-4 w-4" />
									<T id="action.delete" />
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</HasPermission>
				),
				meta: { className: "text-end w-1" },
			}),
		],
		[columnHelper, onEdit, onDelete],
	);

	const tableInstance = useReactTable<WasmModule>({
		columns,
		data,
		getCoreRowModel: getCoreRowModel(),
		rowCount: data.length,
		meta: { isFetching },
		enableSortingRemoval: false,
	});

	return (
		<TableLayout
			tableInstance={tableInstance}
			emptyState={
				<EmptyData
					object={intl.formatMessage({ id: AUDIT_LOG_OBJECT_TYPE.WASM_MODULE })}
					objects="wasm-modules"
					onNew={onNew}
					isFiltered={isFiltered}
					color="violet"
					permissionSection={SETTINGS}
				/>
			}
		/>
	);
}
