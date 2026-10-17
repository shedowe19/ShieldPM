import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getHostRevisionPlan, getHostRevisions, restoreHostRevision } from "src/api/backend/hostRevisions";

export const useHostRevisions = (hostId: number) =>
	useQuery({
		queryKey: ["host-revisions", hostId],
		queryFn: ({ signal }) => getHostRevisions(hostId, signal),
		staleTime: 0,
	});
export const useHostRevisionPlan = (hostId: number, revisionId: number | null) =>
	useQuery({
		queryKey: ["host-revision-plan", hostId, revisionId],
		queryFn: ({ signal }) => getHostRevisionPlan(hostId, revisionId as number, signal),
		enabled: revisionId !== null,
		staleTime: 0,
		refetchOnMount: "always",
	});
export const useRestoreHostRevision = (hostId: number) => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ revisionId, fingerprint }: { revisionId: number; fingerprint: string }) =>
			restoreHostRevision(hostId, revisionId, fingerprint),
		onSuccess: async () => {
			await Promise.all(
				[
					"host-revisions",
					"host-revision-plan",
					"proxy-hosts",
					"proxy-host",
					"proxy-host-monitors",
					"audit-logs",
				].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
			);
		},
	});
};
