import { IconTrash, IconEdit } from "@tabler/icons-react";
import { createColumnHelper, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useMemo } from "react";
import type { WasmModule } from "src/api/backend";
import { UserAvatar } from "src/components";
import { TableLayout } from "src/components/Table/TableLayout";
import { DateFormatter } from "src/components/Table/Formatter/DateFormatter";
import { Button } from "src/components/ui/button";

interface Props {
	data?: WasmModule[];
	isLoading: boolean;
	onDelete: (id: number) => void;
	onEdit: (id: number) => void;
}

export default function Table({ data, onDelete, onEdit }: Props) {
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
				meta: { className: "w-1" },
			}),
			columnHelper.accessor("name", {
				header: "Name",
				cell: (info) => info.getValue(),
			}),
			columnHelper.accessor("description", {
				header: "Description",
				cell: (info) => info.getValue(),
			}),
			columnHelper.accessor("filename", {
				header: "File",
				cell: (info) => info.getValue(),
			}),
			columnHelper.accessor("createdOn", {
				header: "Created",
				cell: (info) => <DateFormatter value={info.getValue()} />,
			}),
			columnHelper.display({
				id: "actions",
				header: "Actions",
				cell: ({ row }) => (
					<div className="flex items-center gap-2">
						<Button
							variant="ghost"
							size="icon"
							onClick={() => onEdit(row.original.id)}>
							<IconEdit className="h-4 w-4" />
						</Button>
						<Button
							variant="ghost"
							size="icon"
							className="text-destructive hover:text-destructive"
							onClick={() => onDelete(row.original.id)}>
							<IconTrash className="h-4 w-4" />
						</Button>
					</div>
				),
			}),
		],
		[columnHelper, onDelete, onEdit],
	);

	const tableInstance = useReactTable({
		data: data || [],
		columns,
		getCoreRowModel: getCoreRowModel(),
	});

	return <TableLayout tableInstance={tableInstance} />;
}
