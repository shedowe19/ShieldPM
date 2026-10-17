import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getBrowserSessions, revokeBrowserSession, revokeOtherBrowserSessions } from "src/api/backend/sessions";

export const useBrowserSessions = () =>
	useQuery({
		queryKey: ["browser-sessions"],
		queryFn: ({ signal }) => getBrowserSessions(signal),
		staleTime: 0,
		refetchOnMount: "always",
	});

export const useRevokeBrowserSession = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (familyId: string | null): Promise<{ revoked: boolean | number }> =>
			familyId ? revokeBrowserSession(familyId) : revokeOtherBrowserSessions(),
		onSuccess: async () => {
			await Promise.all(
				["browser-sessions", "audit-logs"].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
			);
		},
	});
};
