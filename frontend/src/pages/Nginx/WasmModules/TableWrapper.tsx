import { IconBolt, IconHelp, IconPlus, IconSearch } from "@tabler/icons-react";
import { AlertCircle } from "lucide-react";
import { useState } from "react";
import { HasPermission, LoadingPage } from "src/components";
import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";
import { Button } from "src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "src/components/ui/card";
import { Input } from "src/components/ui/input";
import { useWasmModule, useWasmModules } from "src/hooks/useWasmModules";
import { intl, T } from "src/locale";
import { showDeleteConfirmModal, showHelpModal, showWasmModuleModal } from "src/modals";
import { MANAGE, PROXY_HOSTS } from "src/modules/Permissions";
import { showObjectSuccess } from "src/notifications";
import { AUDIT_LOG_OBJECT_TYPE } from "src/types/enums";
import Table from "./Table";

export default function TableWrapper() {
	const [search, setSearch] = useState("");
	const { isFetching, isLoading, isError, error, data } = useWasmModules();
	const { remove } = useWasmModule();

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
		remove.mutate(id, {
			onSuccess: () => {
				showObjectSuccess(AUDIT_LOG_OBJECT_TYPE.WASM_MODULE, "deleted");
			},
		});
	};

	let filtered = null;
	if (search && data) {
		filtered = data?.filter((item) => {
			return item.name.toLowerCase().includes(search);
		});
	} else if (search !== "") {
		// this can happen if someone deletes the last item while searching
		setSearch("");
	}

	return (
		<Card className="mt-4 border-t-4 border-cyan-500/50">
			<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
				<CardTitle className="text-2xl font-bold flex items-center gap-2">
					<IconBolt className="h-6 w-6" />
					WASM Modules
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
					<Button variant="outline" size="icon" onClick={() => showHelpModal("WasmModules", "cyan")}>
						<IconHelp className="h-4 w-4" />
					</Button>
					<HasPermission section={PROXY_HOSTS} permission={MANAGE} hideError>
						{data?.length ? (
							<Button
								size="sm"
								className="bg-cyan-600/90 hover:bg-cyan-600 text-white shadow-sm"
								onClick={() => showWasmModuleModal("new")}
							>
								<IconPlus className="mr-2 h-4 w-4" />
								<T id="object.add" tData={{ object: "WASM Module" }} />
							</Button>
						) : null}
					</HasPermission>
				</div>
			</CardHeader>
			<CardContent>
				<Table
					data={filtered ?? data ?? []}
					isFetching={isFetching}
					isFiltered={!!filtered}
					onEdit={(id: number) => showWasmModuleModal(id)}
					onDelete={(id: number) =>
						showDeleteConfirmModal({
							title: <T id="object.delete" tData={{ object: "WASM Module" }} />,
							onConfirm: () => handleDelete(id),
							invalidations: [["wasm-modules"], [AUDIT_LOG_OBJECT_TYPE.WASM_MODULE, id]],
							children: "Are you sure you want to delete this WASM module?",
						})
					}
					onNew={() => showWasmModuleModal("new")}
				/>
			</CardContent>
		</Card>
	);
}
