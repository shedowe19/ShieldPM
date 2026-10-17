/**
 * Some Notes: This is a friggin complicated piece of code.
 *
 * "scope" in this file means "where did this token come from and what is using it", so 99% of the time
 * the "scope" is going to be "user" because it would be a user token. This is not to be confused with
 * the "role" which could be "user" or "admin". The scope in fact, could be "worker" or anything else.
 */

import fs from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv/dist/2020.js";
import _ from "lodash";
import { access as logger } from "../logger.js";
import TokenModel from "../models/token.js";
import userModel from "../models/user.js";
import permsSchema from "./access/permissions.json" with { type: "json" };
import roleSchema from "./access/roles.json" with { type: "json" };
import errs from "./error.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// User identity is validation data, never embedded in cached schemas.
const permissionAjv = new /** @type {any} */ (Ajv)({
	verbose: true,
	allErrors: true,
	coerceTypes: true,
	$data: true,
	schemas: [
		roleSchema,
		permsSchema,
		{
			$id: "objects",
			type: "object",
			properties: { users: { type: "number", minimum: 1, const: { $data: "/actor_user_id" } } },
		},
	],
});
const permissionValidators = new Map();

const getPermissionValidator = (permission) => {
	if (!permissionValidators.has(permission)) {
		const pending = fs.readFile(`${__dirname}/access/${permission.replaceAll(":", "-")}.json`, "utf8").then((raw) =>
			permissionAjv.compile({
				$async: true,
				type: "object",
				additionalProperties: false,
				properties: { actor_user_id: { type: "number" }, [permission]: JSON.parse(raw) },
			}),
		);
		permissionValidators.set(permission, pending);
		pending.catch(() => permissionValidators.delete(permission));
	}
	return permissionValidators.get(permission);
};

export default function (tokenString) {
	const Token = TokenModel();
	let tokenData = null;
	let initialised = false;
	let allowInternalAccess = false;
	let userRoles = [];
	let permissions = {};

	/**
	 * Loads the Token object from the token string
	 *
	 * @returns {Promise}
	 */
	this.init = async () => {
		if (initialised) {
			return;
		}

		if (!tokenString) {
			throw new errs.PermissionError("Permission Denied");
		}

		tokenData = await Token.load(tokenString);

		// At this point we need to load the user from the DB and make sure they:
		// - exist (and not soft deleted)
		// - still have the appropriate scopes for this token
		// This is only required when the User ID is supplied or if the token scope has `user`
		if (
			tokenData.attrs.id ||
			(typeof tokenData.scope !== "undefined" && _.indexOf(tokenData.scope, "user") !== -1)
		) {
			// Has token user id or token user scope
			const user = await userModel
				.query()
				.where("id", tokenData.attrs.id)
				.andWhere("is_deleted", 0)
				.andWhere("is_disabled", 0)
				.allowGraph("[permissions]")
				.withGraphFetched("[permissions]")
				.first();

			if (user) {
				// make sure user has all scopes of the token
				// The `user` role is not added against the user row, so we have to just add it here to get past this check.
				user.roles.push("user");

				let ok = true;
				_.forEach(tokenData.scope, (scope_item) => {
					if (_.indexOf(user.roles, scope_item) === -1) {
						ok = false;
					}
				});

				if (!ok) {
					throw new errs.AuthError("Invalid token scope for User");
				}
				initialised = true;
				userRoles = user.roles;
				permissions = user.permissions;
			} else {
				throw new errs.AuthError("User cannot be loaded for Token");
			}
		}
		initialised = true;
	};

	// Kept for internal compatibility. Proxy ownership is checked in each
	// resource service; no proxy permission schema consumes an ID enumeration.
	this.loadObjects = async (objectType) =>
		objectType === "users" && Token.hasScope("user") ? [Token.getUserId(0)] : null;

	// here:

	return {
		token: Token,

		/**
		 *
		 * @param   {Boolean}  [allowInternal]
		 * @returns {Promise}
		 */
		load: async (allowInternal) => {
			if (tokenString) {
				// Authentication includes the current account and its scopes, even
				// for routes that only inspect the token's user ID afterwards.
				await this.init();
				return tokenData;
			}
			allowInternalAccess = allowInternal;
			return allowInternal || null;
		},

		reloadObjects: this.loadObjects,

		/**
		 *
		 * @param {String}  permission
		 * @param {*}       [data]
		 * @returns {Promise}
		 */
		can: async (permission, data) => {
			if (allowInternalAccess === true) {
				return true;
			}

			try {
				await this.init();

				const dataSchema = {
					actor_user_id: tokenData.attrs?.id || 0,
					[permission]: {
						data: data,
						scope: Token.get("scope"),
						roles: userRoles,
						permission_visibility: permissions.visibility,
						permission_proxy_hosts: permissions.proxy_hosts,
						permission_redirection_hosts: permissions.redirection_hosts,
						permission_dead_hosts: permissions.dead_hosts,
						permission_streams: permissions.streams,
						permission_access_lists: permissions.access_lists,
						permission_certificates: permissions.certificates,
						permission_cloudflared_tunnels: permissions.cloudflared_tunnels,
						permission_analytics: permissions.analytics,
						permission_ddns_providers: permissions.ddns_providers,
						permission_tor_onions: permissions.tor_onions,
						permission_dashboard_notes: permissions.dashboard_notes,
						permission_chat: permissions.chat,
					},
				};

				const validate = await getPermissionValidator(permission);
				const valid = await validate(dataSchema);
				return valid && dataSchema[permission];
			} catch (err) {
				err.permission = permission;
				err.permission_data = data;
				logger.error(permission, data, err.message);
				throw new errs.PermissionError("Permission Denied", err);
			}
		},
	};
}
