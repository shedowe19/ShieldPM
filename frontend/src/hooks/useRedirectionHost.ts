import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	createRedirectionHost,
	getRedirectionHost,
	type RedirectionHost,
	updateRedirectionHost,
} from "src/api/backend";
import { AUDIT_LOG_OBJECT_TYPE, FORWARD_SCHEME } from "src/types/enums";

const fetchRedirectionHost = (id: number | "new") => {
	if (id === "new") {
		return Promise.resolve({
			id: 0,
			createdOn: "",
			modifiedOn: "",
			ownerUserId: 0,
			domainNames: [],
			forwardDomainName: "",
			preservePath: false,
			certificateId: 0,
			sslForced: false,
			advancedConfig: "",
			meta: {},
			http2Support: false,
			forwardScheme: FORWARD_SCHEME.AUTO,
			forwardHttpCode: 301,
			blockExploits: false,
			enabled: true,
			hstsEnabled: false,
			hstsSubdomains: false,
		} as RedirectionHost);
	}
	return getRedirectionHost(id, ["owner"]);
};

const useRedirectionHost = (id: number | "new", options = {}) => {
	return useQuery<RedirectionHost, Error>({
		queryKey: [AUDIT_LOG_OBJECT_TYPE.REDIRECTION_HOST, id],
		queryFn: () => fetchRedirectionHost(id),
		staleTime: 60 * 1000, // 1 minute
		...options,
	});
};

const useSetRedirectionHost = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (values: RedirectionHost) =>
			values.id ? updateRedirectionHost(values) : createRedirectionHost(values),
		onMutate: (values: RedirectionHost) => {
			if (!values.id) {
				return () => {};
			}
			const previousObject = queryClient.getQueryData([AUDIT_LOG_OBJECT_TYPE.REDIRECTION_HOST, values.id]);
			queryClient.setQueryData([AUDIT_LOG_OBJECT_TYPE.REDIRECTION_HOST, values.id], (old: RedirectionHost) => ({
				...old,
				...values,
			}));
			return () => queryClient.setQueryData([AUDIT_LOG_OBJECT_TYPE.REDIRECTION_HOST, values.id], previousObject);
		},
		onError: (_, __, rollback: (() => void) | undefined) => rollback?.(),
		onSuccess: async ({ id }: RedirectionHost) => {
			queryClient.invalidateQueries({ queryKey: [AUDIT_LOG_OBJECT_TYPE.REDIRECTION_HOST, id] });
			queryClient.invalidateQueries({ queryKey: ["redirection-hosts"] });
			queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
			queryClient.invalidateQueries({ queryKey: ["host-report"] });
			queryClient.invalidateQueries({ queryKey: ["certificates"] });
		},
	});
};

export { useRedirectionHost, useSetRedirectionHost };
