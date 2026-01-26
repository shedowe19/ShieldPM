import { apiClient } from "./base";

export const deleteDashboardNote = async (id: number): Promise<boolean> => {
	return apiClient.delete({
		url: `/dashboard/notes/${id}`,
	});
};
