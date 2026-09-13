import type { User } from "src/api/backend";
import { AVATAR_TYPE, type AvatarType, USER_ROLE } from "src/types/enums";
import type { UserDetailsFormValues } from "./UserDetailsTab";

export type UserPayload = Pick<User, "email" | "name" | "nickname"> & {
	id?: number | "me";
	is_disabled?: boolean;
	roles?: string[];
	avatar_type?: AvatarType;
	avatar_value?: string;
};

type CreateUserPayloadParams = {
	id: number | "me" | "new";
	isCurrentUser: boolean;
	values: UserDetailsFormValues;
};

export const createUserPayload = ({ id, isCurrentUser, values }: CreateUserPayloadParams): UserPayload => {
	const payload: UserPayload = {
		email: values.email,
		id: id === "new" ? undefined : id,
		name: values.name,
		nickname: values.nickname,
	};
	// Uploaded filenames belong to the upload endpoint, never to a previously entered URL.
	if (values.avatar_type !== AVATAR_TYPE.UPLOAD) {
		payload.avatar_type = values.avatar_type;
		payload.avatar_value = values.avatar_type === AVATAR_TYPE.URL ? values.avatar_value : "";
	}

	if (isCurrentUser) {
		return payload;
	}

	return {
		...payload,
		is_disabled: values.isDisabled,
		roles: values.isAdmin ? [USER_ROLE.ADMIN] : [],
	};
};
