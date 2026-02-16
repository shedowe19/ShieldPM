/**
 * AI Tool Executor Module
 * Handles the execution of AI tool calls by interfacing with internal backend modules.
 */

import { isDemoMode } from "../../lib/config.js";
import toolsRegistry from "./tools/index.js";

/**
 * Execute a list of tool calls
 * @param {Object} access - The user access object (permission context)
 * @param {Array} toolCalls - List of tool calls from the LLM
 * @returns {Promise<Array>} - List of tool results
 */
export const executeTools = async (access, toolCalls) => {
	const toolResults = [];

	for (const call of /** @type {any[]} */ (toolCalls)) {
		try {
			// Check for Demo Mode restrictions
			if (isDemoMode()) {
				const blockedTools = [
					"update_user_password",
					"update_user_permissions",
					"update_user", // Block general user updates (roles/email)
					"create_user",
					"delete_user",
					"get_users", // Privacy: Don't list other users
					"update_global_setting",
					"get_global_settings", // Security: Don't reveal secrets
					"create_api_token",
					"login_as_user",
					"read_nginx_logs", // Privacy: Don't reveal IPs
					"get_audit_log", // Privacy: Don't reveal user actions
					"create_cloudflared_tunnel",
					"update_cloudflared_tunnel",
					"delete_cloudflared_tunnel",
					"get_cloudflared_tunnels",
				];
				if (blockedTools.includes(call.name)) {
					toolResults.push({
						name: call.name,
						result: "Error: This action is prohibited in the public Demo Mode.",
					});
					continue;
				}
			}

			const handler = toolsRegistry[call.name];
			let result;

			if (handler) {
				result = await handler(access, call.args);
			} else {
				result = `Unknown Tool: ${call.name}`;
			}

			// Add result to list
			toolResults.push({ name: call.name, result });
		} catch (err) {
			console.error(`[AI Executor] Error processing tool ${call.name}:`, err);
			toolResults.push({ name: call.name, result: `Error: ${err.message}` });
		}
	}

	return toolResults;
};
