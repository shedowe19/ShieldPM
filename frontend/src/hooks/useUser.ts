import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createUser, getUser, type User, updateUser } from "src/api/backend";
import { AUDIT_LOG_OBJECT_TYPE } from "src/types/enums";

const fetchUser = (id: number | string) => {
	if (id === "new") {
		return Promise.resolve({
			id: 0,
			createdOn: "",
			modifiedOn: "",
			isDisabled: false,
			email: "",
			name: "",
			nickname: "",
			roles: [],
			avatar: "",
		} as User);
	}
	return getUser(id, ["permissions"]);
};

const useUser = (id: string | number, options = {}) => {
	return useQuery<User, Error>({
		queryKey: [AUDIT_LOG_OBJECT_TYPE.USER, id],
		queryFn: () => fetchUser(id),
		staleTime: 60 * 1000, // 1 minute
		...options,
	});
};

const useSetUser = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (values: User) => (values.id ? updateUser(values) : createUser(values)),
		onMutate: (values: User) => {
			if (!values.id) {
				return () => {};
			}
			const previousObject = queryClient.getQueryData([AUDIT_LOG_OBJECT_TYPE.USER, values.id]);
			queryClient.setQueryData([AUDIT_LOG_OBJECT_TYPE.USER, values.id], (old: User) => ({
				...old,
				...values,
			}));
			return () => queryClient.setQueryData([AUDIT_LOG_OBJECT_TYPE.USER, values.id], previousObject);
		},
		onError: (_, __, rollback: (() => void) | undefined) => rollback?.(),
		onSuccess: async ({ id }: User) => {
			queryClient.invalidateQueries({ queryKey: [AUDIT_LOG_OBJECT_TYPE.USER, id] });
			queryClient.invalidateQueries({ queryKey: ["users"] });
			queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
		},
	});
};

export { useUser, useSetUser };
