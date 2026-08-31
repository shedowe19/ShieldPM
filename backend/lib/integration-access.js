import fs from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv/dist/2020.js";
import ChatIntegration from "../models/chat_integration.js";
import ProxyHost from "../models/proxy_host.js";
import permissionsSchema from "./access/permissions.json" with { type: "json" };
import rolesSchema from "./access/roles.json" with { type: "json" };
import errs from "./error.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const permissionSchemaCache = new Map();

const loadPermissionSchema = async (permission) => {
	if (!/^[a-z_]+:(?:create|delete|get|hosts|list|update)$/.test(permission)) {
		throw new errs.PermissionError("Invalid integration permission");
	}
	if (!permissionSchemaCache.has(permission)) {
		const filePath = `${__dirname}/access/${permission.replace(/:/g, "-")}.json`;
		permissionSchemaCache.set(permission, JSON.parse(await fs.readFile(filePath, "utf8")));
	}
	return permissionSchemaCache.get(permission);
};

/**
 * Build an access principal bound to one enabled integration, its current
 * database owner, and one external Telegram user. No JWT or bearer credential
 * is synthesized.
 *
 * @param {number} integrationId
 * @param {string|number} externalUserId
 * @returns {import("./types.js").Access & {load:()=>Promise<Object>,principal:Object}}
 */
export const createIntegrationAccess = (integrationId, externalUserId) => {
	if (!Number.isInteger(integrationId) || integrationId < 1) throw new TypeError("Invalid integration identifier");
	const externalId = String(externalUserId || "");
	if (!/^[0-9]{1,32}$/.test(externalId)) throw new errs.PermissionError("Invalid integration principal");
	let currentUser;

	const load = async () => {
		const integration = await ChatIntegration.query()
			.findById(integrationId)
			.where("enabled", 1)
			.withGraphFetched("user.permissions");
		const allowedIds = Array.isArray(integration?.config?.allowed_ids) ? integration.config.allowed_ids : [];
		const allowed = allowedIds.some((id) => String(id) === externalId);
		if (
			integration?.provider !== "telegram" ||
			!allowed ||
			!integration.user ||
			integration.user.is_deleted ||
			integration.user.is_disabled ||
			!integration.user.permissions
		) {
			throw new errs.PermissionError("Integration principal is no longer authorized");
		}
		currentUser = integration.user;
		return currentUser;
	};

	const token = Object.freeze({
		hasScope: (scope) => scope === "user",
		get: (key) => {
			if (key === "scope") return ["user"];
			if (key === "attrs") return currentUser ? { id: currentUser.id } : {};
			return null;
		},
		getUserId: (defaultValue = 0) => currentUser?.id || defaultValue,
	});

	const can = async (permission, data) => {
		try {
			const user = await load();
			const objectType = permission.split(":").shift();
			let objectIds;
			if (objectType === "users") objectIds = [user.id];
			if (objectType === "proxy_hosts") {
				const query = ProxyHost.query().select("id").where("is_deleted", 0);
				if (user.permissions.visibility === "user") query.andWhere("owner_user_id", user.id);
				objectIds = (await query).map((row) => row.id);
				if (!objectIds.length) objectIds.push(0);
			}

			const objectProperties = {
				user_id: { type: "number", enum: [user.id] },
				scope: { type: "string", pattern: "^user$" },
				[objectType]: objectIds
					? { type: "number", enum: objectIds, minimum: 1 }
					: { type: "number", minimum: 1 },
			};
			const objectSchema = {
				$id: "objects",
				type: "object",
				additionalProperties: false,
				properties: objectProperties,
			};
			const permissionSchema = {
				$async: true,
				$id: "integration-permissions",
				type: "object",
				additionalProperties: false,
				properties: { [permission]: await loadPermissionSchema(permission) },
			};
			const payload = {
				[permission]: {
					data,
					scope: ["user"],
					roles: [...new Set([...(user.roles || []), "user"])],
					permission_visibility: user.permissions.visibility,
					permission_proxy_hosts: user.permissions.proxy_hosts,
					permission_redirection_hosts: user.permissions.redirection_hosts,
					permission_dead_hosts: user.permissions.dead_hosts,
					permission_streams: user.permissions.streams,
					permission_access_lists: user.permissions.access_lists,
					permission_certificates: user.permissions.certificates,
					permission_cloudflared_tunnels: user.permissions.cloudflared_tunnels,
					permission_analytics: user.permissions.analytics,
					permission_ddns_providers: user.permissions.ddns_providers,
					permission_tor_onions: user.permissions.tor_onions,
					permission_dashboard_notes: user.permissions.dashboard_notes,
					permission_chat: user.permissions.chat,
				},
			};
			const ajv = new /** @type {any} */ (Ajv)({
				allErrors: true,
				coerceTypes: true,
				strict: false,
				schemas: [rolesSchema, permissionsSchema, objectSchema, permissionSchema],
			});
			const valid = await ajv.validate(permissionSchema.$id, payload);
			if (!valid) throw new errs.PermissionError("Permission Denied");
			return payload[permission];
		} catch (err) {
			if (err instanceof errs.PermissionError) throw err;
			throw new errs.PermissionError("Permission Denied", err);
		}
	};

	return /** @type {any} */ ({
		token,
		load,
		can,
		principal: Object.freeze({ type: "integration", integrationId, externalUserId: externalId }),
		is_ai: true,
	});
};
