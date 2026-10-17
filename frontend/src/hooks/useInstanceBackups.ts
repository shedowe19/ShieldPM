import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	cancelInstanceRestore,
	createInstanceBackup,
	deleteInstanceBackup,
	downloadInstanceBackup,
	getInstanceBackups,
	preflightInstanceBackup,
	restoreInstanceBackup,
	uploadInstanceBackup,
} from "src/api/backend/instanceBackups";

export function useInstanceBackups() {
	const client = useQueryClient();
	const queryKey = ["instance-backups"];
	const refresh = () => client.invalidateQueries({ queryKey });
	const state = useQuery({
		queryKey,
		queryFn: ({ signal }) => getInstanceBackups(signal),
		staleTime: 0,
		refetchInterval: (query) => (query.state.data?.jobs.some((job) => job.status === "running") ? 1500 : false),
	});
	const create = useMutation({ mutationFn: createInstanceBackup, onSuccess: refresh, gcTime: 0 });
	const preflight = useMutation({ mutationFn: preflightInstanceBackup, onSuccess: refresh, gcTime: 0 });
	const restore = useMutation({ mutationFn: restoreInstanceBackup, onSuccess: refresh, gcTime: 0 });
	const cancel = useMutation({ mutationFn: cancelInstanceRestore, onSuccess: refresh });
	const upload = useMutation({ mutationFn: uploadInstanceBackup, onSuccess: refresh });
	const download = useMutation({ mutationFn: downloadInstanceBackup });
	const remove = useMutation({ mutationFn: deleteInstanceBackup, onSuccess: refresh });
	return { state, create, preflight, restore, cancel, upload, download, remove };
}
