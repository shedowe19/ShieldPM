import { IconDownload, IconHistory, IconSearch } from "@tabler/icons-react";
import { AlertCircle } from "lucide-react";
import { useState } from "react";
import { LoadingPage } from "src/components";
import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";
import { Button } from "src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "src/components/ui/card";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "src/components/ui/select";
import { useAuditLogs } from "src/hooks";
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
	const [action, setAction] = useState("");
	const [objectType, setObjectType] = useState("");
	const [createdAfter, setCreatedAfter] = useState("");
	const [createdBefore, setCreatedBefore] = useState("");
	const [search, setSearch] = useState("");
	const [userId, setUserId] = useState("");
	const [objectId, setObjectId] = useState("");
	const createdAfterUtc = toUtcDateTime(createdAfter);
	const createdBeforeUtc = toUtcDateTime(createdBefore);
	const userIdFilter = toPositiveId(userId);
	const objectIdFilter = toPositiveId(objectId);
	const query = search.trim();
	const filters = {
		...(action ? { action } : {}),
		...(objectType ? { object_type: objectType } : {}),
		...(userIdFilter ? { user_id: userIdFilter } : {}),
		...(objectIdFilter ? { object_id: objectIdFilter } : {}),
		...(query ? { query } : {}),
		...(createdAfterUtc ? { created_after: createdAfterUtc } : {}),
		...(createdBeforeUtc ? { created_before: createdBeforeUtc } : {}),
	};
	const { isFetching, isLoading, isError, error, data } = useAuditLogs(["user"], {}, filters);
	const downloadCsv = () => {
		const csv = createAuditLogCsv(data ?? [], {
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
				{data?.length || Object.keys(filters).length > 0 ? (
					<div className="flex w-full flex-wrap items-end gap-2 xl:w-auto xl:flex-nowrap">
						<Button
							className="h-9"
							disabled={!data?.length}
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
								onChange={(event) => setSearch(event.target.value)}
							/>
						</div>
						<div className="space-y-1">
							<Label className="text-xs text-muted-foreground" htmlFor="audit-log-action">
								<T id="audit-log.csv.action" />
							</Label>
							<Select
								name="audit-log-action"
								value={action || allAuditLogActions}
								onValueChange={(value) => setAction(value === allAuditLogActions ? "" : value)}
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
								onValueChange={(value) => setObjectType(value === allAuditLogObjectTypes ? "" : value)}
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
								onChange={(event) => setUserId(event.target.value)}
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
								onChange={(event) => setObjectId(event.target.value)}
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
								value={createdAfter}
								onChange={(event) => setCreatedAfter(event.target.value)}
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
								value={createdBefore}
								onChange={(event) => setCreatedBefore(event.target.value)}
							/>
						</div>
					</div>
				) : null}
			</CardHeader>
			<CardContent>
				<Table data={data ?? []} isFetching={isFetching} onSelectItem={showEventDetailsModal} />
			</CardContent>
		</Card>
	);
}
