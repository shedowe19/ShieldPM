import { type UseQueryOptions, useQuery } from "@tanstack/react-query";
import { type AuditLog, type AuditLogExpansion, getAuditLogs } from "src/api/backend";

type AuditLogQueryOptions = Omit<UseQueryOptions<AuditLog[], Error>, "queryFn" | "queryKey">;

const fetchAuditLogs = (expand?: AuditLogExpansion[], query = "") => {
	return getAuditLogs(expand, query ? { query } : {});
};

const useAuditLogs = (expand?: AuditLogExpansion[], options: AuditLogQueryOptions = {}, query = "") => {
	return useQuery<AuditLog[], Error>({
		queryKey: ["audit-logs", { expand, query }],
		queryFn: () => fetchAuditLogs(expand, query),
		staleTime: 10 * 1000,
		...options,
	});
};

export { fetchAuditLogs, useAuditLogs };
