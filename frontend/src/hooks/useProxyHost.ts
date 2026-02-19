import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createProxyHost, getProxyHost, type ProxyHost, updateProxyHost } from "src/api/backend";
import { AUDIT_LOG_OBJECT_TYPE, FORWARD_SCHEME } from "src/types/enums";

const fetchProxyHost = (id: number | "new") => {
	if (id === "new") {
		return Promise.resolve({
			id: 0,
			createdOn: "",
			modifiedOn: "",
			ownerUserId: 0,
			domainNames: [],
			forwardHost: "",
			forwardPort: 0,
			accessListId: 0,
			certificateId: 0,
			sslForced: false,
			cachingEnabled: false,
			blockExploits: false,
			securityCrowdsec: false,
			anubisEnabled: false,
			advancedConfig: "",
			bandwidthLimit: "",
			meta: {},
			allowWebsocketUpgrade: false,
			http2Support: false,
			forwardScheme: FORWARD_SCHEME.HTTP,
			enabled: true,
			hstsEnabled: false,
			hstsSubdomains: false,
			maintenanceOnFailure: false,
			disableBuffering: false,
			maintenanceActive: false,
		} as ProxyHost);
	}
	return getProxyHost(id, ["owner"]);
};

const useProxyHost = (id: number | "new", options = {}) => {
	return useQuery<ProxyHost, Error>({
		queryKey: [AUDIT_LOG_OBJECT_TYPE.PROXY_HOST, id],
		queryFn: () => fetchProxyHost(id),
		staleTime: 60 * 1000, // 1 minute
		...options,
	});
};

const useSetProxyHost = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (values: ProxyHost) => (values.id ? updateProxyHost(values) : createProxyHost(values)),
		onMutate: (values: ProxyHost) => {
			if (!values.id) {
				return () => {};
			}
			const previousObject = queryClient.getQueryData([AUDIT_LOG_OBJECT_TYPE.PROXY_HOST, values.id]);
			queryClient.setQueryData([AUDIT_LOG_OBJECT_TYPE.PROXY_HOST, values.id], (old: ProxyHost) => ({
				...old,
				...values,
			}));
			return () => queryClient.setQueryData([AUDIT_LOG_OBJECT_TYPE.PROXY_HOST, values.id], previousObject);
		},
		onError: (_: Error, __: ProxyHost, rollback: (() => void) | undefined) => rollback?.(),
		onSuccess: async ({ id }: ProxyHost) => {
			queryClient.invalidateQueries({ queryKey: [AUDIT_LOG_OBJECT_TYPE.PROXY_HOST, id] });
			queryClient.invalidateQueries({ queryKey: ["proxy-hosts"] });
			queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
			queryClient.invalidateQueries({ queryKey: ["host-report"] });
			queryClient.invalidateQueries({ queryKey: ["certificates"] });
		},
	});
};

export { useProxyHost, useSetProxyHost };
