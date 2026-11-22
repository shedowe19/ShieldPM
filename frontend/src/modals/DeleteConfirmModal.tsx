import { type QueryKey, useQueryClient } from "@tanstack/react-query";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { AlertCircle, AlertTriangle } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";
import { Badge } from "src/components/ui/badge";
import { Button } from "src/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "src/components/ui/dialog";
import { intl, T } from "src/locale";

interface ShowProps {
	title?: ReactNode;
	tTitle?: string;
	children: ReactNode;
	onConfirm: () => Promise<void> | void;
	invalidations?: QueryKey[];
	/** Optional explicit identity, useful when the object is not in the query cache. */
	objectName?: string;
	objectType?: string;
	/** Optional explicit dependent objects, e.g. hosts using an access list. */
	dependencies?: string[];
}

type Props = InnerModalProps & ShowProps;

type CacheRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is CacheRecord =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const collectRecords = (value: unknown, out: CacheRecord[]) => {
	if (Array.isArray(value)) {
		for (const entry of value) collectRecords(entry, out);
		return;
	}
	if (!isRecord(value)) return;
	if (typeof value.id === "number") out.push(value);
	if (Array.isArray(value.data)) collectRecords(value.data, out);
	if (Array.isArray(value.pages)) collectRecords(value.pages, out);
};

const readText = (record: CacheRecord, keys: string[]): string | null => {
	for (const key of keys) {
		const value = record[key];
		if (typeof value === "string" && value.trim()) return value;
	}
	return null;
};

const readObjectName = (record: CacheRecord): string | null => {
	const domains = record.domainNames ?? record.domain_names;
	if (Array.isArray(domains)) {
		const names = domains.filter((domain): domain is string => typeof domain === "string" && !!domain);
		if (names.length > 0) return names.join(", ");
	}
	return readText(record, ["nice_name", "niceName", "email", "name", "nickname", "forwardHost", "forward_host"]);
};

const readReferenceId = (record: CacheRecord, keys: string[]): number | undefined => {
	for (const key of keys) {
		const value = record[key];
		if (typeof value === "number") return value;
	}
	return undefined;
};

const findCacheRecord = (
	queryClient: ReturnType<typeof useQueryClient>,
	listKey: QueryKey | undefined,
	id: number | undefined,
): CacheRecord | undefined => {
	if (id === undefined) return undefined;
	const records: CacheRecord[] = [];
	const keys = listKey ? [listKey] : [];
	for (const key of keys) {
		for (const [, data] of queryClient.getQueriesData<unknown>({ queryKey: key })) {
			collectRecords(data, records);
		}
	}
	return records.find((record) => record.id === id);
};

const findDependents = (
	queryClient: ReturnType<typeof useQueryClient>,
	objectType: string | undefined,
	id: number | undefined,
	record?: CacheRecord,
): string[] => {
	if (id === undefined) return [];
	const dependents = new Map<string, string>();
	const addHost = (host: unknown) => {
		if (!isRecord(host)) return;
		const hostId = typeof host.id === "number" ? host.id : undefined;
		const name = readObjectName(host) ?? (hostId ? `#${hostId}` : null);
		if (name) dependents.set(name, name);
	};
	// Expanded API responses (for example access lists with `proxy_hosts`) can
	// already carry the dependents; use them before scanning other cached lists.
	if (objectType === "access-list" && Array.isArray(record?.proxy_hosts)) {
		for (const host of record.proxy_hosts) addHost(host);
	}
	if (objectType === "certificate" && record) {
		for (const key of ["proxy_hosts", "redirection_hosts", "dead_hosts", "streams"]) {
			const hosts = record[key];
			if (Array.isArray(hosts)) for (const host of hosts) addHost(host);
		}
	}
	const records: CacheRecord[] = [];
	for (const key of ["proxy-hosts", "redirection-hosts", "dead-hosts", "streams"]) {
		for (const [, data] of queryClient.getQueriesData<unknown>({ queryKey: [key] })) {
			collectRecords(data, records);
		}
	}
	for (const cached of records) {
		const hostId = typeof cached.id === "number" ? cached.id : undefined;
		let matches = false;
		if (objectType === "access-list") {
			matches = readReferenceId(cached, ["accessListId", "access_list_id"]) === id;
		} else if (objectType === "certificate") {
			matches = readReferenceId(cached, ["certificateId", "certificate_id"]) === id;
		} else if (objectType === "firewall-list") {
			const meta = cached.meta;
			if (isRecord(meta) && isRecord(meta.ipFirewall)) {
				const listIds = meta.ipFirewall.listIds;
				matches = Array.isArray(listIds) && listIds.includes(id);
			}
		}
		if (!matches) continue;
		const name = readObjectName(cached) ?? (hostId ? `#${hostId}` : null);
		if (name) dependents.set(name, name);
	}
	return [...dependents.values()];
};

const showDeleteConfirmModal = (props: ShowProps) => {
	EasyModal.show(DeleteConfirmModal, props);
};

const DeleteConfirmModal = EasyModal.create(
	({
		title,
		tTitle,
		children,
		onConfirm,
		invalidations,
		objectName,
		objectType,
		dependencies,
		visible,
		remove,
	}: Props) => {
		const queryClient = useQueryClient();
		const [error, setError] = useState<ReactNode | null>(null);
		const [isSubmitting, setIsSubmitting] = useState(false);
		const [confirmed, setConfirmed] = useState(false);

		const identity = useMemo(() => {
			const tuple = (invalidations ?? []).find(
				(key): key is [string, number] =>
					Array.isArray(key) && key.length === 2 && typeof key[0] === "string" && typeof key[1] === "number",
			);
			const resolvedType = objectType ?? tuple?.[0];
			const resolvedId = tuple?.[1];
			const record = findCacheRecord(queryClient, invalidations?.[0], resolvedId);
			const resolvedName = objectName ?? (record ? readObjectName(record) : null);
			const resolvedDependents = dependencies ?? findDependents(queryClient, resolvedType, resolvedId, record);
			return { type: resolvedType, id: resolvedId, name: resolvedName, dependents: resolvedDependents };
		}, [dependencies, invalidations, objectIdKey(invalidations), objectName, objectType, queryClient]);

		const typeLabel = identity.type
			? intl.formatMessage({ id: identity.type, defaultMessage: identity.type })
			: null;

		const onSubmit = async () => {
			if (isSubmitting || confirmed) return;
			setIsSubmitting(true);
			setError(null);
			try {
				await onConfirm();
				setConfirmed(true);
				await Promise.all((invalidations ?? []).map((queryKey) => queryClient.invalidateQueries({ queryKey })));
				remove();
			} catch (err) {
				setError(<T id={err instanceof Error ? err.message : "error.unknown"} />);
			} finally {
				setIsSubmitting(false);
			}
		};

		return (
			<Dialog open={visible} onOpenChange={(open) => !open && !isSubmitting && remove()}>
				<DialogContent className="sm:max-w-[425px]" aria-describedby={undefined}>
					<DialogHeader>
						<DialogTitle>{tTitle ? <T id={tTitle} /> : title ? title : null}</DialogTitle>
					</DialogHeader>

					{error && (
						<Alert variant="destructive" className="mb-4">
							<AlertCircle className="h-4 w-4" />
							<AlertTitle>
								<T id="error.title" />
							</AlertTitle>
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					)}

					<div className="flex flex-col items-center justify-center text-center p-4">
						<AlertTriangle className="h-12 w-12 text-destructive mb-4" aria-hidden="true" />
						<div className="text-center">{children}</div>
						{(typeLabel || identity.name) && (
							<dl className="mt-4 w-full space-y-1 rounded-md border bg-muted/40 p-3 text-left text-sm">
								{typeLabel && (
									<div className="flex items-start justify-between gap-3">
										<dt className="font-medium">
											<T id="objectType" />
										</dt>
										<dd className="text-right">{typeLabel}</dd>
									</div>
								)}
								{identity.name && (
									<div className="flex items-start justify-between gap-3">
										<dt className="font-medium">
											<T id="name" />
										</dt>
										<dd className="text-right break-all">{identity.name}</dd>
									</div>
								)}
								{identity.dependents.length > 0 && (
									<div className="flex items-start justify-between gap-3">
										<dt className="font-medium">
											<T id="hosts" />
										</dt>
										<dd className="text-right">
											<Badge variant="outline" className="mb-1">
												<T id="certificate.in-use" />
											</Badge>
											<div className="break-all">{identity.dependents.join(", ")}</div>
										</dd>
									</div>
								)}
							</dl>
						)}
					</div>

					<DialogFooter>
						<Button variant="outline" onClick={remove} disabled={isSubmitting}>
							<T id={confirmed ? "action.close" : "cancel"} />
						</Button>
						<Button variant="destructive" onClick={onSubmit} disabled={isSubmitting || confirmed}>
							{isSubmitting ? (
								"..."
							) : typeLabel ? (
								<T id="object.delete" tData={{ object: identity.type as string }} />
							) : (
								<T id="action.delete" />
							)}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		);
	},
);

// Query keys are arrays; this keeps the memo dependency stable for the common case
// while still reacting when a caller opens the dialog for another object.
function objectIdKey(invalidations: QueryKey[] | undefined): string {
	return JSON.stringify(invalidations ?? []);
}

export { showDeleteConfirmModal };
