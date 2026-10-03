import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	createFirewallList,
	deleteFirewallList,
	type FirewallListInput,
	getFirewallList,
	getFirewallLists,
	previewFirewallList,
	refreshFirewallList,
	updateFirewallList,
} from "src/api/backend/firewallLists";

export function useFirewallLists(options: { enabled?: boolean } = {}) {
	return useQuery({
		queryKey: ["firewall-lists"],
		queryFn: getFirewallLists,
		staleTime: 60 * 1000,
		...options,
	});
}

export function useFirewallList(id?: number) {
	return useQuery({
		queryKey: ["firewall-list", id],
		queryFn: () => getFirewallList(id as number),
		enabled: typeof id === "number",
	});
}

function useInvalidateFirewall() {
	const queryClient = useQueryClient();
	return async () => {
		await Promise.all([
			queryClient.invalidateQueries({ queryKey: ["firewall-lists"] }),
			queryClient.invalidateQueries({ queryKey: ["firewall-list"] }),
			queryClient.invalidateQueries({ queryKey: ["proxy-hosts"] }),
			queryClient.invalidateQueries({ queryKey: ["proxy-host"] }),
			queryClient.invalidateQueries({ queryKey: ["audit-logs"] }),
		]);
	};
}

export function useSaveFirewallList() {
	const invalidate = useInvalidateFirewall();
	return useMutation({
		mutationFn: ({ id, data }: { id?: number; data: FirewallListInput }) =>
			typeof id === "number" ? updateFirewallList(id, data) : createFirewallList(data),
		onSuccess: invalidate,
	});
}

export function useDeleteFirewallList() {
	const invalidate = useInvalidateFirewall();
	return useMutation({ mutationFn: deleteFirewallList, onSuccess: invalidate });
}

export function useRefreshFirewallList() {
	const invalidate = useInvalidateFirewall();
	return useMutation({ mutationFn: refreshFirewallList, onSettled: invalidate });
}

export function usePreviewFirewallList() {
	return useMutation({ mutationFn: previewFirewallList });
}
