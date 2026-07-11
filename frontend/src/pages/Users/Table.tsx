import {
	IconDotsVertical,
	IconEdit,
	IconLock,
	IconLogin2,
	IconPower,
	IconShield,
	IconTrash,
} from "@tabler/icons-react";
import { createColumnHelper, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useMemo } from "react";
import type { User } from "src/api/backend";
import {
	EmailFormatter,
	EmptyData,
	RolesFormatter,
	TrueFalseFormatter,
	UserAvatar,
	ValueWithDateFormatter,
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
import { AUDIT_LOG_OBJECT_TYPE } from "src/types/enums";

interface Props {
	data: User[];
	isFiltered?: boolean;
	isFetching?: boolean;
	currentUserId?: number;
	onEditUser?: (id: number) => void;
	onEditPermissions?: (id: number) => void;
	onSetPassword?: (id: number) => void;
	onDeleteUser?: (id: number) => void;
	onDisableToggle?: (id: number, enabled: boolean) => void;
	onNewUser?: () => void;
	onLoginAs?: (id: number) => void;
}
export default function Table({
	data,
	isFiltered,
	isFetching,
	currentUserId,
	onEditUser,
	onEditPermissions,
	onSetPassword,
	onDeleteUser,
	onDisableToggle,
	onNewUser,
	onLoginAs,
}: Props) {
	const columnHelper = createColumnHelper<User>();
	const columns = useMemo(
		() => [
			columnHelper.accessor((row) => row, {
				id: "avatar",
				cell: (info) => {
					const value = info.getValue();
					return <UserAvatar url={value.avatar} name={value.name} />;
				},
				meta: {
					className: "w-[50px]",
				},
			}),
			columnHelper.accessor((row) => row, {
				id: "name",
				header: intl.formatMessage({ id: "column.name" }),
				cell: (info) => {
					const value = info.getValue();
					// Hack to reuse domains formatter
					return (
						<ValueWithDateFormatter
							value={value.name}
							createdOn={value.createdOn}
							disabled={value.isDisabled}
						/>
					);
				},
			}),
			columnHelper.accessor("email", {
				id: "email",
				header: intl.formatMessage({ id: "column.email" }),
				cell: (info) => {
					return <EmailFormatter email={info.getValue()} />;
				},
			}),
			columnHelper.accessor("roles", {
				id: "roles",
				header: intl.formatMessage({ id: "column.roles" }),
				cell: (info) => {
					return <RolesFormatter roles={info.getValue()} />;
				},
			}),
			columnHelper.accessor("isDisabled", {
				id: "isDisabled",
				header: intl.formatMessage({ id: "column.status" }),
				cell: (info) => {
					return <TrueFalseFormatter value={!info.getValue()} />;
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
									size="icon"
									className="h-8 w-8 text-muted-foreground hover:text-foreground"
									aria-label={intl.formatMessage({ id: "sr.open-menu" })}
								>
									<IconDotsVertical className="h-4 w-4" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								<DropdownMenuLabel>
									<T
										id="object.actions-title"
										tData={{ object: AUDIT_LOG_OBJECT_TYPE.USER }}
										data={{ id: info.row.original.id }}
									/>
								</DropdownMenuLabel>
								<DropdownMenuItem onClick={() => onEditUser?.(info.row.original.id)}>
									<IconEdit className="mr-2 h-4 w-4" />
									<T id="action.edit" />
								</DropdownMenuItem>
								{currentUserId !== info.row.original.id && (
									<>
										<DropdownMenuItem onClick={() => onEditPermissions?.(info.row.original.id)}>
											<IconShield className="mr-2 h-4 w-4" />
											<T id="action.permissions" />
										</DropdownMenuItem>
										<DropdownMenuItem onClick={() => onSetPassword?.(info.row.original.id)}>
											<IconLock className="mr-2 h-4 w-4" />
											<T id="user.set-password" />
										</DropdownMenuItem>
										<DropdownMenuItem
											onClick={() =>
												onDisableToggle?.(info.row.original.id, info.row.original.isDisabled)
											}
										>
											<IconPower className="mr-2 h-4 w-4" />
											<T id={info.row.original.isDisabled ? "action.enable" : "action.disable"} />
										</DropdownMenuItem>
										{info.row.original.isDisabled ? (
											<DropdownMenuItem disabled>
												<IconLogin2 className="mr-2 h-4 w-4" />
												<T id="user.login-as" data={{ name: info.row.original.name }} />
											</DropdownMenuItem>
										) : (
											<DropdownMenuItem onClick={() => onLoginAs?.(info.row.original.id)}>
												<IconLogin2 className="mr-2 h-4 w-4" />
												<T id="user.login-as" data={{ name: info.row.original.name }} />
											</DropdownMenuItem>
										)}
										<DropdownMenuSeparator />
										<DropdownMenuItem
											className="text-red-600 focus:text-red-500"
											onClick={() => onDeleteUser?.(info.row.original.id)}
										>
											<IconTrash className="mr-2 h-4 w-4" />
											<T id="action.delete" />
										</DropdownMenuItem>
									</>
								)}
							</DropdownMenuContent>
						</DropdownMenu>
					);
				},
				meta: {
					className: "w-[50px]",
				},
			}),
		],
		[
			columnHelper,
			currentUserId,
			onEditUser,
			onDisableToggle,
			onDeleteUser,
			onEditPermissions,
			onSetPassword,
			onLoginAs,
		],
	);

	const tableInstance = useReactTable<User>({
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
					object={AUDIT_LOG_OBJECT_TYPE.USER}
					objects="users"
					onNew={onNewUser}
					isFiltered={isFiltered}
					color="orange"
				/>
			}
		/>
	);
}
