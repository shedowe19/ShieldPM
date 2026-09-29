import {
	IconChevronLeft,
	IconChevronRight,
	IconHelp,
	IconPlus,
	IconSearch,
	IconServer,
	IconSettings,
} from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import type { ColumnVisibilityState } from "@tanstack/react-table";
import { AlertCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { deleteProxyHost, toggleProxyHost } from "src/api/backend";
import { HasPermission, LoadingPage } from "src/components";
import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";
import { Button } from "src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "src/components/ui/card";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "src/components/ui/dropdown-menu";
import { Input } from "src/components/ui/input";
import { useProxyHostsPage } from "src/hooks";
import { intl, T } from "src/locale";
import { MANAGE, PROXY_HOSTS } from "src/modules/Permissions";
import { showError, showObjectSuccess } from "src/notifications";
import { AUDIT_LOG_OBJECT_TYPE } from "src/types/enums";
import { showAccessListModal, showDeleteConfirmModal, showHelpModal, showProxyHostModal } from "./lazy";
import Table from "./Table";

// Keep this chooser in the same order as the data columns defined in Table.tsx.
const proxyHostColumns = [
	{ id: "icon", labelId: "proxy-host.column-icon" },
	{ id: "owner", labelId: "proxy-host.column-owner" },
	{ id: "domainNames", labelId: "column.source" },
	{ id: "forwardHost", labelId: "column.destination" },
	{ id: "certificate", labelId: "column.ssl" },
	{ id: "accessList", labelId: "column.access" },
	{ id: "enabled", labelId: "column.status" },
	{ id: "monitor", labelId: "proxy-host.monitor.column" },
	{ id: "latency", labelId: "proxy-host.monitor.latency-column" },
] as const;

const columnVisibilityStorageKey = "shieldpm.proxy-host-columns";
const availableColumnIds = new Set<string>(proxyHostColumns.map(({ id }) => id));

function getSavedColumnVisibility(): ColumnVisibilityState {
	try {
		const saved = window.localStorage.getItem(columnVisibilityStorageKey);
		if (!saved) return {};
		const parsed: unknown = JSON.parse(saved);
		if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
		return Object.fromEntries(
			Object.entries(parsed).filter(
				([id, visible]) => availableColumnIds.has(id) && typeof visible === "boolean",
			),
		);
	} catch {
		// A blocked storage API or invalid saved value should leave all columns visible.
		return {};
	}
}

export default function TableWrapper() {
	const queryClient = useQueryClient();
	const [search, setSearch] = useState("");
	const [page, setPage] = useState(1);
	const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>(getSavedColumnVisibility);
	const { isFetching, isLoading, isError, error, data } = useProxyHostsPage(
		["owner", "access_list", AUDIT_LOG_OBJECT_TYPE.CERTIFICATE],
		{
			limit: 100,
			page,
			query: search.trim().toLowerCase(),
		},
	);
	const rows = data?.items ?? [];
	const pagination = data?.pagination;

	useEffect(() => {
		try {
			window.localStorage.setItem(columnVisibilityStorageKey, JSON.stringify(columnVisibility));
		} catch {
			// Column selection still works during this session when storage is unavailable.
		}
	}, [columnVisibility]);

	useEffect(() => {
		if (!isFetching && pagination?.page === page && page > Math.max(1, pagination.totalPages)) {
			setPage(Math.max(1, pagination.totalPages));
		}
	}, [isFetching, page, pagination]);

	const handleDelete = async (id: number) => {
		await deleteProxyHost(id);
		queryClient.invalidateQueries({ queryKey: ["proxy-host-monitors"] });
		showObjectSuccess(AUDIT_LOG_OBJECT_TYPE.PROXY_HOST, "deleted");
	};

	const handleDisableToggle = async (id: number, enabled: boolean) => {
		try {
			await toggleProxyHost(id, enabled);
			queryClient.invalidateQueries({ queryKey: ["proxy-hosts"] });
			queryClient.invalidateQueries({ queryKey: [AUDIT_LOG_OBJECT_TYPE.PROXY_HOST, id] });
			queryClient.invalidateQueries({ queryKey: ["proxy-host-monitors"] });
			showObjectSuccess(AUDIT_LOG_OBJECT_TYPE.PROXY_HOST, enabled ? "enabled" : "disabled");
		} catch (error) {
			showError(error instanceof Error ? error.message : String(error));
		}
	};

	return (
		<Card className="mt-4 border-t-4 border-lime-500/50">
			<CardHeader className="flex flex-col items-stretch justify-between gap-3 space-y-0 pb-2 lg:flex-row lg:items-center">
				<CardTitle className="text-2xl font-bold flex items-center gap-2">
					<IconServer className="h-6 w-6" />
					<T id="proxy-hosts" />
				</CardTitle>
				<div className="flex flex-wrap items-center justify-end gap-2">
					{rows.length > 0 || search !== "" || isLoading || isError ? (
						<div className="relative w-full max-w-sm">
							<IconSearch className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
							<Input
								type="search"
								placeholder={intl.formatMessage({ id: "search.placeholder" })}
								className="pl-8 h-9"
								value={search}
								onChange={(e) => {
									setPage(1);
									setSearch(e.target.value);
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
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="outline" size="sm" className="gap-2">
								<IconSettings className="h-4 w-4" aria-hidden="true" />
								<T id="proxy-host.columns" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="max-h-[70vh] overflow-y-auto">
							<DropdownMenuLabel>
								<T id="proxy-host.columns" />
							</DropdownMenuLabel>
							<DropdownMenuSeparator />
							{proxyHostColumns.map(({ id, labelId }) => (
								<DropdownMenuCheckboxItem
									key={id}
									checked={columnVisibility[id] !== false}
									onCheckedChange={(checked) =>
										setColumnVisibility((current) => ({ ...current, [id]: checked === true }))
									}
									onSelect={(event) => event.preventDefault()}
								>
									<T id={labelId} />
								</DropdownMenuCheckboxItem>
							))}
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</CardHeader>
			<CardContent>
				{isLoading ? (
					<LoadingPage />
				) : isError ? (
					<Alert variant="destructive">
						<AlertCircle className="h-4 w-4" />
						<AlertTitle>Error</AlertTitle>
						<AlertDescription>{error?.message || <T id="error.unknown" />}</AlertDescription>
					</Alert>
				) : (
					<>
						<Table
							data={rows}
							columnVisibility={columnVisibility}
							isFiltered={!!search}
							isFetching={isFetching}
							onEditAccessList={(id: number) => void showAccessListModal(id)}
							onEdit={(id: number) => void showProxyHostModal(id)}
							onDelete={(id: number) =>
								showDeleteConfirmModal({
									title: (
										<T id="object.delete" tData={{ object: AUDIT_LOG_OBJECT_TYPE.PROXY_HOST }} />
									),
									onConfirm: () => handleDelete(id),
									invalidations: [["proxy-hosts"], [AUDIT_LOG_OBJECT_TYPE.PROXY_HOST, id]],
									children: (
										<T
											id="object.delete.content"
											tData={{ object: AUDIT_LOG_OBJECT_TYPE.PROXY_HOST }}
										/>
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
									<T
										id="pagination.page-info"
										data={{ current: page, total: pagination.totalPages }}
									/>
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
					</>
				)}
			</CardContent>
		</Card>
	);
}
