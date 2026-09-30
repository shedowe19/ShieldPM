import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getAcmeOptions, updateAcmeOptions } from "src/api/backend/acmeOptions";

export const acmeOptionsQueryKey = ["acme-options"] as const;

export function useAcmeOptions() {
	return useQuery({ queryKey: acmeOptionsQueryKey, queryFn: getAcmeOptions, retry: false });
}

export function useSetAcmeOptions() {
	const client = useQueryClient();
	return useMutation({
		mutationFn: updateAcmeOptions,
		gcTime: 0,
		onMutate: () => client.cancelQueries({ queryKey: acmeOptionsQueryKey }),
		onSuccess: async (data) => {
			await client.cancelQueries({ queryKey: acmeOptionsQueryKey });
			client.setQueryData(acmeOptionsQueryKey, data);
			client.invalidateQueries({ queryKey: ["audit-logs"] });
		},
	});
}
