import { IconDotsVertical, IconEdit, IconTrash, IconWorld } from "@tabler/icons-react";
import { createColumnHelper, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useMemo } from "react";
import type { DdnsProvider } from "src/api/backend";
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
import { DDNS_PROVIDERS, MANAGE } from "src/modules/Permissions";
import { AUDIT_LOG_OBJECT_TYPE } from "src/types/enums";

interface Props {
	data: DdnsProvider[];
	isFiltered?: boolean;
	isFetching?: boolean;
	onEdit?: (id: number) => void;
	onDelete?: (id: number) => void;
	onNew?: () => void;
}

export default function Table({ data, isFetching, onEdit, onDelete, onNew, isFiltered }: Props) {
	const columnHelper = createColumnHelper<DdnsProvider>();
	const columns = useMemo(
		() => [
			columnHelper.accessor((row) => row, {
				id: "icon",
				cell: () => {
					return <IconWorld size={24} className="text-muted-foreground" />;
				},
				meta: {
					className: "w-[50px]",
				},
			}),
			columnHelper.accessor("name", {
				id: "name",
				header: intl.formatMessage({ id: "column.name" }),
				cell: (info) => <div className="font-medium">{info.getValue()}</div>,
			}),
			columnHelper.accessor("provider", {
				id: "provider",
				header: intl.formatMessage({ id: "ddns-providers.provider" }),
				cell: (info) => <Badge variant="outline">{info.getValue()}</Badge>,
			}),
			columnHelper.accessor("domains", {
				id: "domains",
				header: intl.formatMessage({ id: "ddns-providers.domains" }),
				cell: (info) => (
					<div className="flex flex-col gap-1">
						{info.getValue().map((d) => (
							<span key={d} className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded w-fit">
								{d}
							</span>
						))}
					</div>
				),
			}),
			columnHelper.accessor("lastIpv4", {
				id: "lastIpv4",
				header: "IPv4",
				cell: (info) => {
					const val = info.getValue();
					return val ? (
						<span className="font-mono text-xs">{val}</span>
					) : (
						<span className="text-muted-foreground">-</span>
					);
				},
			}),
			columnHelper.accessor("lastIpv6", {
				id: "lastIpv6",
				header: "IPv6",
				cell: (info) => {
					const val = info.getValue();
					return val ? (
						<span className="font-mono text-xs">{val}</span>
					) : (
						<span className="text-muted-foreground">-</span>
					);
				},
			}),
			columnHelper.accessor("lastUpdatedOn", {
				id: "lastUpdatedOn",
				header: "Updated",
				cell: (info) => {
					const val = info.getValue();
					return val ? (
						<span className="text-xs">{val}</span>
					) : (
						<span className="text-muted-foreground">-</span>
					);
				},
			}),
			columnHelper.accessor("lastError", {
				id: "lastError",
				header: "Status",
				cell: (info) => {
					const err = info.getValue();
					return err ? (
						<span className="text-xs text-red-500 font-medium" title={err}>
							Error
						</span>
					) : (
						<span className="text-xs text-green-500 font-medium">OK</span>
					);
				},
			}),
			columnHelper.display({
				id: "actions",
				cell: (info) => {
					return (
						<HasPermission section={DDNS_PROVIDERS} permission={MANAGE} hideError>
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
									<DropdownMenuLabel>Actions</DropdownMenuLabel>
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
					);
				},
				meta: {
					className: "text-end w-1",
				},
			}),
		],
		[columnHelper, onEdit, onDelete],
	);

	const tableInstance = useReactTable<DdnsProvider>({
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
					object={intl.formatMessage({ id: AUDIT_LOG_OBJECT_TYPE.DDNS_PROVIDER })}
					objects="ddns-providers"
					onNew={onNew}
					isFiltered={isFiltered}
					color="cyan"
				/>
			}
		/>
	);
}
