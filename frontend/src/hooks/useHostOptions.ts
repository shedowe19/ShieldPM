import { useQuery } from "@tanstack/react-query";
import { getHostOptions } from "src/api/backend/hostWorkspace";
export const useHostOptions = () =>
	useQuery({
		queryKey: ["proxy-hosts", "options"],
		queryFn: ({ signal }) => getHostOptions(signal),
		staleTime: 60_000,
	});
