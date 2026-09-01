import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import _ from "lodash";
import errs from "../lib/error.js";
import utils from "../lib/utils.js";
import authModel from "../models/auth.js";
import InitialSetupClaim from "../models/initial-setup-claim.js";
import userModel from "../models/user.js";
import userPermissionModel from "../models/user_permission.js";
import internalAuditLog from "./audit-log.js";
import { retireGeneratedToken, SETUP_CLAIM_ID } from "./initial-setup.js";
import internalToken from "./token.js";

const omissions = () => {
	return ["is_deleted", "permissions.id", "permissions.user_id", "permissions.created_on", "permissions.modified_on"];
};

const getGravatarUrl = (email) => {
	const hash = crypto.createHash("md5").update(email.trim().toLowerCase()).digest("hex");
	return `https://www.gravatar.com/avatar/${hash}?d=mm`;
};

const DEFAULT_AVATAR = getGravatarUrl("admin@example.com");

const AVATAR_SIGNATURES = [
	{
		mimeType: "image/png",
		extension: ".png",
		matches: (buffer) =>
			buffer.length >= 8 &&
			buffer[0] === 0x89 &&
			buffer[1] === 0x50 &&
			buffer[2] === 0x4e &&
			buffer[3] === 0x47 &&
			buffer[4] === 0x0d &&
			buffer[5] === 0x0a &&
			buffer[6] === 0x1a &&
			buffer[7] === 0x0a,
	},
	{
		mimeType: "image/jpeg",
		extension: ".jpg",
		matches: (buffer) => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
	},
	{
		mimeType: "image/gif",
		extension: ".gif",
		matches: (buffer) =>
			buffer.length >= 6 &&
			(buffer.subarray(0, 6).toString("ascii") === "GIF87a" ||
				buffer.subarray(0, 6).toString("ascii") === "GIF89a"),
	},
	{
		mimeType: "image/webp",
		extension: ".webp",
		matches: (buffer) =>
			buffer.length >= 12 &&
			buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
			buffer.subarray(8, 12).toString("ascii") === "WEBP",
	},
];

const detectAvatarFileType = (buffer) => {
	if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
		return null;
	}

	return AVATAR_SIGNATURES.find((signature) => signature.matches(buffer)) || null;
};

const internalUser = {
	/**
	 * Atomically consumes the one-time ownership token and creates the only
	 * unauthenticated user permitted by ShieldPM: the initial administrator.
	 *
	 * @param {import("../lib/types.js").Access} access
	 * @param {Object} data
	 * @param {string} ownershipToken
	 * @param {Object} [meta]
	 * @returns {Promise<Object>}
	 */
	createInitialAdmin: async (access, data, ownershipToken, meta = {}) => {
		if (!ownershipToken || typeof ownershipToken !== "string") {
			throw new errs.AuthError("A valid initial admin setup token is required");
		}
		const auth = data.auth;
		if (auth?.type !== "password" || typeof auth.secret !== "string") {
			throw new errs.ValidationError("Initial administrator password authentication is required");
		}

		const email = data.email.toLowerCase().trim();
		const tokenHash = InitialSetupClaim.hashToken(ownershipToken);
		let user;

		await userModel.transaction(async (trx) => {
			const existingUser = await userModel.query(trx).select("id").where("is_deleted", 0).first();
			if (existingUser) {
				throw new errs.PermissionError("Initial setup is already complete");
			}

			const claimedRows = await InitialSetupClaim.query(trx)
				.patch({
					consumed_at: new Date().toISOString(),
					claimed_ip: meta.ip || null,
				})
				.where("id", SETUP_CLAIM_ID)
				.where("token_hash", tokenHash)
				.whereNull("consumed_at");

			if (claimedRows !== 1) {
				throw new errs.AuthError("Initial admin setup token is invalid or has already been consumed");
			}

			user = await userModel.query(trx).insertAndFetch({
				name: data.name,
				nickname: data.nickname,
				email,
				avatar: getGravatarUrl(email),
				roles: ["admin"],
				is_disabled: 0,
				is_deleted: 0,
			});

			await authModel.query(trx).insert({
				user_id: user.id,
				type: "password",
				secret: auth.secret,
				meta: {},
			});

			await userPermissionModel.query(trx).insert(
				/** @type {any} */ ({
					user_id: user.id,
					visibility: "all",
					access_lists: "manage",
					certificates: "manage",
					proxy_hosts: "manage",
					redirection_hosts: "manage",
					streams: "manage",
					dead_hosts: "manage",
					cloudflared_tunnels: "manage",
					analytics: "view",
				}),
			);

			await InitialSetupClaim.query(trx).patch({ claimed_user_id: user.id }).where("id", SETUP_CLAIM_ID);
		});

		await retireGeneratedToken();
		user = await internalUser.get(access, { id: user.id, expand: ["permissions"] });
		user = _.omit(user, omissions());
		await internalAuditLog.add(access, {
			action: "created",
			object_type: "user",
			object_id: user.id,
			meta: { id: user.id, name: user.name, initial_setup: true },
		});
		return user;
	},

	/**
	 * Create a user can happen unauthenticated only once and only when no active users exist.
	 * Otherwise, a valid auth method is required.
	 *
	 * @param   {import("../lib/types.js").Access}  access
	 * @param   {Object}  data
	 * @returns {Promise}
	 */
	create: async (access, data) => {
		const auth = data.auth || null;
		delete data.auth;

		data.avatar = data.avatar || "";
		data.roles = data.roles || [];

		data.email = data.email.toLowerCase().trim();
		const available = await internalUser.isEmailAvailable(data.email);
		if (!available) {
			throw new errs.ValidationError(`Email address already in use - ${data.email}`);
		}

		if (typeof data.is_disabled !== "undefined") {
			data.is_disabled = data.is_disabled ? 1 : 0;
		}

		await access.can("users:create", data);
		data.avatar = getGravatarUrl(data.email);

		// Use transaction to ensure all user data is created or none at all
		let user;
		await userModel.transaction(async (trx) => {
			user = await userModel.query(trx).insertAndFetch(data);

			if (auth) {
				await authModel.query(trx).insert({
					user_id: user.id,
					type: auth.type,
					secret: auth.secret,
					meta: {},
				});
			}

			// Create permissions row as well
			const _isAdmin = data.roles.indexOf("admin") !== -1;

			await userPermissionModel.query(trx).insert(
				/** @type {any} */ ({
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
				}),
			);
		});

		// Fetch fresh object with Permissions populated
		user = await internalUser.get(access, { id: /** @type {any} */ (user).id, expand: ["permissions"] });
		user = _.omit(user, omissions());

		await internalAuditLog.add(access, {
			action: "created",
			object_type: "user",
			object_id: /** @type {any} */ (user).id,
			meta: user,
		});

		return user;
	},

	/**
	 * @param  {import("../lib/types.js").Access}  access
	 * @param  {any}  data
	 * @return {Promise}
	 */
	update: async (access, data) => {
		if (typeof data.is_disabled !== "undefined") {
			data.is_disabled = data.is_disabled ? 1 : 0;
		}

		await access.can("users:update", data.id);

		// Make sure that the user being updated doesn't change their email to another user that is already using it
		// 1. get user we want to update
		let user = await internalUser.get(access, { id: data.id });

		// 2. if email is to be changed, find other users with that email
		if (typeof data.email !== "undefined") {
			data.email = data.email.toLowerCase().trim();

			if (user.email !== data.email) {
				const available = await internalUser.isEmailAvailable(data.email, data.id);
				if (!available) {
					throw new errs.ValidationError(`Email address already in use - ${data.email}`);
				}
			}
		}

		if (user.id !== data.id) {
			// Sanity check that something crazy hasn't happened
			throw new errs.InternalValidationError(
				`User could not be updated, IDs do not match: ${user.id} !== ${data.id}`,
			);
		}

		// Handle Avatar Logic
		let avatarType = data.avatar_type;
		if (!avatarType) {
			avatarType = user.avatar_type || "gravatar";
		}

		let avatarValue = data.avatar_value;
		if (avatarValue === undefined) {
			avatarValue = user.avatar_value;
		}

		const email = data.email || user.email;

		if (avatarType === "gravatar") {
			data.avatar = getGravatarUrl(email);
		} else if (avatarType === "url") {
			data.avatar = avatarValue || getGravatarUrl(email);
		} else if (avatarType === "upload") {
			// If we are switching to upload, check if we have a value
			if (avatarValue) {
				data.avatar = `/api/users/${user.id}/avatar/image`;
			} else {
				// No upload exists, fallback to gravatar but keep type logic?
				// Or assume the upload endpoint handles the avatar field update.
				// If user just switches type to upload but has no file, we should probably warn or fallback.
				// For now, assume if they select upload, they might upload a file separately.
				// We set the URL anyway if value exists.
				data.avatar = `/api/users/${user.id}/avatar/image`;
			}
		}

		await userModel.query().patchAndFetchById(user.id, data);
		user = await internalUser.get(access, { id: data.id });

		// Add to audit log
		await internalAuditLog.add(access, {
			action: "updated",
			object_type: "user",
			object_id: user.id,
			meta: { ...data, id: user.id, name: user.name },
		});

		return user;
	},

	/**
	 * @param  {import("../lib/types.js").Access}   access
	 * @param  {Object}   [data]
	 * @param  {number}  [data.id]          Defaults to the token user
	 * @param  {Array}    [data.expand]
	 * @param  {Array}    [data.omit]
	 * @return {Promise}
	 */
	get: async (access, data) => {
		const thisData = data || {};

		if (typeof thisData.id === "undefined" || !thisData.id) {
			thisData.id = access.token.getUserId(0);
		}

		await access.can("users:get", thisData.id);

		const query = userModel
			.query()
			.where("is_deleted", 0)
			.andWhere("id", thisData.id)
			.allowGraph("[permissions]")
			.first();

		if (typeof thisData.expand !== "undefined" && thisData.expand !== null) {
			query.withGraphFetched(`[${thisData.expand.join(", ")}]`);
		}

		let row = await query;
		row = /** @type {any} */ (_.omit(row, omissions()));

		if (!row?.id) {
			throw new errs.ItemNotFoundError(thisData.id);
		}
		// Custom omissions
		if (typeof thisData.omit !== "undefined" && thisData.omit !== null) {
			return /** @type {any} */ (_.omit(row, thisData.omit));
		}

		if (row.avatar === "") {
			row.avatar = DEFAULT_AVATAR;
		}

		return row;
	},

	/**
	 * Checks if an email address is available, but if a user_id is supplied, it will ignore checking
	 * against that user.
	 *
	 * @param email
	 * @param user_id
	 */
	isEmailAvailable: async (email, user_id) => {
		const query = userModel.query().where("email", "=", email.toLowerCase().trim()).where("is_deleted", 0).first();

		if (typeof user_id !== "undefined") {
			query.where("id", "!=", user_id);
		}

		const user = await query;
		return !user;
	},

	/**
	 * @param {import("../lib/types.js").Access}  access
	 * @param {Object}  data
	 * @param {number} data.id
	 * @param {String}  [data.reason]
	 * @returns {Promise}
	 */
	delete: async (access, data) => {
		await access.can("users:delete", data.id);
		const user = await internalUser.get(access, { id: data.id });

		if (!user) {
			throw new errs.ItemNotFoundError(data.id);
		}

		// Make sure user can't delete themselves
		if (user.id === access.token.getUserId(0)) {
			throw new errs.PermissionError("You cannot delete yourself.");
		}

		await userModel.query().where("id", user.id).patch({
			is_deleted: 1,
		});

		// Add to audit log
		await internalAuditLog.add(access, {
			action: "deleted",
			object_type: "user",
			object_id: user.id,
			meta: _.omit(user, omissions()),
		});

		return true;
	},

	deleteAll: async () => {
		await userModel.query().patch({
			is_deleted: 1,
		});
	},

	/**
	 * This will only count the users
	 *
	 * @param   {import("../lib/types.js").Access}  access
	 * @param   {String}  [search_query]
	 * @returns {Promise<any>}
	 */
	getCount: async (access, search_query) => {
		await access.can("users:list");
		const query = userModel.query().count("id as count").where("is_deleted", 0).first();

		// Query is used for searching
		if (typeof search_query === "string") {
			query.where(function () {
				this.where("user.name", "like", `%${search_query}%`).orWhere("user.email", "like", `%${search_query}%`);
			});
		}

		const row = await query;
		return Number.parseInt(String(row.count), 10);
	},

	/**
	 * All users
	 *
	 * @param   {import("../lib/types.js").Access}  access
	 * @param   {Array}   [expand]
	 * @param   {String}  [search_query]
	 * @returns {Promise}
	 */
	getAll: async (access, expand, search_query) => {
		await access.can("users:list");
		const query = userModel
			.query()
			.where("is_deleted", 0)
			.groupBy("id")
			.allowGraph("[permissions]")
			.orderBy("name", "ASC");

		// Query is used for searching
		if (typeof search_query === "string") {
			query.where(function () {
				this.where("name", "like", `%${search_query}%`).orWhere("email", "like", `%${search_query}%`);
			});
		}

		if (typeof expand !== "undefined" && expand !== null) {
			query.withGraphFetched(`[${expand.join(", ")}]`);
		}

		const res = await query;
		return utils.omitRows(omissions())(res);
	},

	/**
	 * @param   {import("../lib/types.js").Access} access
	 * @param   {number} [idRequested]
	 * @returns {string[]}
	 */
	getUserOmisionsByAccess: (access, idRequested) => {
		let response = []; // Admin response

		if (!access.token.hasScope("admin") && access.token.getUserId(0) !== idRequested) {
			response = ["is_deleted"]; // Restricted response
		}

		return response;
	},

	/**
	 * @param  {import("../lib/types.js").Access}  access
	 * @param  {Object}  data
	 * @param  {number} data.id
	 * @param  {String}  data.type
	 * @param  {String}  data.secret
	 * @param  {String}  [data.current]
	 * @return {Promise}
	 */
	setPassword: async (access, data) => {
		await access.can("users:password", data.id);
		const user = await internalUser.get(access, { id: data.id });
		const currentSession = await internalToken.requireRecentAuthentication(access, Number.POSITIVE_INFINITY);
		if (user.id !== access.token.getUserId(0)) {
			if (data.current) {
				await internalToken.verifyUserPassword(access.token.getUserId(0), data.current);
			} else {
				await internalToken.requireRecentAuthentication(access);
			}
		}

		if (user.id !== data.id) {
			// Sanity check that something crazy hasn't happened
			throw new errs.InternalValidationError(
				`User could not be updated, IDs do not match: ${user.id} !== ${data.id}`,
			);
		}

		if (user.id === access.token.getUserId(0)) {
			// they're setting their own password. Make sure their current password is correct
			if (typeof data.current === "undefined" || !data.current) {
				throw new errs.ValidationError("Current password was not supplied");
			}

			await internalToken.verifyUserPassword(user.id, data.current);
		}

		await userModel.transaction(async (trx) => {
			const existingAuth = await authModel
				.query(trx)
				.where("user_id", user.id)
				.andWhere("type", data.type)
				.first();

			if (existingAuth) {
				await authModel.query(trx).where("id", existingAuth.id).patch({
					type: data.type,
					secret: data.secret,
				});
			} else {
				await authModel.query(trx).insert({
					user_id: user.id,
					type: data.type,
					secret: data.secret,
					meta: {},
				});
			}

			await internalToken.revokeUserSessions(
				user.id,
				"password_changed",
				user.id === access.token.getUserId(0) ? currentSession.id : null,
				trx,
			);
		});

		// Add to Audit Log
		await internalAuditLog.add(access, {
			action: "updated",
			object_type: "user",
			object_id: user.id,
			meta: {
				name: user.name,
				password_changed: true,
				auth_type: data.type,
			},
		});

		return true;
	},

	/**
	 * @param  {import("../lib/types.js").Access}  access
	 * @param  {Object}  data
	 * @return {Promise}
	 */
	setPermissions: async (access, data) => {
		await access.can("users:permissions", data.id);
		const user = await internalUser.get(access, { id: data.id });

		if (user.id !== data.id) {
			// Sanity check that something crazy hasn't happened
			throw new errs.InternalValidationError(
				`User could not be updated, IDs do not match: ${user.id} !== ${data.id}`,
			);
		}

		// Get perms row, patch if it exists
		const existing_auth = await userPermissionModel.query().where("user_id", user.id).first();

		let permissions;
		if (existing_auth) {
			// patch
			permissions = await userPermissionModel
				.query()
				.where("user_id", user.id)
				.patchAndFetchById(/** @type {any} */ (existing_auth).id, _.assign({ user_id: user.id }, data));
		} else {
			// insert
			permissions = await userPermissionModel.query().insertAndFetch(_.assign({ user_id: user.id }, data));
		}

		// Add to Audit Log
		await internalAuditLog.add(access, {
			action: "updated",
			object_type: "user",
			object_id: user.id,
			meta: {
				name: user.name,
				permissions: permissions,
			},
		});

		return true;
	},

	/**
	 * @param {import("../lib/types.js").Access}   access
	 * @param {Object}   data
	 * @param {number}  data.id
	 */
	loginAs: async (access, data) => {
		await access.can("users:loginas", data.id);
		const user = await internalUser.get(access, data);
		if (Number(user.id) === Number(access.token.getUserId(0))) {
			throw new errs.ValidationError("You cannot impersonate your current account");
		}
		return user;
	},

	/**
	 * @param {import("../lib/types.js").Access} access
	 * @param {Object} data
	 * @param {number} data.id
	 * @param {Object} data.file
	 */
	uploadAvatar: async (access, data) => {
		await access.can("users:update", data.id);
		const user = await internalUser.get(access, { id: data.id });

		if (!data.file) {
			throw new errs.ValidationError("No file uploaded");
		}

		const file = data.file;
		if (file.size > 2 * 1024 * 1024) {
			throw new errs.ValidationError("File too large. Maximum size is 2MB.");
		}

		if (!file.data || !Buffer.isBuffer(file.data)) {
			throw new errs.ValidationError("Uploaded avatar data is invalid.");
		}

		const detectedType = detectAvatarFileType(file.data);
		if (!detectedType) {
			throw new errs.ValidationError("Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.");
		}

		const dataPath = process.env.DATA_PATH || "/data";
		const avatarDir = path.join(dataPath, "avatars");

		if (!fs.existsSync(avatarDir)) {
			fs.mkdirSync(avatarDir, { recursive: true });
		}

		// Delete old avatar if it exists and was an upload
		if (user.avatar_type === "upload" && user.avatar_value) {
			const oldPath = path.join(avatarDir, user.avatar_value);
			if (fs.existsSync(oldPath)) {
				fs.unlinkSync(oldPath);
			}
		}

		const filename = `${user.id}-${Date.now()}${detectedType.extension}`;
		const filePath = path.join(avatarDir, filename);

		await fs.promises.writeFile(filePath, file.data);

		await userModel.query().patchAndFetchById(user.id, {
			avatar_type: "upload",
			avatar_value: filename,
			avatar: `/api/users/${user.id}/avatar/image`,
		});

		return {
			url: `/api/users/${user.id}/avatar/image`,
			mime_type: detectedType.mimeType,
		};
	},

	/**
	 * @param {import("../lib/types.js").Access} _access
	 * @param {Object} data
	 * @param {number} data.id
	 */
	getAvatarImage: async (_access, data) => {
		// Public access allowed for avatars, but we check existence
		const user = await userModel.query().findById(data.id);
		if (user?.avatar_type !== "upload" || !user?.avatar_value) {
			throw new errs.ItemNotFoundError("Avatar not found");
		}

		const dataPath = process.env.DATA_PATH || "/data";
		const filePath = path.join(dataPath, "avatars", user.avatar_value);

		// SECURITY: Path traversal check — ensure resolved path stays within avatars dir
		const resolvedPath = path.resolve(filePath);
		const avatarDir = path.resolve(path.join(dataPath, "avatars"));
		if (!resolvedPath.startsWith(avatarDir)) {
			throw new Error("Invalid avatar path");
		}

		if (!fs.existsSync(filePath)) {
			throw new errs.ItemNotFoundError("Avatar file missing");
		}

		const fileBuffer = await fs.promises.readFile(filePath);
		const detectedType = detectAvatarFileType(fileBuffer);
		if (!detectedType) {
			throw new errs.ValidationError("Avatar file has an invalid image signature.");
		}

		return {
			filePath,
			mimeType: detectedType.mimeType,
		};
	},
};

export default internalUser;
