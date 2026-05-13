import { IconPackages, IconPlus, IconSearch } from "@tabler/icons-react";
import { AlertCircle } from "lucide-react";
import { useState } from "react";
import { HasPermission, LoadingPage } from "src/components";
import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";
import { Button } from "src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "src/components/ui/card";
import { Input } from "src/components/ui/input";
import { useDeleteWasmModule, useWasmModules } from "src/hooks";
import { intl, T } from "src/locale";
import { showDeleteConfirmModal } from "src/modals";
import { showWasmModuleModal } from "src/modals/WasmModuleModal";
import { MANAGE, SETTINGS } from "src/modules/Permissions";
import { showObjectSuccess } from "src/notifications";
import { AUDIT_LOG_OBJECT_TYPE } from "src/types/enums";
import Table from "./Table";

export default function TableWrapper() {
	const [search, setSearch] = useState("");
	const { isFetching, isLoading, isError, error, data } = useWasmModules();
	const { mutateAsync: deleteWasmModule } = useDeleteWasmModule();

	if (isLoading) {
		return <LoadingPage />;
	}

	if (isError) {
		return (
			<Alert variant="destructive">
				<AlertCircle className="h-4 w-4" />
				<AlertTitle>Error</AlertTitle>
				<AlertDescription>{error?.message || <T id="error.unknown" />}</AlertDescription>
			</Alert>
		);
	}

	const handleDelete = async (id: number) => {
		await deleteWasmModule(id);
		showObjectSuccess(AUDIT_LOG_OBJECT_TYPE.WASM_MODULE, "deleted");
	};

	let filtered = null;
	if (search && data) {
		filtered = data.filter(
			(item) =>
				item.name.toLowerCase().includes(search) ||
				item.description?.toLowerCase().includes(search) ||
				item.filename.toLowerCase().includes(search),
		);
	} else if (search !== "") {
		setSearch("");
	}

	return (
		<Card className="mt-4 border-t-4 border-violet-500/50">
			<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
				<CardTitle className="text-2xl font-bold flex items-center gap-2">
					<IconPackages className="h-6 w-6" />
					<T id="wasm-modules" />
				</CardTitle>
				<div className="flex items-center space-x-2">
					{data?.length ? (
						<div className="relative w-full max-w-sm">
							<IconSearch className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
							<Input
								type="search"
								placeholder={intl.formatMessage({ id: "search.placeholder" })}
								className="pl-8 h-9"
								onChange={(e) => setSearch(e.target.value.toLowerCase().trim())}
							/>
						</div>
					) : null}
					<HasPermission section={SETTINGS} permission={MANAGE} hideError>
						<Button
							size="sm"
							className="bg-violet-600/90 hover:bg-violet-600 text-white shadow-sm"
							disabled={!data}
							onClick={() => showWasmModuleModal("new")}
						>
							<IconPlus className="mr-2 h-4 w-4" />
							<T id="object.add" tData={{ object: intl.formatMessage({ id: AUDIT_LOG_OBJECT_TYPE.WASM_MODULE }) }} />
						</Button>
					</HasPermission>
				</div>
			</CardHeader>
			<CardContent>
				<Table
					data={filtered ?? data ?? []}
					isFiltered={!!search}
					isFetching={isFetching}
					onEdit={(id: number) => showWasmModuleModal(id)}
					onDelete={(id: number) =>
						showDeleteConfirmModal({
							title: (
								<T
									id="object.delete"
									tData={{ object: intl.formatMessage({ id: AUDIT_LOG_OBJECT_TYPE.WASM_MODULE }) }}
								/>
							),
							onConfirm: () => handleDelete(id),
							invalidations: [["wasm-modules"]],
							children: (
								<T
									id="object.delete.content"
									tData={{ object: intl.formatMessage({ id: AUDIT_LOG_OBJECT_TYPE.WASM_MODULE }) }}
								/>
							),
						})
					}
					onNew={() => showWasmModuleModal("new")}
				/>
			</CardContent>
		</Card>
	);
}
