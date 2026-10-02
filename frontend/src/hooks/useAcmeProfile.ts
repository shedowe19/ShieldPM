import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getAcmeProfile, updateAcmeProfile } from "src/api/backend/acmeProfile";

export const acmeProfileQueryKey = ["acme-profile"] as const;

export function useAcmeProfile(options: { enabled?: boolean } = {}) {
	return useQuery({
		queryKey: acmeProfileQueryKey,
		queryFn: getAcmeProfile,
		retry: false,
		...options,
	});
}

export function useSetAcmeProfile() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: updateAcmeProfile,
		onMutate: () => queryClient.cancelQueries({ queryKey: acmeProfileQueryKey }),
		onSuccess: (settings) => {
			queryClient.setQueryData(acmeProfileQueryKey, settings);
			queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
		},
	});
}
