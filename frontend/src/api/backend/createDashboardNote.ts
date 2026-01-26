import { apiClient } from "./base";
import type { DashboardNote } from "./models";

export const createDashboardNote = async (data: Partial<DashboardNote>): Promise<DashboardNote> => {
	return apiClient.post({
		url: "/dashboard/notes",
		data,
	});
};
