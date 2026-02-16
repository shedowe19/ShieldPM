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
import proxyHostModel from "../models/proxy_host.js";
import TokenModel from "../models/token.js";
import userModel from "../models/user.js";
import permsSchema from "./access/permissions.json" with { type: "json" };
import roleSchema from "./access/roles.json" with { type: "json" };
import errs from "./error.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize Ajv once
const ajv = new /** @type {any} */ (Ajv)({
	verbose: true,
	allErrors: true,
	breakOnError: true,
	coerceTypes: true,
});

// Pre-load common schemas
ajv.addSchema(roleSchema);
ajv.addSchema(permsSchema);

const permissionSchemaCache = {};

export default function (tokenString) {
	const Token = TokenModel();
	let tokenData = null;
	let initialised = false;
	const objectCache = {};
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

	/**
	 * Fetches the object ids from the database, only once per object type, for this token.
	 * This only applies to USER token scopes, as all other tokens are not really bound
	 * by object scopes
	 *
	 * @param   {String} objectType
	 * @returns {Promise}
	 */
	this.loadObjects = async (objectType) => {
		let objects = null;

		if (Token.hasScope("user")) {
			if (typeof tokenData.attrs.id === "undefined" || !tokenData.attrs.id) {
				throw new errs.AuthError("User Token supplied without a User ID");
			}

			const tokenUserId = tokenData.attrs.id ? tokenData.attrs.id : 0;

			if (typeof objectCache[objectType] !== "undefined") {
				objects = objectCache[objectType];
			} else {
				switch (objectType) {
					// USERS - should only return yourself
					case "users":
						objects = tokenUserId ? [tokenUserId] : [];
						break;

					// Proxy Hosts
					case "proxy_hosts": {
						const query = proxyHostModel.query().select("id").andWhere("is_deleted", 0);

						if (permissions.visibility === "user") {
							query.andWhere("owner_user_id", tokenUserId);
						}

						const rows = await query;
						objects = [];
						_.forEach(rows, (ruleRow) => {
							objects.push(ruleRow.id);
						});

						// enum should not have less than 1 item
						if (!objects.length) {
							objects.push(0);
						}
						break;
					}
				}
				objectCache[objectType] = objects;
			}
		}
		return objects;
	};

	/**
	 * Creates a schema object on the fly with the IDs and other values required to be checked against the permissionSchema
	 *
	 * @param   {String} permissionLabel
	 * @returns {Promise<Object>}
	 */
	this.getObjectSchema = async (permissionLabel) => {
		const baseObjectType = permissionLabel.split(":").shift();

		const schema = {
			$id: "objects",
			description: "Actor Properties",
			type: "object",
			additionalProperties: false,
			properties: {
				user_id: {
					anyOf: [
						{
							type: "number",
							enum: [Token.get("attrs").id],
						},
					],
				},
				scope: {
					type: "string",
					pattern: `^${Token.get("scope")}$`,
				},
			},
		};

		const result = await this.loadObjects(baseObjectType);
		if (typeof result === "object" && result !== null) {
			schema.properties[baseObjectType] = {
				type: "number",
				enum: result,
				minimum: 1,
			};
		} else {
			schema.properties[baseObjectType] = {
				type: "number",
				minimum: 1,
			};
		}

		return schema;
	};

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
				return await Token.load(tokenString);
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
				const objectSchema = await this.getObjectSchema(permission);

				const dataSchema = {
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
					},
				};

				const permissionSchema = {
					$async: true,
					$id: "permissions",
					type: "object",
					additionalProperties: false,
					properties: {},
				};

				if (!permissionSchemaCache[permission]) {
					const rawData = await fs.readFile(
						`${__dirname}/access/${permission.replace(/:/gim, "-")}.json`,
						"utf8",
					);
					permissionSchemaCache[permission] = JSON.parse(rawData);
				}

				permissionSchema.properties[permission] = permissionSchemaCache[permission];

				// Reuse global Ajv instance but compile only the necessary request-specific schemas if not already present.
				// However, 'objectSchema' is dynamic per request (depends on user context), so we can't cache it easily globally without leaking.
				// But we can validate against a dynamically assembled schema using the pre-loaded ones.

				// Actually, Ajv instances are heavy. Creating one per request is bad.
				// We can add the dynamic schemas to the instance with a unique ID, validate, and then remove them?
				// Or better: use `validate` method with the schema object directly, passing the others as refs.
				// BUT `ajv.validate` compiles the schema. If we pass a new schema object every time, it compiles every time.
				// The `permissionSchema` is relatively static per permission type.
				// The `objectSchema` depends on the user's data.

				// Strategy:
				// 1. permissions.json and roles.json are static -> Loaded globally.
				// 2. permission-specific json (e.g. proxy_hosts-create.json) is static -> Cache and add to global Ajv.
				// 3. objectSchema is dynamic -> Pass as a definition or validate against it?

				// Let's refactor to avoid `new Ajv()`
				// We need to verify if we can pass schemas at validation time or if they must be added.
				// With `ajv`, `validate(schema, data)` compiles `schema`.
				// `objectSchema` changes every time because of `enum: [Token.get("attrs").id]` and object IDs.

				// If we keep `objectSchema` dynamic, we still pay compilation cost, but at least we save instantiation cost.

				// To avoid ID collisions with multiple concurrent requests, we shouldn't add/remove schemas to the singleton if we can avoid it,
				// OR we generate unique IDs.
				// BUT: objectSchema is referenced by `permissionSchema` usually via `$id: "objects"`.
				// If we have multiple requests, they all need "objects" schema but different versions.
				// This implies we cannot easily share a single Ajv instance for validation if it relies on global schema IDs being overwritten.

				// ALTERNATIVE: Use a pool of Ajv instances?
				// OR: Isolate the "dynamic" part.
				// The `objectSchema` defines `objects`.
				// The `permissionSchema` properties refer to `objects`.

				// If we instantiate Ajv, we should at least cache the `permissionSchema` compilation if possible, but it depends on `objects`.

				// Ideally:
				// const validate = ajv.compile(permissionSchema); // This depends on "objects" ref.
				// We can't compile it without "objects" being present.

				// Current fix: Move `new Ajv` out is hard because of the dynamic `objects` schema dependency.
				// BUT: We can optimize by re-using the `ajv` instance if we don't rely on global ID registry for the dynamic parts,
				// or if we accept that `new Ajv` is needed but we can pass the *pre-compiled* static schemas to it to save time?
				// No, `schemas: [...]` in constructor adds them.

				// Let's try to minimize overhead.
				// 1. Load static schemas once (done above).
				// 2. For the dynamic check:
				//    We have `permissionSchema` which includes `permissionSchemaCache[permission]`.
				//    And `objectSchema` which is dynamic.

				// If we use the global `ajv` instance:
				// We can't easily swap `objects` schema safely for concurrent requests.

				// FASTEST SAFE FIX:
				// Create a new Ajv instance BUT pass the *pre-compiled* or *pre-loaded* static schemas so it doesn't re-parse them?
				// Actually, passing `schemas: [roleSchema, ...]` just adds them.
				// The `new Ajv` cost is non-trivial but the schema compilation is the heavy part.

				// Better approach for `objectSchema`:
				// Instead of using `$ref: "objects"`, can we inline it?
				// `permissionSchema` property `permission` usually validates against `roleSchema` and `permsSchema`.
				// Let's check `backend/lib/access/proxy_hosts-list.json` content conceptually.
				// It likely refers to `#objects`.

				// If we look at the code: `schemas: [roleSchema, permsSchema, objectSchema, permissionSchema]`
				// `objectSchema` has `$id: "objects"`.

				// We can continue to create `new Ajv` but avoid re-loading/parsing JSONs (which we did with `permissionSchemaCache`).
				// AND we can optimize `roleSchema` / `permsSchema` by caching their compilation? No, they are used as refs.

				// What if we don't use `$id: "objects"`?
				// If the schema logic relies on it, we must.

				// Let's stick to the plan: Move instantiation out if possible.
				// If not possible due to concurrency, at least ensure we don't do `fs.readFile` or `JSON.parse` repeatedly (already fixed for permissions).
				// `roleSchema` and `permsSchema` are imported once at top.

				// The major overhead IS `new Ajv` + `compile`.
				// If we cannot share `Ajv` because of global namespace pollution of `$id: "objects"`, we are stuck with `new Ajv` OR we must change how schemas structure works.

				// However, we can create a "Factory" Ajv instance that has the static schemas, and use it to spawn checks?
				// Ajv doesn't support "forking".

				// LET'S DO THIS:
				// Use a local Ajv instance but created efficiently.
				// The previous code passed `roleSchema` and `permsSchema` every time.
				// This is fine.

				// Is there a way to make `objects` schema not global?
				// If we change `$id: "objects"` to something unique per request, we'd need to update references in `permissionSchema`. That's complex (replacing strings).

				// COMPROMISE:
				// We will stick to `new Ajv` for safety regarding concurrency (since `objects` ID is fixed),
				// BUT we will verify that `permissionSchemaCache` is working effectively.
				// The original code:
				// `if (!permissionSchemaCache[permission]) { ... }`
				// This part IS caching the JSON parse.

				// Wait, the user complaint is "Ajv wird bei jedem Check neu erstellt".
				// We MUST avoid `new Ajv`.

				// How to avoid `new Ajv` with dynamic schemas?
				// We can use `ajv.validate(schema, data)` where `schema` contains definitions.
				// If we merge `objectSchema` and `permissionSchema` into one giant schema, we don't need global IDs?
				// `permissionSchema` likely refers to `objects#/properties/...` or similar?
				// If we inspect `backend/lib/access.js`:
				// `permissionSchema.properties[permission] = permissionSchemaCache[permission];`
				// It doesn't look like `permissionSchema` itself has refs to `objects`.
				// The refs are likely inside the loaded JSONs.

				// If we assume we can't change the JSONs easily...
				// We can assume the request is sequential for a single `access` object?
				// `export default function (tokenString) { ... }`
				// This exports a factory function.
				// `const access = new Access(token);`
				// `access.can(...)`
				// If `access` object is used for one request, we can reuse `ajv` instance WITHIN the `access` instance?
				// `this.can` is async. If multiple `can` calls happen in parallel on the same request/token, they share context.
				// But `objectSchema` depends on `permissionLabel` (target object type), so it changes per `can` call.

				// So even within one request, `objects` schema changes if checking `proxy_hosts:update` vs `users:update`.

				// FIX:
				// We can remove the schemas from the instance after validation?
				// `ajv.removeSchema("objects")`
				// `ajv.removeSchema("permissions")`

				// So:
				// 1. Create `ajv` instance at module level (GLOBAL).
				// 2. Add static schemas (`roles`, `perms`) to it once.
				// 3. In `can()`:
				//    a. Generate unique ID for `objects` and `permissions` schemas? (e.g. using a counter or UUID).
				//    b. OR use `removeSchema` before/after.
				//    Using `removeSchema` is risky if we have concurrent requests in the same process (Node.js is single threaded JS, but `await` yields).
				//    If we `await ajv.validate(...)`, another request might interleave and swap the schema.
				//    GLOBAL SHARED AJV IS NOT SAFE with `removeSchema`.

				// Solution: Unique IDs.
				// We need to rewrite the refs in `permissionSchema` to point to the unique `objects` ID.
				// This sounds expensive (string replace).

				// Solution: Validation Function Cache.
				// If `objectSchema` and `permissionSchema` were static, we could cache the compiled validation function.
				// But `objectSchema` contains specific IDs: `enum: [result]`.
				// This makes every validation unique to the data.

				// WAIT. Is `objectSchema` really needed for VALIDATION logic?
				// It validates `data.user_id` and `data[baseObjectType]`.
				// This checks if the user OWNS the object.
				// The schema is built dynamically to enforce: "Input ID must be in [List of IDs user owns]".

				// This design effectively moves "Business Logic" (Ownership check) into "Schema Validation".
				// That is the root cause of the performance issue.
				// Re-instantiating Ajv is necessary because the schema *is* the state.

				// To fix "Auth Overhead" without rewriting the whole logic:
				// We can try to make `new Ajv` cheaper.
				// passing `schemas: [roleSchema, permsSchema...]` makes it compile/add them every time.
				// If we verify `roleSchema` and `permsSchema` don't change, maybe we can keep a "base" Ajv instance and clone it?
				// Ajv doesn't support cloning.

				// Is there a way to validate against a schema that takes "allowed IDs" as a parameter (data)?
				// Ajv supports `$data` reference, but that refers to data in the instance being validated.
				// We are validating `{ [permission]: { ... } }`.
				// The `objects` schema is checking `data[permission].data`.

				// Let's go with the safest optimization that satisfies "Ajv neu erstellt" complaint partially or fully if possible.
				// If we cannot make it global, we can make it instance-local (per `access` object)?
				// `access` object is per token (per user session/request usually).
				// If we reuse it across `can` calls for the same request, we save some overhead if `can` is called multiple times.
				// But `objectSchema` still changes per `can` call type.

				// Let's look at `permissionSchemaCache`. It caches the JSON structure.
				// We can optimize the `Ajv` creation by not adding `roleSchema` and `permsSchema` if they are not used?
				// They are likely used.

				// Back to the "Global Ajv" idea.
				// If we can't solve concurrency, we can't use global Ajv with fixed IDs.
				// Unless we use `ajv.compile` which returns a validate function, and that function is independent?
				// When `ajv.compile` runs, it resolves refs. If refs point to global schemas, it burns them in.
				// If refs point to missing schemas, it fails.
				// We need to provide `objects` schema.

				// What if we pass the dynamic schemas as `components` or similar? No.

				// Let's stick to the request. "Ajv wird bei jedem Check neu erstellt".
				// Fix: Use a global Ajv instance, but generate UNIQUE IDs for the dynamic schemas for every check.
				// `const runId = crypto.randomUUID();`
				// `$id: "objects_" + runId`
				// But `permissionSchema` refers to `objects`. We'd need to patch `permissionSchema` to ref `objects_...`.
				// `permissionSchema` (the loaded JSON) probably has `{ "$ref": "objects" }`.
				// String replacing `"objects"` with `"objects_ID"` in the JSON string before parsing might work and be faster than `new Ajv`.

				const runId = Math.random().toString(36).substring(7);
				const objectSchemaId = `objects_${runId}`;
				const permissionSchemaId = `permissions_${runId}`;

				// 1. Get objectSchema (Dynamic)
				const objectSchema = await this.getObjectSchema(permission);
				objectSchema.$id = objectSchemaId;

				// 2. Prepare Data Schema
				const dataSchema = {
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
					},
				};

				// 3. Get Permission Schema (Static-ish)
				if (!permissionSchemaCache[permission]) {
					const rawData = await fs.readFile(
						`${__dirname}/access/${permission.replace(/:/gim, "-")}.json`,
						"utf8",
					);
					// We cache the STRING to allow fast replacement
					permissionSchemaCache[permission] = rawData;
				}

				// Replace generic "objects" ref with specific ID
				// This assumes the JSON uses "objects" or "objects#/..." refs.
				// We need to be careful not to replace other things.
				// Quotes are important: "objects" -> "objects_ID"
				// Refs usually look like: "$ref": "objects#/properties/..."
				const patchedPermissionJson = permissionSchemaCache[permission].replaceAll('"objects', `"${objectSchemaId}`);

				const permissionSchemaPart = JSON.parse(patchedPermissionJson);

				const permissionSchema = {
					$async: true,
					$id: permissionSchemaId,
					type: "object",
					additionalProperties: false,
					properties: {
						[permission]: permissionSchemaPart
					},
				};

				// 4. Use Global Ajv
				// We add the schemas, validate, and then remove them to avoid memory leak.
				// Since IDs are unique, concurrency is fine.

				try {
					ajv.addSchema(objectSchema);
					ajv.addSchema(permissionSchema);

					const valid = await ajv.validate(permissionSchemaId, dataSchema);
					return valid && dataSchema[permission];
				} finally {
					ajv.removeSchema(objectSchemaId);
					ajv.removeSchema(permissionSchemaId);
				}
			} catch (err) {
				err.permission = permission;
				err.permission_data = data;
				logger.error(permission, data, err.message);
				throw new errs.PermissionError("Permission Denied", err);
			}
		},
	};
}
