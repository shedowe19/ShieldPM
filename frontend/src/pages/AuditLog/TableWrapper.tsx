import { IconChevronLeft, IconChevronRight, IconDownload, IconHistory, IconSearch } from "@tabler/icons-react";
import { AlertCircle } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { LoadingPage } from "src/components";
import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";
import { Button } from "src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "src/components/ui/card";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "src/components/ui/select";
import { useAuditLogsPage } from "src/hooks";
import { intl, T } from "src/locale";
import { AUDIT_LOG_OBJECT_TYPE } from "src/types/enums";
import { createAuditLogCsv } from "./audit-log-csv";
import { showEventDetailsModal } from "./lazy";
import Table from "./Table";

const toUtcDateTime = (value: string) => {
	if (!value) {
		return undefined;
	}

	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};

const toLocalDateTime = (value: string) => {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return "";
	}

	return new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000).toISOString().slice(0, 16);
};

const toPositiveId = (value: string) => {
	const id = Number(value);
	return Number.isSafeInteger(id) && id > 0 ? id : undefined;
};

const allAuditLogActions = "__all_audit_log_actions__";
const allAuditLogObjectTypes = "__all_audit_log_object_types__";
const auditLogActions = ["created", "updated", "deleted", "enabled", "disabled", "renewed"] as const;
const auditLogObjectTypes = [...Object.values(AUDIT_LOG_OBJECT_TYPE), "wireguard-peer", "wireguard-settings"] as const;
const auditLogObjectTypeMessageIds: Record<string, string> = {
	[AUDIT_LOG_OBJECT_TYPE.CLOUDFLARED_TUNNEL]: "cloudflared.title",
	[AUDIT_LOG_OBJECT_TYPE.TERMINAL_HOST]: "terminal.host",
	"wireguard-peer": "audit-log.filter.wireguard-peer",
	"wireguard-settings": "audit-log.filter.wireguard-settings",
};

const formatAuditLogAction = (action: (typeof auditLogActions)[number]) => {
	return intl.formatMessage({ id: `object.event.${action}` }, { object: "" }).trim();
};

const formatAuditLogObjectType = (objectType: (typeof auditLogObjectTypes)[number]) => {
	return intl.formatMessage({ id: auditLogObjectTypeMessageIds[objectType] ?? objectType });
};

export default function TableWrapper() {
	const [searchParams, setSearchParams] = useSearchParams();
	const action = searchParams.get("action") ?? "";
	const objectType = searchParams.get("object_type") ?? "";
	const createdAfter = toUtcDateTime(searchParams.get("created_after") ?? "") ?? "";
	const createdBefore = toUtcDateTime(searchParams.get("created_before") ?? "") ?? "";
	const search = searchParams.get("query") ?? "";
	const userId = searchParams.get("user_id") ?? "";
	const objectId = searchParams.get("object_id") ?? "";
	const page = toPositiveId(searchParams.get("page") ?? "") ?? 1;
	const userIdFilter = toPositiveId(userId);
	const objectIdFilter = toPositiveId(objectId);
	const query = search.trim();
	const filters = {
		...(action ? { action } : {}),
		...(objectType ? { object_type: objectType } : {}),
		...(userIdFilter ? { user_id: userIdFilter } : {}),
		...(objectIdFilter ? { object_id: objectIdFilter } : {}),
		...(query ? { query } : {}),
		...(createdAfter ? { created_after: createdAfter } : {}),
		...(createdBefore ? { created_before: createdBefore } : {}),
	};
	const updateSearchParams = (nextFilters: {
		action?: string;
		createdAfter?: string;
		createdBefore?: string;
		objectId?: string;
		objectType?: string;
		page?: number;
		search?: string;
		userId?: string;
	}) => {
		const nextAction = nextFilters.action ?? action;
		const nextObjectType = nextFilters.objectType ?? objectType;
		const nextCreatedAfter = nextFilters.createdAfter ?? createdAfter;
		const nextCreatedBefore = nextFilters.createdBefore ?? createdBefore;
		const nextSearch = nextFilters.search ?? search;
		const nextUserId = nextFilters.userId ?? userId;
		const nextObjectId = nextFilters.objectId ?? objectId;
		const nextPage = nextFilters.page ?? page;
		const params = new URLSearchParams();
		const nextUserIdFilter = toPositiveId(nextUserId);
		const nextObjectIdFilter = toPositiveId(nextObjectId);
		const nextQuery = nextSearch.trim();

		if (nextAction) {
			params.set("action", nextAction);
		}
		if (nextObjectType) {
			params.set("object_type", nextObjectType);
		}
		if (nextUserIdFilter) {
			params.set("user_id", nextUserIdFilter.toString());
		}
		if (nextObjectIdFilter) {
			params.set("object_id", nextObjectIdFilter.toString());
		}
		if (nextQuery) {
			params.set("query", nextSearch);
		}
		if (nextCreatedAfter) {
			params.set("created_after", nextCreatedAfter);
		}
		if (nextCreatedBefore) {
			params.set("created_before", nextCreatedBefore);
		}
		if (nextPage > 1) {
			params.set("page", nextPage.toString());
		}

		setSearchParams(params, { replace: true });
	};
	const { isFetching, isLoading, isError, error, data } = useAuditLogsPage(["user"], {
		...filters,
		limit: 100,
		page,
	});
	const rows = data?.items ?? [];
	const pagination = data?.pagination;
	const downloadCsv = () => {
		const csv = createAuditLogCsv(rows, {
			action: intl.formatMessage({ id: "audit-log.csv.action" }),
			createdOn: intl.formatMessage({ id: "audit-log.csv.created-on" }),
			metadata: intl.formatMessage({ id: "audit-log.csv.metadata" }),
			objectId: intl.formatMessage({ id: "audit-log.csv.object-id" }),
			objectType: intl.formatMessage({ id: "audit-log.csv.object-type" }),
			user: intl.formatMessage({ id: "audit-log.csv.user" }),
		});
		const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
		const anchor = document.createElement("a");
		anchor.href = url;
		anchor.download = "audit-log.csv";
		anchor.click();
		URL.revokeObjectURL(url);
	};

	if (isLoading) {
		return <LoadingPage />;
	}

	if (isError) {
		return (
			<Alert variant="destructive">
				<AlertCircle className="h-4 w-4" />
				<AlertTitle>
					<T id="error.title" />
				</AlertTitle>
				<AlertDescription>{error?.message || <T id="error.unknown" />}</AlertDescription>
			</Alert>
		);
	}

	return (
		<Card className="mt-4 border-t-4 border-purple-500/50">
			<CardHeader className="flex flex-col gap-3 space-y-0 pb-2 xl:flex-row xl:items-center xl:justify-between">
				<CardTitle className="text-2xl font-bold flex items-center gap-2">
					<IconHistory className="h-6 w-6" />
					<T id="auditlogs" />
				</CardTitle>
				{rows.length || Object.keys(filters).length > 0 ? (
					<div className="flex w-full flex-wrap items-end gap-2 xl:w-auto xl:flex-nowrap">
						<Button
							className="h-9"
							disabled={!rows.length}
							onClick={downloadCsv}
							type="button"
							variant="outline"
						>
							<IconDownload className="h-4 w-4" />
							<T id="audit-log.export.csv" />
						</Button>
						<div className="relative min-w-52 flex-1 xl:w-56">
							<IconSearch className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
							<Input
								type="search"
								aria-label={intl.formatMessage({ id: "search.placeholder" })}
								placeholder={intl.formatMessage({ id: "search.placeholder" })}
								className="h-9 pl-8"
								value={search}
								onChange={(event) => {
									updateSearchParams({ page: 1, search: event.target.value });
								}}
							/>
						</div>
						<div className="space-y-1">
							<Label className="text-xs text-muted-foreground" htmlFor="audit-log-action">
								<T id="audit-log.csv.action" />
							</Label>
							<Select
								name="audit-log-action"
								value={action || allAuditLogActions}
								onValueChange={(value) => {
									const nextAction = value === allAuditLogActions ? "" : value;
									updateSearchParams({ action: nextAction, page: 1 });
								}}
							>
								<SelectTrigger className="h-9 min-w-36" id="audit-log-action">
									<SelectValue
										placeholder={intl.formatMessage({ id: "audit-log.filter.all-actions" })}
									/>
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={allAuditLogActions}>
										<T id="audit-log.filter.all-actions" />
									</SelectItem>
									{auditLogActions.map((auditLogAction) => (
										<SelectItem key={auditLogAction} value={auditLogAction}>
											{formatAuditLogAction(auditLogAction)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-1">
							<Label className="text-xs text-muted-foreground" htmlFor="audit-log-object-type">
								<T id="audit-log.csv.object-type" />
							</Label>
							<Select
								name="audit-log-object-type"
								value={objectType || allAuditLogObjectTypes}
								onValueChange={(value) => {
									const nextObjectType = value === allAuditLogObjectTypes ? "" : value;
									updateSearchParams({ objectType: nextObjectType, page: 1 });
								}}
							>
								<SelectTrigger className="h-9 min-w-36" id="audit-log-object-type">
									<SelectValue
										placeholder={intl.formatMessage({ id: "audit-log.filter.all-object-types" })}
									/>
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={allAuditLogObjectTypes}>
										<T id="audit-log.filter.all-object-types" />
									</SelectItem>
									{auditLogObjectTypes.map((auditLogObjectType) => (
										<SelectItem key={auditLogObjectType} value={auditLogObjectType}>
											{formatAuditLogObjectType(auditLogObjectType)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-1">
							<Label className="text-xs text-muted-foreground" htmlFor="audit-log-user-id">
								<T id="audit-log.filter.user-id" />
							</Label>
							<Input
								id="audit-log-user-id"
								min="1"
								onChange={(event) => {
									updateSearchParams({ page: 1, userId: event.target.value });
								}}
								step="1"
								type="number"
								value={userId}
							/>
						</div>
						<div className="space-y-1">
							<Label className="text-xs text-muted-foreground" htmlFor="audit-log-object-id">
								<T id="audit-log.csv.object-id" />
							</Label>
							<Input
								id="audit-log-object-id"
								min="1"
								onChange={(event) => {
									updateSearchParams({ objectId: event.target.value, page: 1 });
								}}
								step="1"
								type="number"
								value={objectId}
							/>
						</div>
						<div className="space-y-1">
							<Label className="text-xs text-muted-foreground" htmlFor="audit-log-created-after">
								<T id="audit-log.filter.created-after" />
							</Label>
							<Input
								id="audit-log-created-after"
								type="datetime-local"
								step="60"
								value={toLocalDateTime(createdAfter)}
								onChange={(event) => {
									const nextCreatedAfter = toUtcDateTime(event.target.value) ?? "";
									updateSearchParams({ createdAfter: nextCreatedAfter, page: 1 });
								}}
							/>
						</div>
						<div className="space-y-1">
							<Label className="text-xs text-muted-foreground" htmlFor="audit-log-created-before">
								<T id="audit-log.filter.created-before" />
							</Label>
							<Input
								id="audit-log-created-before"
								type="datetime-local"
								step="60"
								value={toLocalDateTime(createdBefore)}
								onChange={(event) => {
									const nextCreatedBefore = toUtcDateTime(event.target.value) ?? "";
									updateSearchParams({ createdBefore: nextCreatedBefore, page: 1 });
								}}
							/>
						</div>
					</div>
				) : null}
			</CardHeader>
			<CardContent>
				<Table data={rows} isFetching={isFetching} onSelectItem={showEventDetailsModal} />
				{pagination && pagination.totalPages > 1 ? (
					<div className="mt-4 flex items-center justify-end gap-2" aria-live="polite">
						<Button
							aria-label={intl.formatMessage({ id: "pagination.previous" })}
							disabled={page === 1}
							onClick={() => {
								const nextPage = page - 1;
								updateSearchParams({ page: nextPage });
							}}
							size="icon"
							type="button"
							variant="outline"
						>
							<IconChevronLeft className="h-4 w-4" />
						</Button>
						<span className="text-sm text-muted-foreground">
							<T id="pagination.page-info" data={{ current: page, total: pagination.totalPages }} />
						</span>
						<Button
							aria-label={intl.formatMessage({ id: "pagination.next" })}
							disabled={page === pagination.totalPages}
							onClick={() => {
								const nextPage = page + 1;
								updateSearchParams({ page: nextPage });
							}}
							size="icon"
							type="button"
							variant="outline"
						>
							<IconChevronRight className="h-4 w-4" />
						</Button>
					</div>
				) : null}
			</CardContent>
		</Card>
	);
}
