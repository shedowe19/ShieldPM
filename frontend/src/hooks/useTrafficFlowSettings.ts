import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getTrafficFlowSetting, saveTrafficFlowSetting } from "src/api/backend/trafficFlowSettings";

const key = ["setting", "traffic-flow"];
export function useTrafficFlowSettings() {
	const client = useQueryClient();
	const query = useQuery({ queryKey: key, queryFn: getTrafficFlowSetting, retry: false });
	const save = useMutation({
		mutationFn: saveTrafficFlowSetting,
		onSuccess: async (saved) => {
			client.setQueryData(key, saved);
			await Promise.all([
				client.invalidateQueries({ queryKey: key }),
				client.invalidateQueries({ queryKey: ["traffic-flow"] }),
				client.invalidateQueries({ queryKey: ["audit-logs"] }),
			]);
		},
	});
	return { query, save };
}
