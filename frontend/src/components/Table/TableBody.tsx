import { flexRender, type Table } from "@tanstack/react-table";
import { AnimatePresence, domAnimation, LazyMotion, m } from "framer-motion";
import React from "react";
import type { TableLayoutProps } from "src/components";
import { TableBody as ShadcnTableBody, TableCell, TableRow } from "src/components/ui/table";
import { EmptyRow } from "./EmptyRow";

// Helper to use forwardRef with motion
const TableRowWithRef = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
	(props, ref) => <TableRow ref={ref} {...props} />,
);
TableRowWithRef.displayName = "TableRowWithRef";

const MotionTableRow = m.create(TableRowWithRef);

function TableBody<T>(props: TableLayoutProps<T>) {
	const { tableInstance, extraStyles, emptyState } = props;
	const rows = tableInstance.getRowModel().rows;

	if (rows.length === 0) {
		return (
			<ShadcnTableBody>
				{/* EmptyState needs to be wrapped in a tr/td or handle it differently inside ShadcnTableBody.
				    Usually ShadcnTableBody expects TableRow.
				    If emptyState provides a full tbody content, it might break.
				    Let's inspect EmptyRow or assume we need to wrap it.
				*/}
				{emptyState ? (
					<TableRow>
						<TableCell colSpan={tableInstance.getVisibleFlatColumns().length} className="h-24 text-center">
							{emptyState}
						</TableCell>
					</TableRow>
				) : (
					<EmptyRow tableInstance={tableInstance as unknown as Table<unknown>} />
				)}
			</ShadcnTableBody>
		);
	}

	return (
		<ShadcnTableBody>
			<LazyMotion features={domAnimation}>
				<AnimatePresence initial={false}>
					{rows.map((row) => {
						return (
							<MotionTableRow
								key={row.id}
								{...(extraStyles?.row(row.original) as Record<string, unknown>)}
								initial={{ opacity: 0, x: -20 }}
								animate={{ opacity: 1, x: 0 }}
								exit={{ opacity: 0, x: 20 }}
								transition={{ duration: 0.2 }}
							>
								{row.getVisibleCells().map((cell) => {
									const { className } = (cell.column.columnDef.meta as { className?: string }) ?? {};
									return (
										<TableCell key={cell.id} className={className}>
											{flexRender(cell.column.columnDef.cell, cell.getContext())}
										</TableCell>
									);
								})}
							</MotionTableRow>
						);
					})}
				</AnimatePresence>
			</LazyMotion>
		</ShadcnTableBody>
	);
}

const MemoizedTableBody = React.memo(TableBody) as typeof TableBody;

export { MemoizedTableBody as TableBody };
