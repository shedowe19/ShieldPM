import { IconDotsVertical, IconEdit, IconTrash } from "@tabler/icons-react";
import { createColumnHelper, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useMemo } from "react";
import type { AccessList } from "src/api/backend";
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
import { ACCESS_LISTS, MANAGE } from "src/modules/Permissions";
import { AUDIT_LOG_OBJECT_TYPE } from "src/types/enums";

interface Props {
	data: AccessList[];
	isFiltered?: boolean;
	isFetching?: boolean;
	onEdit?: (id: number) => void;
	onDelete?: (id: number) => void;
	onNew?: () => void;
}
export default function Table({ data, isFetching, isFiltered, onEdit, onDelete, onNew }: Props) {
	const columnHelper = createColumnHelper<AccessList>();
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
			columnHelper.accessor("items", {
				id: "items",
				header: intl.formatMessage({ id: "column.authorization" }),
				cell: (info) => <T id="access-list.auth-count" data={{ count: info.getValue()?.length || 0 }} />,
			}),
			columnHelper.accessor("clients", {
				id: "clients",
				header: intl.formatMessage({ id: "column.access" }),
				cell: (info) => <T id="access-list.access-count" data={{ count: info.getValue()?.length || 0 }} />,
			}),
			columnHelper.accessor("satisfyAny", {
				id: "satisfyAny",
				header: intl.formatMessage({ id: "column.satisfy" }),
				cell: (info) => <T id={info.getValue() ? "column.satisfy-any" : "column.satisfy-all"} />,
			}),
			columnHelper.accessor("proxyHostCount", {
				id: "proxyHostCount",
				header: intl.formatMessage({ id: "proxy-hosts" }),
				cell: (info) => <T id="proxy-hosts.count" data={{ count: info.getValue() || 0 }} />,
			}),
			columnHelper.display({
				id: "id",
				cell: (info) => {
					return (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									variant="ghost"
									className="h-8 w-8 p-0"
									aria-label={intl.formatMessage({ id: "sr.open-menu" })}
								>
									<IconDotsVertical className="h-4 w-4" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								<DropdownMenuLabel>
									<T
										id="object.actions-title"
										tData={{ object: AUDIT_LOG_OBJECT_TYPE.ACCESS_LIST }}
										data={{ id: info.row.original.id }}
									/>
								</DropdownMenuLabel>
								<DropdownMenuItem
									onClick={() => info.row.original.id && onEdit?.(info.row.original.id)}
								>
									<IconEdit className="mr-2 h-4 w-4" />
									<T id="action.edit" />
								</DropdownMenuItem>
								<HasPermission section={ACCESS_LISTS} permission={MANAGE} hideError>
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

	const tableInstance = useReactTable<AccessList>({
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
					object={AUDIT_LOG_OBJECT_TYPE.ACCESS_LIST}
					objects="access-lists"
					onNew={onNew}
					isFiltered={isFiltered}
					color="cyan"
					permissionSection={ACCESS_LISTS}
				/>
			}
		/>
	);
}
