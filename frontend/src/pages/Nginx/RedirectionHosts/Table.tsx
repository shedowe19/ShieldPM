import { IconDotsVertical, IconEdit, IconPower, IconTrash } from "@tabler/icons-react";
import { createColumnHelper, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useMemo } from "react";
import type { RedirectionHost } from "src/api/backend";
import {
	CertificateFormatter,
	DomainsFormatter,
	EmptyData,
	HasPermission,
	TrueFalseFormatter,
	UserAvatar,
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
import { MANAGE, REDIRECTION_HOSTS } from "src/modules/Permissions";
import { AUDIT_LOG_OBJECT_TYPE } from "src/types/enums";

interface Props {
	data: RedirectionHost[];
	isFiltered?: boolean;
	isFetching?: boolean;
	onEdit?: (id: number) => void;
	onDelete?: (id: number) => void;
	onDisableToggle?: (id: number, enabled: boolean) => void;
	onNew?: () => void;
}
export default function Table({ data, isFetching, onEdit, onDelete, onDisableToggle, onNew, isFiltered }: Props) {
	const columnHelper = createColumnHelper<RedirectionHost>();
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
				id: "domainNames",
				header: intl.formatMessage({ id: "column.source" }),
				cell: (info) => {
					const value = info.getValue();
					return <DomainsFormatter domains={value.domainNames} createdOn={value.createdOn} />;
				},
			}),
			columnHelper.accessor("forwardHttpCode", {
				id: "forwardHttpCode",
				header: intl.formatMessage({ id: "column.http-code" }),
				cell: (info) => {
					return info.getValue();
				},
			}),
			columnHelper.accessor("forwardScheme", {
				id: "forwardScheme",
				header: intl.formatMessage({ id: "column.scheme" }),
				cell: (info) => {
					return info.getValue().toUpperCase();
				},
			}),
			columnHelper.accessor("forwardDomainName", {
				id: "forwardDomainName",
				header: intl.formatMessage({ id: "column.destination" }),
				cell: (info) => {
					return info.getValue();
				},
			}),
			columnHelper.accessor("certificate", {
				id: "certificate",
				header: intl.formatMessage({ id: "column.ssl" }),
				cell: (info) => {
					return <CertificateFormatter value={info.getValue()} />;
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
										tData={{ object: AUDIT_LOG_OBJECT_TYPE.REDIRECTION_HOST }}
										data={{ id: info.row.original.id }}
									/>
								</DropdownMenuLabel>
								<HasPermission section={REDIRECTION_HOSTS} permission={MANAGE} hideError>
									<DropdownMenuItem onClick={() => onEdit?.(info.row.original.id)}>
										<IconEdit className="mr-2 h-4 w-4" />
										<T id="action.edit" />
									</DropdownMenuItem>
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

	const tableInstance = useReactTable<RedirectionHost>({
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
					object={AUDIT_LOG_OBJECT_TYPE.REDIRECTION_HOST}
					objects="redirection-hosts"
					onNew={onNew}
					isFiltered={isFiltered}
					color="yellow"
					permissionSection={REDIRECTION_HOSTS}
				/>
			}
		/>
	);
}
