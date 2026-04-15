import { useQuery } from "@tanstack/react-query";
import { getNginxVersion } from "src/api/backend";

export function useNginxVersion() {
	return useQuery<{ version: string }, Error>({
		queryKey: ["nginx-version"],
		queryFn: () => getNginxVersion(),
	});
}
