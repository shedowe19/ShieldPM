import { IconHelp, IconPlus, IconSearch, IconServer, IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";
import { useState } from "react";
import { deleteProxyHost, toggleProxyHost } from "src/api/backend";
import type { ProxyHost } from "src/api/backend";
import type { PaginationResult } from "src/api/backend/getProxyHosts";
import { HasPermission, LoadingPage } from "src/components";
import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";
import { Button } from "src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "src/components/ui/card";
import { Input } from "src/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "src/components/ui/select";
import { useProxyHosts } from "src/hooks";
import { intl, T } from "src/locale";
import { showDeleteConfirmModal, showHelpModal, showProxyHostModal } from "src/modals";
import { MANAGE, PROXY_HOSTS } from "src/modules/Permissions";
import { showObjectSuccess } from "src/notifications";
import { AUDIT_LOG_OBJECT_TYPE } from "src/types/enums";
import Table from "./Table";

export default function TableWrapper() {
	const queryClient = useQueryClient();
	const [search, setSearch] = useState("");
	const [page, setPage] = useState(1);
	const [limit, setLimit] = useState(10);

	const { isFetching, isLoading, isError, error, data } = useProxyHosts(
		["owner", "access_list", AUDIT_LOG_OBJECT_TYPE.CERTIFICATE],
		{ page, limit, query: search },
	);

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

	// Helper to check if data is paginated
	const isPaginated = (d: any): d is PaginationResult<ProxyHost> => {
		return d && typeof d === "object" && "pagination" in d && "data" in d;
	};

	const listData = isPaginated(data) ? data.data : (data as ProxyHost[]) || [];
	const pagination = isPaginated(data)
		? data.pagination
		: { page: 1, limit: listData.length, total: listData.length };

	const totalPages = Math.ceil(pagination.total / limit);

	return (
		<Card className="mt-4 border-t-4 border-lime-500/50">
			<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
				<CardTitle className="text-2xl font-bold flex items-center gap-2">
					<IconServer className="h-6 w-6" />
					<T id="proxy-hosts" />
				</CardTitle>
				<div className="flex items-center space-x-2">
					<div className="relative w-full max-w-sm">
						<IconSearch className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
						<Input
							type="search"
							placeholder={intl.formatMessage({ id: "search.placeholder" })}
							className="pl-8 h-9"
							value={search}
							onChange={(e) => {
								setSearch(e.target.value);
								setPage(1); // Reset to page 1 on search
							}}
						/>
					</div>
					<Button variant="outline" size="icon" onClick={() => showHelpModal("ProxyHosts", "lime")}>
						<IconHelp className="h-4 w-4" />
					</Button>
					<HasPermission section={PROXY_HOSTS} permission={MANAGE} hideError>
						<Button
							size="sm"
							className="bg-lime-600/90 hover:bg-lime-600 text-white shadow-sm"
							onClick={() => showProxyHostModal("new")}
						>
							<IconPlus className="mr-2 h-4 w-4" />
							<T id="object.add" tData={{ object: AUDIT_LOG_OBJECT_TYPE.PROXY_HOST }} />
						</Button>
					</HasPermission>
				</div>
			</CardHeader>
			<CardContent>
				<Table
					data={listData}
					isFiltered={!!search}
					isFetching={isFetching}
					onEdit={(id: number) => showProxyHostModal(id)}
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
					onNew={() => showProxyHostModal("new")}
				/>

				{/* Pagination Controls */}
				<div className="flex items-center justify-between mt-4">
					<div className="flex items-center space-x-2 text-sm text-muted-foreground">
						<span>
							Showing {pagination.page * pagination.limit - pagination.limit + 1}-
							{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
						</span>
						<Select
							value={`${limit}`}
							onValueChange={(val) => {
								setLimit(Number(val));
								setPage(1);
							}}
						>
							<SelectTrigger className="h-8 w-[70px]">
								<SelectValue placeholder={limit} />
							</SelectTrigger>
							<SelectContent side="top">
								{[10, 25, 50, 100].map((pageSize) => (
									<SelectItem key={pageSize} value={`${pageSize}`}>
										{pageSize}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<span>per page</span>
					</div>

					<div className="flex items-center space-x-2">
						<Button
							variant="outline"
							size="sm"
							onClick={() => setPage((p) => Math.max(1, p - 1))}
							disabled={page === 1 || isLoading}
						>
							<IconChevronLeft className="h-4 w-4" />
							Previous
						</Button>
						<div className="text-sm font-medium">
							Page {page} of {totalPages || 1}
						</div>
						<Button
							variant="outline"
							size="sm"
							onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
							disabled={page === totalPages || isLoading}
						>
							Next
							<IconChevronRight className="h-4 w-4" />
						</Button>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
