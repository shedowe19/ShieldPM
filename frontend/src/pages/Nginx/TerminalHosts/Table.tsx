import { IconDotsVertical, IconEdit, IconTerminal2, IconTrash } from "@tabler/icons-react";
import { createColumnHelper, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useMemo } from "react";
import type { TerminalHost } from "src/api/backend";
import { EmptyData, GravatarFormatter, HasPermission, ServiceIcon, TrueFalseFormatter } from "src/components";
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

interface Props {
	data: TerminalHost[];
	isFiltered?: boolean;
	isFetching?: boolean;
	onEdit?: (host: TerminalHost) => void;
	onDelete?: (id: number) => void;
	onConnect?: (host: TerminalHost) => void;
	onNew?: () => void;
}

export default function Table({ data, isFetching, onEdit, onDelete, onConnect, onNew, isFiltered }: Props) {
	const columnHelper = createColumnHelper<TerminalHost>();
	const columns = useMemo(
		() => [
			columnHelper.accessor((row) => row, {
				id: "icon",
				cell: (info) => {
					// We use a generic terminal-like icon logic here if we had custom icons
					return (
						<ServiceIcon
							port={info.getValue().port}
							hostname={info.getValue().host}
							iconType={"none"} // Placeholder if supported, otherwise generic
							size={28}
						/>
					);
				},
				meta: {
					className: "w-[50px]",
				},
			}),
			columnHelper.accessor("name", {
				id: "name",
				header: intl.formatMessage({ id: "str.name" }),
				cell: (info) => <span className="font-medium">{info.getValue()}</span>,
			}),
			columnHelper.accessor((row) => row, {
				id: "host",
				header: intl.formatMessage({ id: "str.host" }),
				cell: (info) => {
					const value = info.getValue();
					return `${value.username}@${value.host}:${value.port}`;
				},
			}),
			columnHelper.accessor("owner", {
				id: "owner",
				cell: (info) => {
					const value = info.getValue();
					return <GravatarFormatter url={value ? value.avatar : ""} name={value ? value.name : ""} />;
				},
				meta: {
					className: "w-1",
				},
			}),
			columnHelper.accessor("enabled", {
				id: "enabled",
				header: intl.formatMessage({ id: "column.status" }), // Reuse existing key
				cell: (info) => {
					return <TrueFalseFormatter value={info.getValue()} trueLabel="online" falseLabel="offline" />;
				},
			}),
			columnHelper.display({
				id: "actions",
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
									<T id="Actions" />
								</DropdownMenuLabel>
								<DropdownMenuItem onClick={() => onConnect?.(info.row.original)}>
									<IconTerminal2 className="mr-2 h-4 w-4" />
									<T id="Connect" />
								</DropdownMenuItem>

								<HasPermission section={PROXY_HOSTS} permission={MANAGE} hideError>
									<DropdownMenuSeparator />
									<DropdownMenuItem onClick={() => onEdit?.(info.row.original)}>
										<IconEdit className="mr-2 h-4 w-4" />
										<T id="Edit" />
									</DropdownMenuItem>
									<DropdownMenuItem
										className="text-red-600 focus:text-red-500"
										onClick={() => onDelete?.(info.row.original.id)}
									>
										<IconTrash className="mr-2 h-4 w-4" />
										<T id="Delete" />
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
		[columnHelper, onEdit, onDelete, onConnect],
	);

	const tableInstance = useReactTable<TerminalHost>({
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
					object="terminal-host"
					objects="terminal-hosts"
					onNew={onNew}
					isFiltered={isFiltered}
					color="slate"
					permissionSection={PROXY_HOSTS}
				/>
			}
		/>
	);
}
