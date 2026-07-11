import { IconArrowsRightLeft, IconHelp, IconPlus, IconSearch } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";
import { useState } from "react";
import { deleteStream, toggleStream } from "src/api/backend";
import { HasPermission, LoadingPage } from "src/components";
import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";
import { Button } from "src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "src/components/ui/card";
import { Input } from "src/components/ui/input";
import { useStreams } from "src/hooks";
import { intl, T } from "src/locale";
import { MANAGE, STREAMS } from "src/modules/Permissions";
import { showObjectSuccess } from "src/notifications";
import { AUDIT_LOG_OBJECT_TYPE } from "src/types/enums";
import { showDeleteConfirmModal, showHelpModal, showStreamModal } from "./lazy";
import Table from "./Table";

export default function TableWrapper() {
	const queryClient = useQueryClient();
	const [search, setSearch] = useState("");
	const [_deleteId, _setDeleteIdd] = useState(0);
	const { isFetching, isLoading, isError, error, data } = useStreams(["owner", AUDIT_LOG_OBJECT_TYPE.CERTIFICATE]);

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
		await deleteStream(id);
		showObjectSuccess(AUDIT_LOG_OBJECT_TYPE.STREAM, "deleted");
	};

	const handleDisableToggle = async (id: number, enabled: boolean) => {
		await toggleStream(id, enabled);
		queryClient.invalidateQueries({ queryKey: ["streams"] });
		queryClient.invalidateQueries({ queryKey: [AUDIT_LOG_OBJECT_TYPE.STREAM, id] });
		showObjectSuccess(AUDIT_LOG_OBJECT_TYPE.STREAM, enabled ? "enabled" : "disabled");
	};

	let filtered = null;
	if (search && data) {
		filtered = data?.filter((item) => {
			return (
				`${item.incomingPort}`.includes(search) ||
				`${item.forwardingPort}`.includes(search) ||
				item.forwardingHost.includes(search)
			);
		});
	} else if (search !== "") {
		// this can happen if someone deletes the last item while searching
		setSearch("");
	}

	return (
		<Card className="mt-4 border-t-4 border-blue-500/50">
			<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
				<CardTitle className="text-2xl font-bold flex items-center gap-2">
					<IconArrowsRightLeft className="h-6 w-6" />
					<T id="streams" />
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
					<Button
						variant="outline"
						size="icon"
						aria-label={intl.formatMessage({ id: "action.help" })}
						onClick={() => showHelpModal("Streams", "blue")}
					>
						<IconHelp className="h-4 w-4" />
					</Button>
					<HasPermission section={STREAMS} permission={MANAGE} hideError>
						{data?.length ? (
							<Button
								size="sm"
								className="bg-blue-600/90 hover:bg-blue-600 text-white shadow-sm"
								onClick={() => showStreamModal("new")}
							>
								<IconPlus className="mr-2 h-4 w-4" />
								<T id="object.add" tData={{ object: AUDIT_LOG_OBJECT_TYPE.STREAM }} />
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
					onEdit={(id: number) => showStreamModal(id)}
					onDelete={(id: number) =>
						showDeleteConfirmModal({
							title: <T id="object.delete" tData={{ object: AUDIT_LOG_OBJECT_TYPE.STREAM }} />,
							onConfirm: () => handleDelete(id),
							invalidations: [["streams"], [AUDIT_LOG_OBJECT_TYPE.STREAM, id]],
							children: <T id="object.delete.content" tData={{ object: AUDIT_LOG_OBJECT_TYPE.STREAM }} />,
						})
					}
					onDisableToggle={handleDisableToggle}
					onNew={() => showStreamModal("new")}
				/>
			</CardContent>
		</Card>
	);
}
