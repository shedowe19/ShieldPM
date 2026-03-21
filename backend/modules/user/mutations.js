import _ from "lodash";
import errs from "../../lib/error.js";
import authModel from "../../models/auth.js";
import userModel from "../../models/user.js";
import userPermissionModel from "../../models/user_permission.js";
import { auditLogService } from "../../modules/audit-log/index.js";
import { tokenService } from "../../modules/token/index.js";
import { getGravatarUrl, omissions } from "./constants.js";
import { get, isEmailAvailable } from "./reads.js";

const create = async (access, data) => {
	const auth = data.auth || null;
	delete data.auth;
	data.avatar = data.avatar || "";
	data.roles = data.roles || [];
	data.email = data.email.toLowerCase().trim();
	const available = await isEmailAvailable(data.email);
	if (!available) throw new errs.ValidationError(`Email address already in use - ${data.email}`);
	if (typeof data.is_disabled !== "undefined") data.is_disabled = data.is_disabled ? 1 : 0;
	await access.can("users:create", data);
	data.avatar = getGravatarUrl(data.email);
	let user;
	await userModel.transaction(async (trx) => {
		user = await userModel.query(trx).insertAndFetch(data);
		if (auth) {
			await authModel.query(trx).insert({ user_id: user.id, type: auth.type, secret: auth.secret, meta: {} });
		}
		await userPermissionModel.query(trx).insert({
			user_id: user.id,
			visibility: "user",
			access_lists: "manage",
			certificates: "manage",
			proxy_hosts: "manage",
			redirection_hosts: "manage",
			streams: "manage",
			dead_hosts: "manage",
			cloudflared_tunnels: "manage",
			analytics: "view",
		});
	});
	user = await get(access, { id: user.id, expand: ["permissions"] });
	user = _.omit(user, omissions());
	await auditLogService.add(access, { action: "created", object_type: "user", object_id: user.id, meta: user });
	return user;
};

const update = async (access, data) => {
	if (typeof data.is_disabled !== "undefined") data.is_disabled = data.is_disabled ? 1 : 0;
	await access.can("users:update", data.id);
	let user = await get(access, { id: data.id });
	if (typeof data.email !== "undefined") {
		data.email = data.email.toLowerCase().trim();
		if (user.email !== data.email) {
			const available = await isEmailAvailable(data.email, data.id);
			if (!available) throw new errs.ValidationError(`Email address already in use - ${data.email}`);
		}
	}
	if (user.id !== data.id)
		throw new errs.InternalValidationError(
			`User could not be updated, IDs do not match: ${user.id} !== ${data.id}`,
		);
	const avatarType = data.avatar_type || user.avatar_type || "gravatar";
	const avatarValue = data.avatar_value === undefined ? user.avatar_value : data.avatar_value;
	const email = data.email || user.email;
	if (avatarType === "gravatar") data.avatar = getGravatarUrl(email);
	else if (avatarType === "url") data.avatar = avatarValue || getGravatarUrl(email);
	else if (avatarType === "upload") data.avatar = `/api/users/${user.id}/avatar/image`;
	await userModel.query().patchAndFetchById(user.id, data);
	user = await get(access, { id: data.id });
	await auditLogService.add(access, {
		action: "updated",
		object_type: "user",
		object_id: user.id,
		meta: { ...data, id: user.id, name: user.name },
	});
	return user;
};

const remove = async (access, data) => {
	await access.can("users:delete", data.id);
	const user = await get(access, { id: data.id });
	if (!user) throw new errs.ItemNotFoundError(data.id);
	if (user.id === access.token.getUserId(0)) throw new errs.PermissionError("You cannot delete yourself.");
	await userModel.query().where("id", user.id).patch({ is_deleted: 1 });
	await auditLogService.add(access, {
		action: "deleted",
		object_type: "user",
		object_id: user.id,
		meta: _.omit(user, omissions()),
	});
	return true;
};

const deleteAll = async () => {
	await userModel.query().patch({ is_deleted: 1 });
};

const setPassword = async (access, data) => {
	await access.can("users:password", data.id);
	const user = await get(access, { id: data.id });
	if (user.id !== data.id)
		throw new errs.InternalValidationError(
			`User could not be updated, IDs do not match: ${user.id} !== ${data.id}`,
		);
	if (user.id === access.token.getUserId(0)) {
		if (typeof data.current === "undefined" || !data.current)
			throw new errs.ValidationError("Current password was not supplied");
		await tokenService.getTokenFromEmail({ identity: user.email, secret: data.current });
	}
	const existing_auth = await authModel.query().where("user_id", user.id).andWhere("type", data.type).first();
	if (existing_auth) {
		await authModel
			.query()
			.where("user_id", user.id)
			.andWhere("type", data.type)
			.patch({ type: data.type, secret: data.secret });
	} else {
		await authModel.query().insert({ user_id: user.id, type: data.type, secret: data.secret, meta: {} });
	}
	await auditLogService.add(access, {
		action: "updated",
		object_type: "user",
		object_id: user.id,
		meta: { name: user.name, password_changed: true, auth_type: data.type },
	});
	return true;
};

const setPermissions = async (access, data) => {
	await access.can("users:permissions", data.id);
	const user = await get(access, { id: data.id });
	if (user.id !== data.id)
		throw new errs.InternalValidationError(
			`User could not be updated, IDs do not match: ${user.id} !== ${data.id}`,
		);
	const existing_auth = await userPermissionModel.query().where("user_id", user.id).first();
	let permissions;
	if (existing_auth) {
		permissions = await userPermissionModel
			.query()
			.where("user_id", user.id)
			.patchAndFetchById(existing_auth.id, _.assign({ user_id: user.id }, data));
	} else {
		permissions = await userPermissionModel.query().insertAndFetch(_.assign({ user_id: user.id }, data));
	}
	await auditLogService.add(access, {
		action: "updated",
		object_type: "user",
		object_id: user.id,
		meta: { name: user.name, permissions },
	});
	return true;
};

const loginAs = async (access, data) => {
	await access.can("users:loginas", data.id);
	const user = await get(access, data);
	return tokenService.getTokenFromUser(user);
};

export { create, deleteAll, loginAs, remove, setPassword, setPermissions, update };
