import { IconDotsVertical, IconEdit, IconPower, IconTrash } from "@tabler/icons-react";
import { createColumnHelper, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useMemo } from "react";
import type { ProxyHost } from "src/api/backend";
import {
	AccessListFormatter,
	CertificateFormatter,
	DomainsFormatter,
	EmptyData,
	GravatarFormatter,
	HasPermission,
	ServiceIcon,
	TrueFalseFormatter,
} from "src/components";
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
	data: ProxyHost[];
	isFiltered?: boolean;
	isFetching?: boolean;
	onEdit?: (id: number) => void;
	onDelete?: (id: number) => void;
	onDisableToggle?: (id: number, enabled: boolean) => void;
	onNew?: () => void;
}
export default function Table({ data, isFetching, onEdit, onDelete, onDisableToggle, onNew, isFiltered }: Props) {
	const columnHelper = createColumnHelper<ProxyHost>();
	const columns = useMemo(
		() => [
			columnHelper.accessor((row) => row, {
				id: "icon",
				cell: (info) => {
					const value = info.getValue();
					return (
						<ServiceIcon
							port={value.forwardPort}
							hostname={value.forwardHost}
							customIconUrl={value.iconUrl}
							iconType={value.iconType}
							size={28}
							showTooltip
						/>
					);
				},
				meta: {
					className: "w-[50px]",
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
			columnHelper.accessor((row) => row, {
				id: "domainNames",
				header: intl.formatMessage({ id: "column.source" }),
				cell: (info) => {
					const value = info.getValue();
					return <DomainsFormatter domains={value.domainNames} createdOn={value.createdOn} />;
				},
			}),
			columnHelper.accessor((row) => row, {
				id: "forwardHost",
				header: intl.formatMessage({ id: "column.destination" }),
				cell: (info) => {
					const value = info.getValue();
					return `${value.forwardScheme}://${value.forwardHost}:${value.forwardPort}`;
				},
			}),
			columnHelper.accessor("certificate", {
				id: "certificate",
				header: intl.formatMessage({ id: "column.ssl" }),
				cell: (info) => {
					return <CertificateFormatter certificate={info.getValue()} />;
				},
			}),
			columnHelper.accessor("accessList", {
				id: "accessList",
				header: intl.formatMessage({ id: "column.access" }),
				cell: (info) => {
					return <AccessListFormatter access={info.getValue()} />;
				},
			}),
			columnHelper.accessor("enabled", {
				id: "enabled",
				header: intl.formatMessage({ id: "column.status" }),
				cell: (info) => {
					return <TrueFalseFormatter value={info.getValue()} trueLabel="online" falseLabel="offline" />;
				},
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
										tData={{ object: "proxy-host" }}
										data={{ id: info.row.original.id }}
									/>
								</DropdownMenuLabel>
								<DropdownMenuItem onClick={() => onEdit?.(info.row.original.id)}>
									<IconEdit className="mr-2 h-4 w-4" />
									<T id="action.edit" />
								</DropdownMenuItem>
								<HasPermission section={PROXY_HOSTS} permission={MANAGE} hideError>
									<DropdownMenuItem
										onClick={() =>
											onDisableToggle?.(info.row.original.id, !info.row.original.enabled)
										}
									>
										<IconPower className="mr-2 h-4 w-4" />
										<T id={info.row.original.enabled ? "action.disable" : "action.enable"} />
									</DropdownMenuItem>
									<DropdownMenuSeparator />

									<DropdownMenuItem
										className="text-red-600 focus:text-red-500"
										onClick={() => onDelete?.(info.row.original.id)}
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
		[columnHelper, onEdit, onDisableToggle, onDelete],
	);

	const tableInstance = useReactTable<ProxyHost>({
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
					object="proxy-host"
					objects="proxy-hosts"
					onNew={onNew}
					isFiltered={isFiltered}
					color="lime"
					permissionSection={PROXY_HOSTS}
				/>
			}
		/>
	);
}
