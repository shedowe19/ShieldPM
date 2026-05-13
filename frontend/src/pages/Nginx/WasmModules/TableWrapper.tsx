import { Plus } from "lucide-react";
import { Button } from "src/components/ui/button";
import { Card } from "src/components/ui/card";
import { T } from "src/locale";
import { showDeleteConfirmModal } from "src/modals";
import type { WasmModule } from "src/api/backend";
import { useDeleteWasmModule } from "src/hooks";
import { showWasmModuleModal } from "src/modals/WasmModuleModal";
import Table from "./Table";

interface Props {
	data?: WasmModule[];
	isLoading: boolean;
}

export default function TableWrapper({ data, isLoading }: Props) {
	const { mutate: deleteWasmModule } = useDeleteWasmModule();

	return (
		<Card className="flex flex-col h-full overflow-hidden flex-1 border-0 rounded-none shadow-none md:border md:rounded-xl md:shadow-sm">
			<div className="flex items-center justify-between p-4 md:p-6 pb-2">
				<div className="flex gap-2 ml-auto">
					<Button onClick={() => showWasmModuleModal("new")}>
						<Plus className="mr-2 h-4 w-4" />
						<T id="add-wasm-module" />
					</Button>
				</div>
			</div>
			<div className="flex-1 overflow-hidden p-4 md:p-6 pt-0 flex flex-col">
				<Table
					data={data}
					isLoading={isLoading}
					onEdit={(id: number) => showWasmModuleModal(id)}
					onDelete={(id: number) => {
						showDeleteConfirmModal({
							title: <T id="delete-wasm-module" />,
							children: <T id="delete-wasm-module-confirm" />,
							onConfirm: () => deleteWasmModule(id),
						});
					}}
				/>
			</div>
		</Card>
	);
}
