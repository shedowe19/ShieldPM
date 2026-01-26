import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createDashboardNote, deleteDashboardNote, getDashboardNotes, updateDashboardNote } from "src/api/backend";
import type { DashboardNote } from "src/api/backend/models";

export function useDashboardNotes() {
	const queryClient = useQueryClient();

	const { data, isLoading, error } = useQuery({
		queryKey: ["dashboard-notes"],
		queryFn: getDashboardNotes,
	});

	const createMutation = useMutation({
		mutationFn: createDashboardNote,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["dashboard-notes"] });
		},
	});

	const updateMutation = useMutation({
		mutationFn: ({ id, data }: { id: number; data: Partial<DashboardNote> }) => updateDashboardNote(id, data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["dashboard-notes"] });
		},
	});

	const deleteMutation = useMutation({
		mutationFn: deleteDashboardNote,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["dashboard-notes"] });
		},
	});

	return {
		data,
		isLoading,
		error,
		createNote: createMutation.mutate,
		updateNote: updateMutation.mutate,
		deleteNote: deleteMutation.mutate,
	};
}
