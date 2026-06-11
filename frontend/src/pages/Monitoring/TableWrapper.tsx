import { IconHeartbeat, IconHelp, IconPlus, IconSearch } from "@tabler/icons-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { deleteMonitor, getMonitors, testMonitor } from "src/api/backend";
import { LoadingPage } from "src/components";
import { HasPermission } from "src/components/HasPermission";
import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";
import { Button } from "src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "src/components/ui/card";
import { Input } from "src/components/ui/input";
import { intl, T } from "src/locale";
import { showDeleteConfirmModal, showHelpModal, showMonitorModal } from "src/modals";
import { MANAGE, MONITORING } from "src/modules/Permissions";
import { showObjectSuccess, showSuccess } from "src/notifications";
import { AUDIT_LOG_OBJECT_TYPE } from "src/types/enums";
import Table from "./Table";

export default function TableWrapper() {
	const [search, setSearch] = useState("");
	const queryClient = useQueryClient();
	const { isFetching, isLoading, isError, error, data } = useQuery({
		queryKey: ["monitors"],
		queryFn: getMonitors,
		refetchInterval: 30_000,
	});

	const handleDelete = useCallback(async (id: number) => {
		await deleteMonitor(id);
		showObjectSuccess(AUDIT_LOG_OBJECT_TYPE.MONITOR, "deleted");
	}, []);

	const handleTest = useCallback(
		async (id: number) => {
			await testMonitor(id);
			await queryClient.invalidateQueries({ queryKey: ["monitors"] });
			await queryClient.invalidateQueries({ queryKey: ["monitor-checks", id] });
			showSuccess(intl.formatMessage({ id: "monitoring.test-complete" }));
		},
		[queryClient],
	);

	const filtered = useMemo(() => {
		if (search && data) {
			return data.filter(
				(item) =>
					item.name.toLowerCase().includes(search) ||
					item.url.toLowerCase().includes(search) ||
					item.status.toLowerCase().includes(search),
			);
		}
		return null;
	}, [search, data]);

	useEffect(() => {
		if (search !== "" && (!data || data.length === 0)) {
			setSearch("");
		}
	}, [search, data]);

	const handleEdit = useCallback((id: number) => showMonitorModal(id), []);
	const handleNew = useCallback(() => showMonitorModal(), []);
	const handleDeleteConfirm = useCallback(
		(id: number) => {
			showDeleteConfirmModal({
				title: <T id="object.delete" tData={{ object: intl.formatMessage({ id: "monitor" }) }} />,
				onConfirm: () => handleDelete(id),
				invalidations: [["monitors"]],
				children: <T id="object.delete.content" tData={{ object: intl.formatMessage({ id: "monitor" }) }} />,
			});
		},
		[handleDelete],
	);

	if (isLoading) return <LoadingPage />;

	if (isError) {
		return (
			<Alert variant="destructive">
				<AlertCircle className="h-4 w-4" />
				<AlertTitle>
					<T id="notification.error" />
				</AlertTitle>
				<AlertDescription>{error?.message || <T id="error.unknown" />}</AlertDescription>
			</Alert>
		);
	}

	return (
		<Card className="mt-4 border-t-4 border-emerald-500/50">
			<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
				<CardTitle className="text-2xl font-bold flex items-center gap-2">
					<IconHeartbeat className="h-6 w-6" />
					<T id="monitoring.title" />
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
					<Button variant="outline" size="icon" onClick={() => showHelpModal("Monitoring", "green")}>
						<IconHelp className="h-4 w-4" />
					</Button>
					<HasPermission section={MONITORING} permission={MANAGE} hideError>
						<Button
							size="sm"
							className="bg-emerald-600/90 hover:bg-emerald-600 text-white shadow-sm"
							disabled={!data}
							onClick={handleNew}
						>
							<IconPlus className="mr-2 h-4 w-4" />
							<T id="object.add" tData={{ object: intl.formatMessage({ id: "monitor" }) }} />
						</Button>
					</HasPermission>
				</div>
			</CardHeader>
			<CardContent>
				<Table
					data={filtered ?? data ?? []}
					isFiltered={!!search}
					isFetching={isFetching}
					onEdit={handleEdit}
					onDelete={handleDeleteConfirm}
					onNew={handleNew}
					onTest={handleTest}
				/>
			</CardContent>
		</Card>
	);
}
