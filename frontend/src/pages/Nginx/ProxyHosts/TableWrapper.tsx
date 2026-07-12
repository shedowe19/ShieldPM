import { IconChevronLeft, IconChevronRight, IconHelp, IconPlus, IconSearch, IconServer } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { deleteProxyHost, toggleProxyHost } from "src/api/backend";
import { HasPermission, LoadingPage } from "src/components";
import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";
import { Button } from "src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "src/components/ui/card";
import { Input } from "src/components/ui/input";
import { useProxyHostsPage } from "src/hooks";
import { intl, T } from "src/locale";
import { MANAGE, PROXY_HOSTS } from "src/modules/Permissions";
import { showObjectSuccess } from "src/notifications";
import { AUDIT_LOG_OBJECT_TYPE } from "src/types/enums";
import { showAccessListModal, showDeleteConfirmModal, showHelpModal, showProxyHostModal } from "./lazy";
import Table from "./Table";

export default function TableWrapper() {
	const queryClient = useQueryClient();
	const [search, setSearch] = useState("");
	const [page, setPage] = useState(1);
	const { isFetching, isLoading, isError, error, data } = useProxyHostsPage(
		["owner", "access_list", AUDIT_LOG_OBJECT_TYPE.CERTIFICATE],
		{
			limit: 100,
			page,
			query: search,
		},
	);
	const rows = data?.items ?? [];
	const pagination = data?.pagination;
	const totalItems = pagination?.totalItems ?? 0;

	useEffect(() => {
		if (page > 1 && totalItems > 0 && rows.length === 0) {
			setPage(page - 1);
		}
	}, [page, rows.length, totalItems]);

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
		await deleteProxyHost(id);
		showObjectSuccess(AUDIT_LOG_OBJECT_TYPE.PROXY_HOST, "deleted");
	};

	const handleDisableToggle = async (id: number, enabled: boolean) => {
		await toggleProxyHost(id, enabled);
		queryClient.invalidateQueries({ queryKey: ["proxy-hosts"] });
		queryClient.invalidateQueries({ queryKey: [AUDIT_LOG_OBJECT_TYPE.PROXY_HOST, id] });
		showObjectSuccess(AUDIT_LOG_OBJECT_TYPE.PROXY_HOST, enabled ? "enabled" : "disabled");
	};

	return (
		<Card className="mt-4 border-t-4 border-lime-500/50">
			<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
				<CardTitle className="text-2xl font-bold flex items-center gap-2">
					<IconServer className="h-6 w-6" />
					<T id="proxy-hosts" />
				</CardTitle>
				<div className="flex items-center space-x-2">
					{rows.length > 0 || search !== "" ? (
						<div className="relative w-full max-w-sm">
							<IconSearch className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
							<Input
								type="search"
								placeholder={intl.formatMessage({ id: "search.placeholder" })}
								className="pl-8 h-9"
								value={search}
								onChange={(e) => {
									setPage(1);
									setSearch(e.target.value.toLowerCase().trim());
								}}
							/>
						</div>
					) : null}
					<Button
						variant="outline"
						size="icon"
						aria-label={intl.formatMessage({ id: "action.help" })}
						onClick={() => showHelpModal("ProxyHosts", "lime")}
					>
						<IconHelp className="h-4 w-4" />
					</Button>
					<HasPermission section={PROXY_HOSTS} permission={MANAGE} hideError>
						{rows.length > 0 ? (
							<Button
								size="sm"
								className="bg-lime-600/90 hover:bg-lime-600 text-white shadow-sm"
								onClick={() => void showProxyHostModal("new")}
							>
								<IconPlus className="mr-2 h-4 w-4" />
								<T id="object.add" tData={{ object: AUDIT_LOG_OBJECT_TYPE.PROXY_HOST }} />
							</Button>
						) : null}
					</HasPermission>
				</div>
			</CardHeader>
			<CardContent>
				<Table
					data={rows}
					isFiltered={!!search}
					isFetching={isFetching}
					onEditAccessList={(id: number) => void showAccessListModal(id)}
					onEdit={(id: number) => void showProxyHostModal(id)}
					onDelete={(id: number) =>
						showDeleteConfirmModal({
							title: <T id="object.delete" tData={{ object: AUDIT_LOG_OBJECT_TYPE.PROXY_HOST }} />,
							onConfirm: () => handleDelete(id),
							invalidations: [["proxy-hosts"], [AUDIT_LOG_OBJECT_TYPE.PROXY_HOST, id]],
							children: (
								<T id="object.delete.content" tData={{ object: AUDIT_LOG_OBJECT_TYPE.PROXY_HOST }} />
							),
						})
					}
					onDisableToggle={handleDisableToggle}
					onNew={() => void showProxyHostModal("new")}
				/>
				{pagination && pagination.totalPages > 1 ? (
					<div className="mt-4 flex items-center justify-end gap-2" aria-live="polite">
						<Button
							variant="outline"
							size="icon"
							aria-label={intl.formatMessage({ id: "pagination.previous" })}
							disabled={page === 1}
							onClick={() => setPage(page - 1)}
						>
							<IconChevronLeft className="h-4 w-4" />
						</Button>
						<span className="text-sm text-muted-foreground">
							<T id="pagination.page-info" data={{ current: page, total: pagination.totalPages }} />
						</span>
						<Button
							variant="outline"
							size="icon"
							aria-label={intl.formatMessage({ id: "pagination.next" })}
							disabled={page === pagination.totalPages}
							onClick={() => setPage(page + 1)}
						>
							<IconChevronRight className="h-4 w-4" />
						</Button>
					</div>
				) : null}
			</CardContent>
		</Card>
	);
}
