import { apiClient } from "./base";
import type { DashboardNote } from "./models";

export const getDashboardNotes = async (): Promise<DashboardNote[]> => {
	return apiClient.get({
		url: "/dashboard/notes",
	});
};
