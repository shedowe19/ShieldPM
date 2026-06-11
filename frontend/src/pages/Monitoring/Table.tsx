import { IconDotsVertical, IconEdit, IconHeartbeat, IconPlayerPlay, IconTrash } from "@tabler/icons-react";
import { createColumnHelper, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useMemo } from "react";
import type { Monitor } from "src/api/backend";
import { EmptyData } from "src/components";
import { HasPermission } from "src/components/HasPermission";
import { TableLayout } from "src/components/Table/TableLayout";
import { Badge } from "src/components/ui/badge";
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
import { MANAGE, MONITORING } from "src/modules/Permissions";
import { AUDIT_LOG_OBJECT_TYPE } from "src/types/enums";

interface Props {
	data: Monitor[];
	isFiltered?: boolean;
	isFetching?: boolean;
	onEdit?: (id: number) => void;
	onDelete?: (id: number) => void;
	onNew?: () => void;
	onTest?: (id: number) => void;
}

const statusVariant = (status: Monitor["status"]) => {
	if (status === "up") return "success";
	if (status === "degraded") return "warning";
	if (status === "down") return "destructive";
	return "secondary";
};

export default function Table({ data, isFetching, onEdit, onDelete, onNew, onTest, isFiltered }: Props) {
	const columnHelper = createColumnHelper<Monitor>();
	const columns = useMemo(
		() => [
			columnHelper.accessor((row) => row, {
				id: "icon",
				cell: () => <IconHeartbeat size={24} className="text-muted-foreground" />,
				meta: { className: "w-[50px]" },
			}),
			columnHelper.accessor("name", {
				id: "name",
				header: intl.formatMessage({ id: "column.name" }),
				cell: (info) => <div className="font-medium">{info.getValue()}</div>,
			}),
			columnHelper.accessor("url", {
				id: "url",
				header: intl.formatMessage({ id: "monitoring.url" }),
				cell: (info) => <span className="font-mono text-xs break-all">{info.getValue()}</span>,
			}),
			columnHelper.accessor("status", {
				id: "status",
				header: intl.formatMessage({ id: "monitoring.status" }),
				cell: (info) => (
					<Badge variant={statusVariant(info.getValue())}>
						{intl.formatMessage({ id: `monitoring.status.${info.getValue()}` })}
					</Badge>
				),
			}),
			columnHelper.accessor("lastLatencyMs", {
				id: "lastLatencyMs",
				header: intl.formatMessage({ id: "monitoring.latency" }),
				cell: (info) => {
					const value = info.getValue();
					return value || value === 0 ? (
						<span>{value} ms</span>
					) : (
						<span className="text-muted-foreground">-</span>
					);
				},
			}),
			columnHelper.accessor("lastHttpStatus", {
				id: "lastHttpStatus",
				header: intl.formatMessage({ id: "monitoring.http-status" }),
				cell: (info) => info.getValue() ?? <span className="text-muted-foreground">-</span>,
			}),
			columnHelper.accessor("lastCheckedOn", {
				id: "lastCheckedOn",
				header: intl.formatMessage({ id: "monitoring.last-check" }),
				cell: (info) => {
					const value = info.getValue();
					return value ? (
						<span className="text-xs">{new Date(value).toLocaleString()}</span>
					) : (
						<span className="text-muted-foreground">-</span>
					);
				},
			}),
			columnHelper.display({
				id: "actions",
				cell: (info) => (
					<HasPermission section={MONITORING} permission={MANAGE} hideError>
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button variant="ghost" className="h-8 w-8 p-0">
									<span className="sr-only">
										<T id="sr.open-menu" />
									</span>
									<IconDotsVertical className="h-4 w-4" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								<DropdownMenuLabel>
									<T id="actions" />
								</DropdownMenuLabel>
								<DropdownMenuItem onClick={() => onTest?.(info.row.original.id)}>
									<IconPlayerPlay className="mr-2 h-4 w-4" />
									<T id="monitoring.test-now" />
								</DropdownMenuItem>
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
		[columnHelper, onEdit, onDelete, onTest],
	);

	const tableInstance = useReactTable<Monitor>({
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
					object={intl.formatMessage({ id: AUDIT_LOG_OBJECT_TYPE.MONITOR })}
					objects="monitors"
					onNew={onNew}
					isFiltered={isFiltered}
					color="green"
				/>
			}
		/>
	);
}
