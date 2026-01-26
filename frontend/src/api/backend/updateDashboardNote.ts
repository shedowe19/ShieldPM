import { apiClient } from "./base";
import type { DashboardNote } from "./models";

export const updateDashboardNote = async (id: number, data: Partial<DashboardNote>): Promise<DashboardNote> => {
	return apiClient.put({
		url: `/dashboard/notes/${id}`,
		data,
	});
};
