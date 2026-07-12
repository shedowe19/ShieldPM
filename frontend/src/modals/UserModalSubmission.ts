import type { User } from "src/api/backend";
import { USER_ROLE } from "src/types/enums";
import type { UserDetailsFormValues } from "./UserDetailsTab";

export type UserPayload = Pick<User, "email" | "name" | "nickname"> & {
	id?: number | "me";
	is_disabled?: boolean;
	roles?: string[];
};

type CreateUserPayloadParams = {
	id: number | "me" | "new";
	isCurrentUser: boolean;
	values: UserDetailsFormValues;
};

export const createUserPayload = ({ id, isCurrentUser, values }: CreateUserPayloadParams): UserPayload => {
	const payload = {
		email: values.email,
		id: id === "new" ? undefined : id,
		name: values.name,
		nickname: values.nickname,
	};

	if (isCurrentUser) {
		return payload;
	}

	return {
		...payload,
		is_disabled: values.isDisabled,
		roles: values.isAdmin ? [USER_ROLE.ADMIN] : [],
	};
};
