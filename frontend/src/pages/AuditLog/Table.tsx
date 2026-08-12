import { IconFilter, IconListDetails, IconUserSearch } from "@tabler/icons-react";
import { createColumnHelper, useTable } from "@tanstack/react-table";
import { useMemo } from "react";
import type { AuditLog } from "src/api/backend";
import { EventFormatter, UserAvatar } from "src/components";
import { TableLayout } from "src/components/Table/TableLayout";
import { shieldTableFeatures } from "src/components/Table/tableFeatures";
import { Button } from "src/components/ui/button";
import { intl, T } from "src/locale";

interface Props {
	data: AuditLog[];
	isFetching?: boolean;
	onFilterByObject?: (auditLog: Pick<AuditLog, "objectId" | "objectType">) => void;
	onFilterByUser?: (userId: number) => void;
	onSelectItem?: (id: number) => void;
}
export default function Table({ data, isFetching, onFilterByObject, onFilterByUser, onSelectItem }: Props) {
	const columnHelper = createColumnHelper<typeof shieldTableFeatures, AuditLog>();
	const columns = useMemo(
		() =>
			columnHelper.columns([
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
						const auditLog = info.row.original;
						const filterByUserLabel = intl.formatMessage(
							{ id: "audit-log.filter.by-user" },
							{ id: auditLog.userId },
						);
						const filterByObjectLabel = intl.formatMessage(
							{ id: "audit-log.filter.by-object" },
							{ id: auditLog.objectId },
						);

						return (
							<div className="flex justify-end gap-1">
								{onFilterByUser ? (
									<Button
										aria-label={filterByUserLabel}
										className="h-8 w-8 text-muted-foreground hover:text-foreground"
										onClick={(event) => {
											event.preventDefault();
											onFilterByUser(auditLog.userId);
										}}
										title={filterByUserLabel}
										type="button"
										variant="ghost"
									>
										<IconUserSearch className="h-4 w-4" />
									</Button>
								) : null}
								{onFilterByObject ? (
									<Button
										aria-label={filterByObjectLabel}
										className="h-8 w-8 text-muted-foreground hover:text-foreground"
										onClick={(event) => {
											event.preventDefault();
											onFilterByObject({
												objectId: auditLog.objectId,
												objectType: auditLog.objectType,
											});
										}}
										title={filterByObjectLabel}
										type="button"
										variant="ghost"
									>
										<IconFilter className="h-4 w-4" />
									</Button>
								) : null}
								<Button
									variant="ghost"
									size="icon"
									aria-label={intl.formatMessage({ id: "action.view-details" })}
									onClick={(e) => {
										e.preventDefault();
										onSelectItem?.(auditLog.id);
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
						className: "w-[130px]",
					},
				}),
			]),
		[columnHelper, onFilterByObject, onFilterByUser, onSelectItem],
	);

	const tableInstance = useTable({
		features: shieldTableFeatures,
		columns,
		data,
		meta: {
			isFetching,
		},
	});

	return <TableLayout tableInstance={tableInstance} />;
}
