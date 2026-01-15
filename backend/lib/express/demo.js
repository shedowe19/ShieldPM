import ipaddr from "ipaddr.js";
import { isDemoMode } from "../config.js";

/**
 * Helper: Get field value supporting both camelCase and snake_case
 */
const getField = (body, camelName, snakeName) => body[camelName] ?? body[snakeName];

/**
 * Helper: Validate a host against SSRF restrictions
 */
const validateHost = (host, forbiddenHosts, res, context = "") => {
	if (!host) return null;

	if (forbiddenHosts.includes(host) || host.endsWith(".local")) {
		return blockRequest(
			res,
			`Forwarding to internal services (localhost/db/local) is disabled in Demo Mode.${context}`,
		);
	}

	try {
		if (ipaddr.isValid(host)) {
			const addr = ipaddr.parse(host);
			const range = addr.range();

			const blockedRanges = [
				"loopback",
				"private",
				"linkLocal",
				"uniqueLocal",
				"carrierGradeNat",
				"reserved",
				"broadcast",
				"multicast",
			];

			if (blockedRanges.includes(range)) {
				return blockRequest(res, `Forwarding to ${range} IP (${host}) is disabled in Demo Mode.${context}`);
			}

			if (addr.kind() === "ipv6" && /** @type {any} */ (addr).isIPv4MappedAddress()) {
				const v4 = /** @type {any} */ (addr).toIPv4Address();
				if (blockedRanges.includes(v4.range())) {
					return blockRequest(
						res,
						`Forwarding to mapped ${v4.range()} IP (${host}) is disabled in Demo Mode.${context}`,
					);
				}
			}
		}
	} catch (_err) {
		// Not a valid IP, ignored
	}
	return null;
};

/**
 * Middleware to block/validate functionality in demo mode
 * NOTE: req.path does NOT include /api prefix (routes are mounted at /api)
 */
const checkDemoMode = (req, res, next) => {
	if (isDemoMode()) {
		// 1. Block Critical Admin Actions

		// Block User Password Changes & Permissions
		// PUT /users/:id/auth or /users/:id/permissions
		if (req.method === "PUT" && req.path.match(/^\/users\/\d+\/(auth|permissions)$/)) {
			return blockRequest(res);
		}

		// Block User Creation & Deletion
		// POST /users or DELETE /users/:id
		if (
			(req.method === "POST" && req.path === "/users") ||
			(req.method === "DELETE" && req.path.match(/^\/users\/\d+$/))
		) {
			return blockRequest(res);
		}

		// Block Global Settings Changes
		// PATCH /settings/:id
		if (req.method === "PATCH" && req.path.match(/^\/settings/)) {
			return blockRequest(res);
		}

		// Block Cloudflare Tunnels (Create/Update/Delete)
		// /nginx/cloudflared*
		if (
			(req.method === "POST" || req.method === "PUT" || req.method === "DELETE") &&
			req.path.startsWith("/nginx/cloudflared")
		) {
			return blockRequest(res);
		}

		// 2. Data Validation for Proxy Hosts (Prevent Breakouts)
		// POST/PUT /nginx/proxy-hosts
		if ((req.method === "POST" || req.method === "PUT") && req.path.startsWith("/nginx/proxy-hosts")) {
			const body = req.body;
			if (!body) {
				return blockRequest(res, "Request body is required.");
			}

			// Block Advanced Config (both camelCase and snake_case)
			const advConfig = getField(body, "advancedConfig", "advanced_config");
			if (advConfig && advConfig.trim().length > 0) {
				return blockRequest(res, "Advanced Nginx Configuration is disabled in Demo Mode.");
			}

			// Block Path forwarding
			const scheme = getField(body, "forwardScheme", "forward_scheme");
			if (scheme === "path") {
				return blockRequest(res, "Local Path forwarding is disabled in Demo Mode.");
			}

			// Anti-SSRF: Check forward host
			const forbiddenHosts = ["localhost", "db", "app", "redis", "postgres", "mysql"];
			const forwardHost = getField(body, "forwardHost", "forward_host");
			const hostError = validateHost(forwardHost, forbiddenHosts, res);
			if (hostError) return hostError;

			// Block Custom Locations entirely in Demo Mode
			if (body.locations && Array.isArray(body.locations) && body.locations.length > 0) {
				return blockRequest(res, "Custom Locations (Paths) are disabled in Demo Mode.");
			}
		}

		// 3. Validation for OTHER Host Types (Redirection, Dead, Stream)
		// /nginx/redirection-hosts, /nginx/dead-hosts, /nginx/streams
		if (
			(req.method === "POST" || req.method === "PUT") &&
			req.path.match(/^\/nginx\/(redirection-hosts|dead-hosts|streams)/)
		) {
			const body = req.body;
			const forbiddenHosts = ["localhost", "db", "app", "redis", "postgres", "mysql"];

			// Block Advanced Config
			const advConfig = getField(body, "advancedConfig", "advanced_config");
			if (advConfig && advConfig.trim().length > 0) {
				return blockRequest(res, "Advanced Nginx Configuration is disabled in Demo Mode.");
			}

			// Streams: Check forward_host for private IPs
			if (req.path.includes("/streams")) {
				const forwardHost = getField(body, "forwardHost", "forward_host");
				const hostError = validateHost(forwardHost, forbiddenHosts, res);
				if (hostError) return hostError;
			}

			// Redirection Hosts: Check forward_domain_name for private IPs
			if (req.path.includes("/redirection-hosts")) {
				const forwardDomain = getField(body, "forwardDomainName", "forward_domain_name");
				const hostError = validateHost(forwardDomain, forbiddenHosts, res);
				if (hostError) return hostError;
			}

			// Dead Hosts (404): Check domain_names for internal-only domains
			if (req.path.includes("/dead-hosts")) {
				const domainNames = getField(body, "domainNames", "domain_names") || [];
				for (const domain of domainNames) {
					if (forbiddenHosts.includes(domain) || domain.endsWith(".local")) {
						return blockRequest(res, "Internal domain names are disabled in Demo Mode.");
					}
				}
			}
		}

		// Allow everything else (Sandbox Mode)
		return next();
	}

	return next();
};

const blockRequest = (res, msg) => {
	return res.status(403).send({
		error: {
			message: msg || "This administrative action is not allowed in Demo Mode.",
			code: 403,
		},
	});
};

export default checkDemoMode;
