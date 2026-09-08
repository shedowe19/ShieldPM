import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createUser, getUser, type User, updateUser } from "src/api/backend";
import { AUDIT_LOG_OBJECT_TYPE, AVATAR_TYPE } from "src/types/enums";
import { optimisticQueryUpdate } from "./optimisticQueryUpdate";

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
			avatarType: AVATAR_TYPE.GRAVATAR,
			avatarValue: "",
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
			return optimisticQueryUpdate<User>(queryClient, [AUDIT_LOG_OBJECT_TYPE.USER, values.id], (old) => ({
				...old,
				...values,
				id: old.id,
			}));
		},
		onError: (_, __, rollback: (() => void) | undefined) => rollback?.(),
		onSettled: (data, _error, values) => {
			const id = data?.id ?? values.id;
			queryClient.invalidateQueries({ queryKey: [AUDIT_LOG_OBJECT_TYPE.USER, id] });
			queryClient.invalidateQueries({ queryKey: [AUDIT_LOG_OBJECT_TYPE.USER, "me"] });
			queryClient.invalidateQueries({ queryKey: ["users"] });
			queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
		},
	});
};

export { useSetUser, useUser };
