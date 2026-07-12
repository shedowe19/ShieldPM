import { type UseQueryOptions, useQuery } from "@tanstack/react-query";
import {
	type AuditLog,
	type AuditLogExpansion,
	type AuditLogListParams,
	type AuditLogPage,
	type AuditLogPageParams,
	getAuditLogs,
	getAuditLogsPage,
} from "src/api/backend";

type AuditLogQueryOptions = Omit<UseQueryOptions<AuditLog[], Error>, "queryFn" | "queryKey">;
type AuditLogPageQueryOptions = Omit<UseQueryOptions<AuditLogPage, Error>, "queryFn" | "queryKey">;

const fetchAuditLogs = (expand?: AuditLogExpansion[], params: AuditLogListParams = {}) => {
	return getAuditLogs(expand, params);
};

const fetchAuditLogsPage = (expand: AuditLogExpansion[] | undefined, params: AuditLogPageParams) => {
	return getAuditLogsPage(expand, params);
};

const useAuditLogs = (
	expand?: AuditLogExpansion[],
	options: AuditLogQueryOptions = {},
	params: AuditLogListParams = {},
) => {
	return useQuery<AuditLog[], Error>({
		queryKey: ["audit-logs", { expand, ...params }],
		queryFn: () => fetchAuditLogs(expand, params),
		staleTime: 10 * 1000,
		...options,
	});
};

const useAuditLogsPage = (
	expand: AuditLogExpansion[] | undefined,
	params: AuditLogPageParams,
	options: AuditLogPageQueryOptions = {},
) => {
	return useQuery<AuditLogPage, Error>({
		queryKey: ["audit-logs", { expand, ...params }],
		queryFn: () => fetchAuditLogsPage(expand, params),
		staleTime: 10 * 1000,
		...options,
	});
};

export { fetchAuditLogs, fetchAuditLogsPage, useAuditLogs, useAuditLogsPage };
