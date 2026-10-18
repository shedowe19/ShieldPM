import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	deleteWasiApplication,
	getWasiApplications,
	runWasiApplication,
	uploadWasiApplication,
	type WasiApplication,
} from "src/api/backend/wasiApplications";

export function useWasiApplications() {
	const client = useQueryClient();
	const queryKey = ["wasm", "applications"];
	const state = useQuery({
		queryKey,
		queryFn: ({ signal }) => getWasiApplications(signal),
		staleTime: 30_000,
	});
	const upload = useMutation({
		mutationFn: uploadWasiApplication,
		onSuccess: (application) => {
			client.setQueryData<WasiApplication[]>(queryKey, (applications = []) => [
				...applications.filter((existing) => existing.id !== application.id),
				application,
			]);
			void client.invalidateQueries({ queryKey });
		},
		gcTime: 0,
	});
	const remove = useMutation({
		mutationFn: deleteWasiApplication,
		onSuccess: (_, id) => {
			client.setQueryData<WasiApplication[]>(queryKey, (applications = []) =>
				applications.filter((application) => application.id !== id),
			);
			void client.invalidateQueries({ queryKey });
		},
	});
	const run = useMutation({ mutationFn: runWasiApplication, gcTime: 0 });
	return { state, upload, remove, run };
}
