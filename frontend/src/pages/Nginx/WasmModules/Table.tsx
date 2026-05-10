import { IconDotsVertical, IconEdit, IconTrash } from "@tabler/icons-react";
import { createColumnHelper, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useMemo } from "react";
import type { WasmModule } from "src/api/backend/models";
import { EmptyData, HasPermission, UserAvatar, ValueWithDateFormatter } from "src/components";
import { TableLayout } from "src/components/Table/TableLayout";
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
import { MANAGE, PROXY_HOSTS } from "src/modules/Permissions";
import { AUDIT_LOG_OBJECT_TYPE } from "src/types/enums";

interface Props {
	data: WasmModule[];
	isFiltered?: boolean;
	isFetching?: boolean;
	onEdit?: (id: number) => void;
	onDelete?: (id: number) => void;
	onNew?: () => void;
}
export default function Table({ data, isFetching, isFiltered, onEdit, onDelete, onNew }: Props) {
	const columnHelper = createColumnHelper<WasmModule>();
	const columns = useMemo(
		() => [
			columnHelper.accessor("owner", {
				id: "owner",
				cell: (info) => {
					const value = info.getValue();
					return <UserAvatar url={value ? value.avatar : ""} name={value ? value.name : ""} />;
				},
				meta: {
					className: "w-1",
				},
			}),
			columnHelper.accessor((row) => row, {
				id: "name",
				header: intl.formatMessage({ id: "column.name" }),
				cell: (info) => (
					<ValueWithDateFormatter value={info.getValue().name} createdOn={info.getValue().createdOn} />
				),
			}),
			columnHelper.accessor("description", {
				id: "description",
				header: "Description",
				cell: (info) => info.getValue() || "-",
			}),
			columnHelper.accessor("file_name", {
				id: "file_name",
				header: "File",
				cell: (info) => <span className="font-mono text-xs">{info.getValue()}</span>,
			}),
			columnHelper.display({
				id: "id",
				cell: (info) => {
					return (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button variant="ghost" className="h-8 w-8 p-0">
									<span className="sr-only">Open menu</span>
									<IconDotsVertical className="h-4 w-4" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								<DropdownMenuLabel>
									<T
										id="object.actions-title"
										tData={{ object: AUDIT_LOG_OBJECT_TYPE.WASM_MODULE }}
										data={{ id: info.row.original.id }}
									/>
								</DropdownMenuLabel>
								<DropdownMenuItem
									onClick={() => info.row.original.id && onEdit?.(info.row.original.id)}
								>
									<IconEdit className="mr-2 h-4 w-4" />
									<T id="action.edit" />
								</DropdownMenuItem>
								<HasPermission section={PROXY_HOSTS} permission={MANAGE} hideError>
									<DropdownMenuSeparator />
									<DropdownMenuItem
										className="text-red-600 focus:text-red-500"
										onClick={() => info.row.original.id && onDelete?.(info.row.original.id)}
									>
										<IconTrash className="mr-2 h-4 w-4" />
										<T id="action.delete" />
									</DropdownMenuItem>
								</HasPermission>
							</DropdownMenuContent>
						</DropdownMenu>
					);
				},
				meta: {
					className: "text-end w-1",
				},
			}),
		],
		[columnHelper, onEdit, onDelete],
	);

	const tableInstance = useReactTable<WasmModule>({
		columns,
		data,
		getCoreRowModel: getCoreRowModel(),
		rowCount: data.length,
		meta: {
			isFetching,
		},
		enableSortingRemoval: false,
	});

	return (
		<TableLayout
			tableInstance={tableInstance}
			emptyState={
				<EmptyData
					object={AUDIT_LOG_OBJECT_TYPE.WASM_MODULE}
					objects="WASM Modules"
					onNew={onNew}
					isFiltered={isFiltered}
					color="cyan"
					permissionSection={PROXY_HOSTS}
				/>
			}
		/>
	);
}
