import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createDeadHost, type DeadHost, getDeadHost, updateDeadHost } from "src/api/backend";
import { AUDIT_LOG_OBJECT_TYPE } from "src/types/enums";
import { optimisticQueryUpdate } from "./optimisticQueryUpdate";

const fetchDeadHost = (id: number | "new") => {
	if (id === "new") {
		return Promise.resolve({
			id: 0,
			createdOn: "",
			modifiedOn: "",
			ownerUserId: 0,
			domainNames: [],
			certificateId: 0,
			sslForced: false,
			advancedConfig: "",
			meta: {},
			http2Support: false,
			enabled: true,
			hstsEnabled: false,
			hstsSubdomains: false,
		} as DeadHost);
	}
	return getDeadHost(id, ["owner"]);
};

const useDeadHost = (id: number | "new", options = {}) => {
	return useQuery<DeadHost, Error>({
		queryKey: [AUDIT_LOG_OBJECT_TYPE.DEAD_HOST, id],
		queryFn: () => fetchDeadHost(id),
		staleTime: 60 * 1000, // 1 minute
		...options,
	});
};

const useSetDeadHost = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (values: DeadHost) => (values.id ? updateDeadHost(values) : createDeadHost(values)),
		onMutate: (values: DeadHost) => {
			if (!values.id) {
				return () => {};
			}
			return optimisticQueryUpdate<DeadHost>(
				queryClient,
				[AUDIT_LOG_OBJECT_TYPE.DEAD_HOST, values.id],
				(old) => ({
					...old,
					...values,
				}),
			);
		},
		onError: (_, __, rollback: (() => void) | undefined) => rollback?.(),
		onSettled: (data, _error, values) => {
			const id = data?.id ?? values.id;
			queryClient.invalidateQueries({ queryKey: [AUDIT_LOG_OBJECT_TYPE.DEAD_HOST, id] });
			queryClient.invalidateQueries({ queryKey: ["dead-hosts"] });
			queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
			queryClient.invalidateQueries({ queryKey: ["host-report"] });
			queryClient.invalidateQueries({ queryKey: ["certificates"] });
		},
	});
};

export { useDeadHost, useSetDeadHost };
