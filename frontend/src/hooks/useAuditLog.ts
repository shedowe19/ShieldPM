import { useQuery } from "@tanstack/react-query";
import { type AuditLog, getAuditLog } from "src/api/backend";
import { AUDIT_LOG_OBJECT_TYPE } from "src/types/enums";

const fetchAuditLog = (id: number) => {
	return getAuditLog(id, [AUDIT_LOG_OBJECT_TYPE.USER]);
};

const useAuditLog = (id: number, options = {}) => {
	return useQuery<AuditLog, Error>({
		queryKey: ["audit-log", id],
		queryFn: () => fetchAuditLog(id),
		staleTime: 5 * 60 * 1000, // 5 minutes
		...options,
	});
};

export { useAuditLog };
