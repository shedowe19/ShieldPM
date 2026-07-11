import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createStream, getStream, type Stream, updateStream } from "src/api/backend";
import { AUDIT_LOG_OBJECT_TYPE } from "src/types/enums";

const fetchStream = (id: number | "new") => {
	if (id === "new") {
		return Promise.resolve({
			id: 0,
			createdOn: "",
			modifiedOn: "",
			ownerUserId: 0,
			tcpForwarding: true,
			udpForwarding: false,
			meta: {},
			enabled: true,
			certificateId: 0,
		} as Stream);
	}
	return getStream(id, ["owner"]);
};

const useStream = (id: number | "new", options = {}) => {
	return useQuery<Stream, Error>({
		queryKey: [AUDIT_LOG_OBJECT_TYPE.STREAM, id],
		queryFn: () => fetchStream(id),
		staleTime: 60 * 1000, // 1 minute
		...options,
	});
};

const useSetStream = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (values: Stream) => (values.id ? updateStream(values) : createStream(values)),
		onMutate: (values: Stream) => {
			if (!values.id) {
				return () => {};
			}
			const previousObject = queryClient.getQueryData([AUDIT_LOG_OBJECT_TYPE.STREAM, values.id]);
			queryClient.setQueryData([AUDIT_LOG_OBJECT_TYPE.STREAM, values.id], (old: Stream) => ({
				...old,
				...values,
			}));
			return () => queryClient.setQueryData([AUDIT_LOG_OBJECT_TYPE.STREAM, values.id], previousObject);
		},
		onError: (_, __, rollback: (() => void) | undefined) => rollback?.(),
		onSuccess: async ({ id }: Stream) => {
			queryClient.invalidateQueries({ queryKey: [AUDIT_LOG_OBJECT_TYPE.STREAM, id] });
			queryClient.invalidateQueries({ queryKey: ["streams"] });
			queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
			queryClient.invalidateQueries({ queryKey: ["host-report"] });
			queryClient.invalidateQueries({ queryKey: ["certificates"] });
		},
	});
};

export { useSetStream, useStream };
