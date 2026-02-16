import internalUser from "../../user.js";

export const get_users = async (access, args) => {
	const users = await internalUser.getAll(access);
	return JSON.stringify(
		users.map((u) => ({
			id: u.id,
			name: u.name,
			email: u.email,
			roles: u.roles,
			is_disabled: u.is_disabled,
		})),
	);
};

export const create_user = async (access, args) => {
	// Prepare data for internalUser.create
	const userData = {
		name: args.name,
		email: args.email,
		nickname: args.nickname || args.name,
		roles: args.roles || ["user"],
		is_disabled: false,
		auth: {
			type: "local",
			secret: args.password || "changeme123", // Fallback if not provided, though generic prompt should ask
		},
	};
	const newUser = await internalUser.create(access, userData);
	return `Created User ID: ${newUser.id} (Email: ${newUser.email})`;
};

export const update_user = async (access, args) => {
	await internalUser.update(access, { id: args.id, ...args });
	return `Updated User ID: ${args.id}`;
};

export const delete_user = async (access, args) => {
	await internalUser.delete(access, { id: args.id });
	return `Deleted User ID: ${args.id}`;
};

export const update_user_password = async (access, args) => {
	await internalUser.setPassword(access, { id: args.id, ...args });
	return `Updated Password for User ID: ${args.id}`;
};

export const update_user_permissions = async (access, args) => {
	await internalUser.setPermissions(access, { id: args.id, ...args });
	return `Updated Permissions for User ID: ${args.id}`;
};

export const login_as_user = async (access, args) => {
	const loginResult = await internalUser.loginAs(access, { id: args.id });
	return `Logged in as User ${args.id}. Token: ${loginResult.token}`;
};
