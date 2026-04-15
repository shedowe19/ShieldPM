import { useQuery } from "@tanstack/react-query";
import api from "src/api/backend";

export function useNginxVersion() {
	return useQuery<{ version: string }, Error>({
		queryKey: ["nginx-version"],
		queryFn: () => api.get("/api/nginx/version"),
	});
}
