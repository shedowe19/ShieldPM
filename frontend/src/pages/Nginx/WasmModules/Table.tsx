import { IconTrash, IconEdit } from "@tabler/icons-react";
import React from "react";
import type { WasmModule } from "src/api/backend";
import { OwnerFormatter } from "src/components";
import BaseTable from "src/components/Table/BaseTable";
import { TableActions } from "src/components/Table/TableActions";
import { DateFormatter } from "src/components/Table/Formatter/DateFormatter";

interface Props {
	data?: WasmModule[];
	isLoading: boolean;
	onDelete: (id: number) => void;
	onEdit: (id: number) => void;
}

export default function Table({ data, isLoading, onDelete, onEdit }: Props) {
	const columns = React.useMemo(
		() => [
			{
				header: "Name",
				accessorKey: "name",
			},
			{
				header: "Description",
				accessorKey: "description",
			},
			{
				header: "File",
				accessorKey: "filename",
			},
			{
				header: "Owner",
				accessorKey: "owner",
				cell: ({ row }: any) => <OwnerFormatter owner={row.original.owner} />,
			},
			{
				header: "Created",
				accessorKey: "createdOn",
				cell: ({ getValue }: any) => <DateFormatter date={getValue()} />,
			},
			{
				header: "Actions",
				id: "actions",
				cell: ({ row }: any) => (
					<TableActions
						items={[
							{
								label: "Edit",
								icon: IconEdit,
								onClick: () => onEdit(row.original.id),
							},
							{
								label: "Delete",
								icon: IconTrash,
								variant: "destructive",
								onClick: () => onDelete(row.original.id),
							},
						]}
					/>
				),
			},
		],
		[onDelete, onEdit],
	);

	return (
		<BaseTable
			data={data || []}
			columns={columns}
			isLoading={isLoading}
			searchFields={["name", "description", "filename"]}
		/>
	);
}
