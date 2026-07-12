import { type UseQueryOptions, useQuery } from "@tanstack/react-query";
import { type AuditLog, type AuditLogExpansion, type AuditLogListParams, getAuditLogs } from "src/api/backend";

type AuditLogQueryOptions = Omit<UseQueryOptions<AuditLog[], Error>, "queryFn" | "queryKey">;

const fetchAuditLogs = (expand?: AuditLogExpansion[], params: AuditLogListParams = {}) => {
	return getAuditLogs(expand, params);
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

export { fetchAuditLogs, useAuditLogs };
