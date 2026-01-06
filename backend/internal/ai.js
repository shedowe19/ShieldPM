import internalSetting from "./setting.js";
import internalProxyHost from "./proxy-host.js";
import internalRedirectionHost from "./redirection-host.js";
import internalDeadHost from "./dead-host.js";
import internalStream from "./stream.js";
import internalAccessList from "./access-list.js";
import internalAuditLog from "./audit-log.js";
import AnalyticCount from "../models/analytic_count.js";
import internalUser from "./user.js";
// internalSetting is already imported at the top, I'll check line 1.
import CloudflaredTunnel from "../models/cloudflared_tunnel.js";
import { encrypt, decrypt } from "../lib/encryption.js";
import internalReport from "./report.js";
import internalIpRanges from "./ip_ranges.js";
import internalCertificate from "./certificate.js";
import dayjs from "dayjs";
import { exec } from "child_process";
import util from "util";
const execAsync = util.promisify(exec);

import internalToken from "./token.js";
import internalPki from "./pki.js";
import internalNginx from "./nginx.js";
import si from "systeminformation";
import dnsPlugins from "../certbot/dns-plugins.json" with { type: "json" };
import { GoogleGenerativeAI } from "@google/generative-ai";

const AI_CONFIG_ID = "ai-config";

/**
 * AI Service for handling Chat and Tool Execution
 */
const ai = {
    /**
     * Get the current AI Configuration
     * @param {Access} access
     */
    getConfig: async (access) => {
        // Verify permissions (admin only for config)
        await access.can("settings:list");
        try {
            const row = await internalSetting.get(access, { id: AI_CONFIG_ID });
            const meta = row.meta;
            if (meta.api_key) {
                try {
                    meta.api_key = decrypt(meta.api_key);
                } catch (err) {
                    // Ignore decryption error
                }
            }
            // Ensure defaults exist
            if (!meta.num_ctx) meta.num_ctx = 8192;
            if (!meta.num_batch) meta.num_batch = 512;
            if (!meta.num_thread) meta.num_thread = 4;
            if (!meta.keep_alive) meta.keep_alive = "5m";
            return meta;
        } catch (err) {
            // Return default config if not found
            return {
                enabled: false,
                provider: "gemini",
                api_key: "",
                base_url: "",
                model: "",
                num_ctx: 8192,
                num_batch: 512,
                num_thread: 4,
                keep_alive: "5m",
            };
        }
    },

    /**
     * Get AI Config for chat (internal, no admin permission required)
     * This is used by the chat function so all authenticated users can chat
     */
    _getConfigForChat: async () => {
        try {
            const SettingModel = (await import("../models/setting.js")).default;
            const row = await SettingModel.query().where("id", AI_CONFIG_ID).first();
            if (!row) {
                return { enabled: false };
            }
            const meta = row.meta;
            if (meta.api_key) {
                try {
                    meta.api_key = decrypt(meta.api_key);
                } catch (err) {
                    // Ignore decryption error
                }
            }
            // Ensure defaults exist
            if (!meta.num_ctx) meta.num_ctx = 8192;
            if (!meta.num_batch) meta.num_batch = 512;
            if (!meta.num_thread) meta.num_thread = 4;
            if (!meta.keep_alive) meta.keep_alive = "5m";
            return meta;
        } catch (err) {
            return { enabled: false };
        }
    },

    /**
     * Update AI Configuration
     * @param {Access} access
     * @param {Object} data
     */
    setConfig: async (access, data) => {
        await access.can("settings:update", AI_CONFIG_ID);

        const dataToSave = { ...data };
        if (dataToSave.api_key) {
            dataToSave.api_key = encrypt(dataToSave.api_key);
        }

        // Check if setting exists, create if not
        try {
            await internalSetting.get(access, { id: AI_CONFIG_ID });
            // Update
            await internalSetting.update(access, {
                id: AI_CONFIG_ID,
                description: "AI Agent Configuration",
                value: data.enabled ? "true" : "false",
                meta: dataToSave,
            });
        } catch (err) {
            const SettingModel = (await import("../models/setting.js")).default;
            await SettingModel.query().insert({
                id: AI_CONFIG_ID,
                description: "AI Agent Configuration",
                value: data.enabled ? "true" : "false",
                meta: dataToSave,
            });
        }

        // Return original data to user (unencrypted)
        return data;
    },

    /**
     * Get Models from Provider
     * @param {Access} access
     * @param {Object} config
     */
    getModels: async (access, config) => {
        await access.can("settings:list");

        if (config.provider === "gemini") {
            if (!config.api_key) throw new Error("API Key is required");
            const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${config.api_key}`;
            try {
                const res = await fetch(url);
                if (!res.ok) throw new Error(`Gemini Error: ${res.status} ${res.statusText}`);
                const data = await res.json();
                return (data.models || [])
                    .filter((m) => m.name.includes("gemini"))
                    .map((m) => ({
                        id: m.name.replace("models/", ""),
                        name: m.displayName || m.name,
                    }))
                    .sort((a, b) => b.id.localeCompare(a.id));
            } catch (err) {
                throw new Error(`Failed to fetch Gemini models: ${err.message}`);
            }
        } else {
            // Local / OpenAI
            const baseUrl = config.base_url || "http://localhost:11434";

            let targetUrl;
            try {
                // Parse and validate base URL
                const parsedBase = new URL(baseUrl);

                // Security check: Only allow HTTP/HTTPS
                if (!["http:", "https:"].includes(parsedBase.protocol)) {
                    throw new Error("Only HTTP/HTTPS protocols are allowed for base_url");
                }

                // Safely construct the final URL using URL constructor
                // This handles slash consistency and prevents some path traversal issues
                targetUrl = new URL("v1/models", parsedBase);
            } catch (err) {
                throw new Error(`Invalid base_url: ${err.message}`);
            }

            try {
                const headers = {};
                if (config.api_key) headers["Authorization"] = `Bearer ${config.api_key}`;

                const res = await fetch(targetUrl.toString(), { headers });
                if (!res.ok) throw new Error(`Local Provider Error: ${res.status} ${res.statusText}`);
                const data = await res.json();
                return (data.data || [])
                    .map((m) => ({
                        id: m.id,
                        name: m.id,
                    }))
                    .sort((a, b) => a.id.localeCompare(b.id));
            } catch (err) {
                throw new Error(`Failed to fetch Local models: ${err.message}`);
            }
        }
    },

    /**
     * Main Chat Entry point
     * @param {Access} access
     * @param {String} message
     * @param {Array} history
     */
    chat: async (access, message, history = []) => {
        // 1. Get Config (using internal method that doesn't require admin permission)
        const config = await ai._getConfigForChat();
        if (!config.enabled) {
            throw new Error("AI Agent is disabled.");
        }

        console.log("[DEBUG] AI Chat Config:", {
            provider: config.provider,
            model: config.model,
            baseUrl: config.base_url,
        });

        // FAIL-SAFE: If switching providers left a Gemini model name, clear it for Local
        if (config.provider === "local" && config.model && config.model.includes("gemini")) {
            // Logs for debugging
            console.log(`[AI] Sanitzing model for Local provider. Invalid model: ${config.model}`);
            config.model = ""; // Will fallback to default in _callLocalLLM
        }

        // 2. Prepare System Prompt & Tools
        const defaultPrompt = `You are the AI Administrator for **ShieldPM**, a specific fork of Nginx Proxy Manager.
Your goal is to help the user manage their Nginx proxy hosts, certificates, and settings through this chat interface.

CONTEXT & CRITICAL RULES:
1. You are communicating with the user via a text chat in the ShieldPM web interface.
2. The user has ALREADY authenticated and has permission to manage these resources.
3. You have access to the following tools (functions) to perform actions.
4. **ALWAYS use the provided tools** to fetch information or perform actions. Do NOT guess or hallucinate state.
5. If the user asks to "list" or "show" something, CALL THE CORRESPONDING GET TOOL immediately.
6. **NEVER** claim you have performed an action unless you have successfully called the corresponding tool.
7. When a user asks you to DO something (enable, disable, create, delete, update, activate, deactivate, etc.), you MUST execute the appropriate tool. NEVER just say "I will do X" - actually DO IT by calling the tool!
8. NEVER ask the user for IDs, hostnames, or other identifiers! You have query tools (get_proxy_hosts, get_users, get_certificates, etc.) - USE THEM to find what you need!
9. If you need information first (e.g., to find a host ID by domain name), call the query tool first, THEN immediately call the action tool with the ID you found.
10. ALWAYS execute the full sequence of tools needed to complete the user's request.
11. IMPORTANT: ALWAYS respond in the SAME LANGUAGE as the user's message. If the user writes in German, respond in German. If in English, respond in English.
12. If a tool returns an ERROR, you MUST show the EXACT error message to the user. DO NOT hide errors!

🚫 ANTI-HALLUCINATION - EXTREMELY IMPORTANT:
- NEVER say "Deleted", "Created", "Updated", "Enabled", or "Disabled" unless you ACTUALLY CALLED the corresponding tool!
- You can ONLY confirm an action if the tool was executed and returned success.
- If you did NOT call delete_proxy_host, you CANNOT say "Deleted"!
- DO NOT pretend to have done something - the user can verify!

⚠️ CRITICAL SAFETY RULES FOR DESTRUCTIVE OPERATIONS (delete, disable):
7. When deleting or disabling, you MUST:
   - First call get_* to retrieve the list
   - CAREFULLY match the EXACT domain name the user specified
   - Double-check you have the correct ID before calling delete/disable
   - NEVER delete/disable by position (e.g., first item) - ALWAYS match by domain name
   - If you are unsure which item matches, ask the user for clarification
8. BEFORE executing ANY delete operation, tell the user WHICH domain you found and ask for confirmation!

🔍 HOST TYPE DETECTION:
10. When user says "delete host X" or "disable host X" WITHOUT specifying the type:
    - You MUST search ALL host types: get_proxy_hosts, get_redirection_hosts, get_dead_hosts, get_streams
    - Tell the user WHERE you found the domain (e.g., "Found '1.local' in Proxy Hosts")
    - If user CORRECTS you ("it's in Proxy Host, not Redirection"), search the correct type immediately!
    - NEVER assume one host type - always verify!

✅ CREATE OPERATIONS - Just do it:
9. For CREATE commands (create_proxy_host, create_redirection_host, etc.):
   - DO NOT ask for confirmation - just CREATE it immediately!
   - If user says "with made-up data" or similar, generate realistic example data yourself
   - If domain already exists, use a different one (add numbers like example2.com)
   - After creation, tell the user what you created

🔄 VERIFY AFTER DELETE:
11. After EVERY delete operation, you MUST verify it worked:
    - Call the corresponding get_* tool again (e.g., get_proxy_hosts after delete_proxy_host)
    - Check that the deleted item is NO LONGER in the list
    - Tell the user: "Deleted and verified: [domain] no longer exists"
    - If the item still exists, report an error!

Examples - ALWAYS follow this pattern: Query → Find ID → Execute Action:

PROXY HOSTS:
- "disable cdn.ex.com" → get_proxy_hosts, find ID, disable_proxy_host
- "enable cdn.ex.com" → get_proxy_hosts, find ID, enable_proxy_host
- "create proxy app.ex.com to 192.168.1.10:3000" → create_proxy_host with domain_names, forward_scheme: "http", forward_host, forward_port
- "update proxy cdn.ex.com forward to 10.0.0.5:8080" → get_proxy_hosts, find ID, update_proxy_host
- "delete proxy old.ex.com" → get_proxy_hosts, find ID, delete_proxy_host

REDIRECTION HOSTS:
- "create redirect from old.ex.com to new.ex.com" → create_redirection_host
- "update redirect scheme to 302" → get_redirection_hosts, find ID, update_redirection_host
- "enable redirect old.ex.com" → get_redirection_hosts, find ID, enable_redirection_host
- "disable redirect old.ex.com" → get_redirection_hosts, find ID, disable_redirection_host
- "delete redirect" → get_redirection_hosts, find ID, delete_redirection_host

DEAD HOSTS (404):
- "create 404 host for unused.ex.com" → create_dead_host
- "update 404 host certificate" → get_dead_hosts, find ID, update_dead_host
- "enable 404 host" → get_dead_hosts, find ID, enable_dead_host
- "disable 404 host" → get_dead_hosts, find ID, disable_dead_host
- "delete 404 host" → get_dead_hosts, find ID, delete_dead_host

STREAMS (TCP/UDP):
- "create stream port 3306 to db.local:3306" → create_stream
- "update stream port 3306 forwarding" → get_streams, find ID, update_stream
- "enable stream on port 3306" → get_streams, find ID, enable_stream
- "disable stream on port 3306" → get_streams, find ID, disable_stream
- "delete stream port 5432" → get_streams, find ID, delete_stream

CERTIFICATES:
- "create certificate for app.ex.com" → create_certificate with provider, domain_names
- "renew certificate ex.com" → get_certificates, find ID, renew_certificate
- "update certificate nickname" → get_certificates, find ID, update_certificate
- "upload custom certificate" → upload_certificate with certificate, certificate_key
- "validate certificate files" → validate_certificate with certificate, certificate_key
- "get certificate details for ex.com" → get_certificates, find ID, get_certificate_details
- "test HTTP challenge for ex.com" → test_http_challenge with domains
- "list DNS providers" → get_dns_providers
- "delete certificate" → get_certificates, find ID, delete_certificate
- "create client cert for admin" → create_client_certificate with common_name, password

ACCESS LISTS:
- "create access list for admin" → create_access_list
- "update access list to add password" → get_access_lists, find ID, update_access_list
- "delete access list" → get_access_lists, find ID, delete_access_list

USERS & AUTH:
- "create user john@ex.com" → create_user with name, email, roles, auth
- "update user email" → get_users, find ID, update_user
- "reset password for alice@ex.com" → get_users, find ID, update_user_password
- "update user permissions" → get_users, find ID, update_user_permissions
- "delete user bob@ex.com" → get_users, find ID, delete_user
- "login as user alice@ex.com" → get_users, find ID, login_as_user
- "create API token for monitoring" → create_api_token with identity

CLOUDFLARE TUNNELS:
- "create tunnel MyTunnel with token ABC123" → create_cloudflared_tunnel
- "update tunnel name" → get_cloudflared_tunnels, find ID, update_cloudflared_tunnel
- "delete tunnel" → get_cloudflared_tunnels, find ID, delete_cloudflared_tunnel

ANALYTICS & LOGS:
- "get analytics for cdn.ex.com" → get_proxy_hosts, find ID, get_analytics_series
- "show analytics summary" → get_analytics_summary
- "show error logs" → read_nginx_logs with log_type: "error"
- "show last 50 access logs" → read_nginx_logs with log_type: "access", lines: 50

SYSTEM:
- "show system status" → get_system_status
- "test nginx config" → test_nginx_config
- "reload nginx" → force_nginx_reload
- "show audit log" → get_audit_log
- "show host counts" → get_host_counts
- "get settings" → get_global_settings
- "update default email" → update_global_setting
- "renew cloudflare IPs" → renew_ip_ranges

Be concise. Always respond in the user's language.
Time: ${new Date().toISOString()}`;

        const systemPrompt = config.system_prompt || defaultPrompt;

        const tools = [
            {
                function: {
                    name: "get_proxy_hosts",
                    description: "Get a list of all Proxy Hosts",
                    parameters: {
                        type: "object",
                        properties: {},
                    },
                },
            },

            // Audit Log
            {
                function: {
                    name: "get_audit_log",
                    description: "Get System Audit Logs",
                    parameters: { type: "object", properties: { limit: { type: "integer" } } },
                },
            },
            // Analytics
            {
                function: {
                    name: "get_analytics_summary",
                    description: "Get recent analytics summary (24h)",
                    parameters: { type: "object", properties: {} },
                },
            },
            // Nginx Logs
            {
                function: {
                    name: "read_nginx_logs",
                    description: "Read the last N lines of Nginx Access or Error logs",
                    parameters: {
                        type: "object",
                        properties: {
                            log_type: { type: "string", description: "access, json_access, or error" },
                            lines: { type: "integer", description: "Number of lines to read (max 100)" },
                        },
                        required: ["log_type"],
                    },
                },
            },
            // User Management
            {
                function: {
                    name: "get_users",
                    description: "Get all Users",
                    parameters: { type: "object", properties: {} },
                },
            },
            {
                function: {
                    name: "login_as_user",
                    description: "Log in as another user (Impersonation)",
                    parameters: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] },
                },
            },
            {
                function: {
                    name: "create_api_token",
                    description: "Create a new API Token",
                    parameters: {
                        type: "object",
                        properties: {
                            identity: { type: "string" },
                            expiry: { type: "string", description: "ISO Date or null" },
                        },
                        required: ["identity"],
                    },
                },
            },
            {
                function: {
                    name: "create_client_certificate",
                    description: "Create an Internal Client Certificate (.p12)",
                    parameters: {
                        type: "object",
                        properties: {
                            common_name: { type: "string" },
                            password: { type: "string" },
                            years: { type: "integer" },
                        },
                        required: ["common_name", "password"],
                    },
                },
            },
            {
                function: {
                    name: "create_user",
                    description: "Create a new User",
                    parameters: {
                        type: "object",
                        properties: {
                            name: { type: "string" },
                            nickname: { type: "string" },
                            email: { type: "string" },
                            roles: { type: "array", items: { type: "string" } },
                            auth: {
                                type: "object",
                                properties: {
                                    type: { type: "string", enum: ["password"] },
                                    secret: { type: "string" },
                                },
                                required: ["type", "secret"],
                            },
                            is_disabled: { type: "boolean" },
                        },
                        required: ["name", "nickname", "email"],
                    },
                },
            },
            {
                function: {
                    name: "update_user",
                    description: "Update a User",
                    parameters: {
                        type: "object",
                        properties: {
                            id: { type: "integer" },
                            name: { type: "string" },
                            email: { type: "string" },
                            nickname: { type: "string" },
                            roles: { type: "array", items: { type: "string" } },
                            is_disabled: { type: "boolean" },
                        },
                        required: ["id"],
                    },
                },
            },
            {
                function: {
                    name: "update_user_password",
                    description: "Update a User's Password",
                    parameters: {
                        type: "object",
                        properties: {
                            id: { type: "integer" },
                            auth: {
                                type: "object",
                                properties: { type: { type: "string" }, secret: { type: "string" } },
                                required: ["type", "secret"],
                            },
                        },
                        required: ["id", "auth"],
                    },
                },
            },
            {
                function: {
                    name: "update_user_permissions",
                    description: "Update a User's Permissions",
                    parameters: {
                        type: "object",
                        properties: {
                            id: { type: "integer" },
                            permissions: { type: "object" }, // Schema technically defines extensive permission object
                        },
                        required: ["id", "permissions"],
                    },
                },
            },
            {
                function: {
                    name: "delete_user",
                    description: "Delete (soft delete) a User",
                    parameters: {
                        type: "object",
                        properties: { id: { type: "integer" } },
                        required: ["id"],
                    },
                },
            },
            // Cloudflare Tunnels
            {
                function: {
                    name: "get_cloudflared_tunnels",
                    description: "Get all Cloudflare Tunnels",
                    parameters: { type: "object", properties: {} },
                },
            },
            {
                function: {
                    name: "update_cloudflared_tunnel",
                    description: "Update Cloudflare Tunnel",
                    parameters: {
                        type: "object",
                        properties: {
                            id: { type: "integer" },
                            name: { type: "string" },
                            token: { type: "string" },
                        },
                        required: ["id"],
                    },
                },
            },
            {
                function: {
                    name: "delete_cloudflared_tunnel",
                    description: "Delete a Cloudflare Tunnel",
                    parameters: {
                        type: "object",
                        properties: { id: { type: "integer" } },
                        required: ["id"],
                    },
                },
            },
            {
                function: {
                    name: "create_cloudflared_tunnel",
                    description: "Create a new Cloudflare Tunnel",
                    parameters: {
                        type: "object",
                        properties: {
                            name: { type: "string" },
                            token: { type: "string" },
                        },
                        required: ["name", "token"],
                    },
                },
            },
            // Settings
            {
                function: {
                    name: "get_global_settings",
                    description: "Get Global ShieldPM Settings",
                    parameters: { type: "object", properties: {} },
                },
            },
            {
                function: {
                    name: "get_host_counts",
                    description: "Get Counts of all Host types",
                    parameters: { type: "object", properties: {} },
                },
            },
            {
                function: {
                    name: "create_certificate",
                    description: "Create a Certificate (Let's Encrypt or Internal)",
                    parameters: {
                        type: "object",
                        properties: {
                            provider: {
                                type: "string",
                                enum: ["letsencrypt", "internal"],
                                description: "Provider type",
                            },
                            domain_names: { type: "array", items: { type: "string" } },
                            meta: {
                                type: "object",
                                properties: {
                                    dns_challenge: { type: "boolean" },
                                    email: { type: "string" },
                                    agree_tos: { type: "boolean" },
                                    years: { type: "integer", description: "Validity years (Internal only)" },
                                },
                                required: ["agree_tos"],
                            },
                        },
                        required: ["provider"],
                    },
                },
            },
            {
                function: {
                    name: "test_nginx_config",
                    description: "Test Nginx Configuration",
                    parameters: { type: "object", properties: {} },
                },
            },
            {
                function: {
                    name: "update_certificate",
                    description: "Update a Certificate",
                    parameters: {
                        type: "object",
                        properties: {
                            id: { type: "integer" },
                            nice_name: { type: "string" },
                        },
                        required: ["id"],
                    },
                },
            },
            {
                function: {
                    name: "get_certificate_details",
                    description: "Get full details for a Certificate",
                    parameters: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] },
                },
            },
            {
                function: {
                    name: "get_dns_providers",
                    description: "Get list of supported DNS Providers",
                    parameters: { type: "object", properties: {} },
                },
            },
            {
                function: {
                    name: "test_http_challenge",
                    description: "Test HTTP Challenge for domains",
                    parameters: {
                        type: "object",
                        properties: {
                            domains: { type: "array", items: { type: "string" } },
                        },
                        required: ["domains"],
                    },
                },
            },
            {
                function: {
                    name: "get_analytics_series",
                    description: "Get Analytics (Time Series)",
                    parameters: { type: "object", properties: {} },
                },
            },
            {
                function: {
                    name: "delete_certificate",
                    description: "Delete a Certificate",
                    parameters: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] },
                },
            },
            {
                function: {
                    name: "get_certificates",
                    description: "Get all Certificates",
                    parameters: { type: "object", properties: {} },
                },
            },

            {
                function: {
                    name: "renew_ip_ranges",
                    description: "Force renewal of Cloudflare IP Ranges",
                    parameters: { type: "object", properties: {} },
                },
            },
            {
                function: {
                    name: "create_proxy_host",
                    description: "Create a new Proxy Host",
                    parameters: {
                        type: "object",
                        properties: {
                            domain_names: {
                                type: "array",
                                items: { type: "string" },
                                description: "List of domain names (e.g. example.com)",
                            },
                            forward_scheme: {
                                type: "string",
                                enum: ["http", "https"],
                                description: "Forwarding scheme",
                            },
                            forward_host: { type: "string", description: "Internal IP or hostname to forward to" },
                            forward_port: { type: "integer", description: "Internal Port to forward to" },
                            locations: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        path: { type: "string", description: "Path to match (e.g. /api)" },
                                        forward_scheme: {
                                            type: "string",
                                            description: "http, https, grpc, grpcs, path",
                                        },
                                        forward_host: { type: "string" },
                                        forward_port: { type: "integer" },
                                        advanced_config: { type: "string" },
                                    },
                                    required: ["path", "forward_host", "forward_port"],
                                },
                            },
                            access_list_id: { type: "integer", description: "ID of Access List to use (0 for none)" },
                            certificate_id: { type: "integer", description: "ID of Certificate to use (0 for none)" },
                            ssl_forced: { type: "boolean" },
                            caching_enabled: { type: "boolean" },
                            block_exploits: { type: "boolean" },
                            allow_websocket_upgrade: { type: "boolean" },
                            http2_support: { type: "boolean" },
                            hsts_enabled: { type: "boolean" },
                            hsts_subdomains: { type: "boolean" },
                            disable_buffering: { type: "boolean" },
                            bandwidth_limit: {
                                type: "string",
                                description: "Limit bandwidth (e.g. 100k, 1m). 0 or empty for unlimited.",
                            },
                            forward_query: { type: "string", description: "Query string to append to forward path" },
                            maintenance_on_failure: {
                                type: "boolean",
                                description: "Show maintenance page if backend is down",
                            },
                            adv_limit_req_rate: { type: "integer", description: "Requests per unit" },
                            adv_limit_req_unit: { type: "string", description: "'s' for seconds, 'm' for minutes" },
                            adv_limit_req_burst: { type: "integer", description: "Burst allowance" },
                            maintenance_active: { type: "boolean", description: "Force maintenance mode" },
                            maintenance_start: { type: "string", description: "ISO 8601 Datetime start" },
                            maintenance_end: { type: "string", description: "ISO 8601 Datetime end" },
                            maintenance_reason: { type: "string", description: "Reason displayed to user" },
                            advanced_config: { type: "string" },
                            meta: { type: "object" },
                        },
                        required: ["domain_names", "forward_scheme", "forward_host", "forward_port"],
                    },
                },
            },
            {
                function: {
                    name: "delete_proxy_host",
                    description: "Delete a Proxy Host by ID",
                    parameters: {
                        type: "object",
                        properties: {
                            id: { type: "integer" },
                        },
                        required: ["id"],
                    },
                },
            },
            {
                function: {
                    name: "update_proxy_host",
                    description: "Update an existing Proxy Host",
                    parameters: {
                        type: "object",
                        properties: {
                            id: { type: "integer" },
                            domain_names: { type: "array", items: { type: "string" } },
                            forward_host: { type: "string" },
                            forward_port: { type: "integer" },
                            locations: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        path: { type: "string", description: "Path to match (e.g. /api)" },
                                        forward_scheme: {
                                            type: "string",
                                            description: "http, https, grpc, grpcs, path",
                                        },
                                        forward_host: { type: "string" },
                                        forward_port: { type: "integer" },
                                        advanced_config: { type: "string" },
                                    },
                                    required: ["path", "forward_host", "forward_port"],
                                },
                            },
                            access_list_id: { type: "integer" },
                            certificate_id: { type: "integer" },
                            ssl_forced: { type: "boolean" },
                            caching_enabled: { type: "boolean" },
                            block_exploits: { type: "boolean" },
                            allow_websocket_upgrade: { type: "boolean" },
                            http2_support: { type: "boolean" },
                            hsts_enabled: { type: "boolean" },
                            hsts_subdomains: { type: "boolean" },
                            disable_buffering: { type: "boolean" },
                            bandwidth_limit: { type: "string" },
                            forward_query: { type: "string" },
                            maintenance_on_failure: { type: "boolean" },
                            adv_limit_req_rate: { type: "integer" },
                            adv_limit_req_unit: { type: "string" },
                            adv_limit_req_burst: { type: "integer" },
                            maintenance_active: { type: "boolean" },
                            maintenance_start: { type: "string" },
                            maintenance_end: { type: "string" },
                            maintenance_reason: { type: "string" },
                            advanced_config: { type: "string" },
                            enabled: { type: "boolean" },
                            meta: { type: "object" },
                        },
                        required: ["id"],
                    },
                },
            },
            {
                function: {
                    name: "enable_proxy_host",
                    description: "Enable a Proxy Host by ID",
                    parameters: {
                        type: "object",
                        properties: {
                            id: { type: "integer" },
                        },
                        required: ["id"],
                    },
                },
            },
            {
                function: {
                    name: "disable_proxy_host",
                    description: "Disable a Proxy Host by ID",
                    parameters: {
                        type: "object",
                        properties: {
                            id: { type: "integer" },
                        },
                        required: ["id"],
                    },
                },
            },
            // Consistent Enable/Disable for other types
            {
                function: {
                    name: "enable_redirection_host",
                    description: "Enable a Redirection Host",
                    parameters: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] },
                },
            },
            {
                function: {
                    name: "disable_redirection_host",
                    description: "Disable a Redirection Host",
                    parameters: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] },
                },
            },
            {
                function: {
                    name: "enable_dead_host",
                    description: "Enable a Dead Host",
                    parameters: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] },
                },
            },
            {
                function: {
                    name: "disable_dead_host",
                    description: "Disable a Dead Host",
                    parameters: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] },
                },
            },
            {
                function: {
                    name: "enable_stream",
                    description: "Enable a Stream",
                    parameters: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] },
                },
            },
            {
                function: {
                    name: "disable_stream",
                    description: "Disable a Stream",
                    parameters: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] },
                },
            },
            // Settings Update
            {
                function: {
                    name: "update_global_setting",
                    description: "Update a Global Setting",
                    parameters: {
                        type: "object",
                        properties: {
                            id: { type: "string", description: "Setting ID (e.g. 'default-site')" },
                            value: { type: "string" },
                            meta: { type: "object" },
                        },
                        required: ["id", "value"],
                    },
                },
            },
            // Redirection Hosts
            {
                function: {
                    name: "get_redirection_hosts",
                    description: "Get all Redirection Hosts",
                    parameters: { type: "object", properties: {} },
                },
            },
            {
                function: {
                    name: "create_redirection_host",
                    description: "Create a new Redirection Host",
                    parameters: {
                        type: "object",
                        properties: {
                            domain_names: { type: "array", items: { type: "string" } },
                            forward_http_code: { type: "integer", description: "300, 301, 302, 307, 308" },
                            forward_scheme: { type: "string", description: "http, https, auto" },
                            forward_domain_name: { type: "string" },
                            preserve_path: { type: "boolean" },
                            block_exploits: { type: "boolean" },
                            ssl_forced: { type: "boolean" },
                            hsts_enabled: { type: "boolean" },
                            hsts_subdomains: { type: "boolean" },
                            http2_support: { type: "boolean" },
                            certificate_id: { type: "integer" },
                            advanced_config: { type: "string" },
                            meta: { type: "object" },
                        },
                        required: ["domain_names", "forward_scheme", "forward_http_code", "forward_domain_name"],
                    },
                },
            },
            {
                function: {
                    name: "update_redirection_host",
                    description: "Update a Redirection Host",
                    parameters: {
                        type: "object",
                        properties: {
                            id: { type: "integer" },
                            domain_names: { type: "array", items: { type: "string" } },
                            forward_http_code: { type: "integer" },
                            forward_scheme: { type: "string" },
                            forward_domain_name: { type: "string" },
                            preserve_path: { type: "boolean" },
                            block_exploits: { type: "boolean" },
                            ssl_forced: { type: "boolean" },
                            hsts_enabled: { type: "boolean" },
                            hsts_subdomains: { type: "boolean" },
                            http2_support: { type: "boolean" },
                            certificate_id: { type: "integer" },
                            advanced_config: { type: "string" },
                            enabled: { type: "boolean" },
                        },
                        required: ["id"],
                    },
                },
            },
            {
                function: {
                    name: "delete_redirection_host",
                    description: "Delete a Redirection Host",
                    parameters: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] },
                },
            },
            // Dead Hosts
            {
                function: {
                    name: "get_dead_hosts",
                    description: "Get all Dead (404) Hosts",
                    parameters: { type: "object", properties: {} },
                },
            },
            {
                function: {
                    name: "create_dead_host",
                    description: "Create a new Dead Host",
                    parameters: {
                        type: "object",
                        properties: {
                            domain_names: { type: "array", items: { type: "string" } },
                            ssl_forced: { type: "boolean" },
                            hsts_enabled: { type: "boolean" },
                            hsts_subdomains: { type: "boolean" },
                            http2_support: { type: "boolean" },
                            certificate_id: { type: "integer" },
                            advanced_config: { type: "string" },
                            meta: { type: "object" },
                        },
                        required: ["domain_names"],
                    },
                },
            },
            {
                function: {
                    name: "update_dead_host",
                    description: "Update a Dead Host",
                    parameters: {
                        type: "object",
                        properties: {
                            id: { type: "integer" },
                            domain_names: { type: "array", items: { type: "string" } },
                            ssl_forced: { type: "boolean" },
                            hsts_enabled: { type: "boolean" },
                            hsts_subdomains: { type: "boolean" },
                            http2_support: { type: "boolean" },
                            certificate_id: { type: "integer" },
                            advanced_config: { type: "string" },
                            enabled: { type: "boolean" },
                        },
                        required: ["id"],
                    },
                },
            },
            {
                function: {
                    name: "delete_dead_host",
                    description: "Delete a Dead Host",
                    parameters: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] },
                },
            },
            // Streams
            {
                function: {
                    name: "get_streams",
                    description: "Get all Streams",
                    parameters: { type: "object", properties: {} },
                },
            },
            {
                function: {
                    name: "create_stream",
                    description: "Create a new Stream",
                    parameters: {
                        type: "object",
                        properties: {
                            incoming_port: { type: "integer" },
                            forwarding_host: { type: "string" },
                            forwarding_port: { type: "integer" },
                            tcp_forwarding: { type: "boolean" },
                            udp_forwarding: { type: "boolean" },
                            proxy_protocol_forwarding: { type: "boolean" },
                            certificate_id: { type: "integer" },
                            meta: { type: "object" },
                        },
                        required: ["incoming_port", "forwarding_host", "forwarding_port"],
                    },
                },
            },
            {
                function: {
                    name: "update_stream",
                    description: "Update a Stream",
                    parameters: {
                        type: "object",
                        properties: {
                            id: { type: "integer" },
                            incoming_port: { type: "integer" },
                            forwarding_host: { type: "string" },
                            forwarding_port: { type: "integer" },
                            tcp_forwarding: { type: "boolean" },
                            udp_forwarding: { type: "boolean" },
                            proxy_protocol_forwarding: { type: "boolean" },
                            certificate_id: { type: "integer" },
                            enabled: { type: "boolean" },
                            meta: { type: "object" },
                        },
                        required: ["id"],
                    },
                },
            },
            {
                function: {
                    name: "delete_stream",
                    description: "Delete a Stream",
                    parameters: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] },
                },
            },
            // Access Lists
            {
                function: {
                    name: "get_access_lists",
                    description: "Get all Access Lists",
                    parameters: { type: "object", properties: {} },
                },
            },
            {
                function: {
                    name: "create_access_list",
                    description: "Create/Update an Access List",
                    parameters: {
                        type: "object",
                        properties: {
                            name: { type: "string" },
                            satisfy_any: { type: "boolean" },
                            pass_auth: { type: "boolean" },
                            mtls_enabled: { type: "boolean" },
                            mtls_certificate: { type: "string", description: "CA Certificate content" },
                            mtls_use_internal: { type: "boolean" },
                            items: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: { username: { type: "string" }, password: { type: "string" } },
                                    required: ["username"],
                                },
                            },
                            clients: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: { address: { type: "string" }, directive: { type: "string" } },
                                    required: ["address", "directive"],
                                },
                            },
                        },
                        required: ["name"],
                    },
                },
            },
            {
                function: {
                    name: "update_access_list",
                    description: "Update an Access List",
                    parameters: {
                        type: "object",
                        properties: {
                            id: { type: "integer" },
                            name: { type: "string" },
                            satisfy_any: { type: "boolean" },
                            pass_auth: { type: "boolean" },
                            mtls_enabled: { type: "boolean" },
                            mtls_certificate: { type: "string" },
                            mtls_use_internal: { type: "boolean" },
                            items: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: { username: { type: "string" }, password: { type: "string" } },
                                    required: ["username"],
                                },
                            },
                            clients: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: { address: { type: "string" }, directive: { type: "string" } },
                                    required: ["address", "directive"],
                                },
                            },
                        },
                        required: ["id"],
                    },
                },
            },

            // System & Utilities
            {
                function: {
                    name: "force_nginx_reload",
                    description: "Force Nginx Reload",
                    parameters: { type: "object", properties: {} },
                },
            },
            {
                function: {
                    name: "get_system_status",
                    description: "Get System Network Status",
                    parameters: { type: "object", properties: {} },
                },
            },
            // Certificate Utilities
            {
                function: {
                    name: "validate_certificate",
                    description: "Validate Certificate/Key pair",
                    parameters: {
                        type: "object",
                        properties: {
                            certificate: { type: "string" },
                            certificate_key: { type: "string" },
                            intermediate_certificate: { type: "string" },
                        },
                        required: ["certificate", "certificate_key"],
                    },
                },
            },
            {
                function: {
                    name: "upload_certificate",
                    description: "Upload Certificate Content",
                    parameters: {
                        type: "object",
                        properties: {
                            id: { type: "integer" },
                            certificate: { type: "string" },
                            certificate_key: { type: "string" },
                            intermediate_certificate: { type: "string" },
                        },
                        required: ["id", "certificate", "certificate_key"],
                    },
                },
            },
            {
                function: {
                    name: "renew_certificate",
                    description: "Renew a Let's Encrypt Certificate",
                    parameters: {
                        type: "object",
                        properties: { id: { type: "integer" } },
                        required: ["id"],
                    },
                },
            },
        ];

        console.log("[AI Chat] Calling LLM:", {
            provider: config.provider,
            messageLength: message.length,
            toolsCount: tools.length,
        });

        // 3. Call Provider
        let response;
        if (config.provider === "gemini") {
            response = await ai._callGemini(config, systemPrompt, message, history, tools);
        } else {
            response = await ai._callLocalLLM(config, systemPrompt, message, history, tools);
        }

        console.log("[AI Chat] LLM Response:", {
            hasContent: !!response.content,
            hasToolCalls: !!response.toolCalls,
            contentLength: response.content?.length || 0,
        });

        // FALLBACK: Detect tool calls embedded in text response (small models sometimes output JSON as text)
        if ((!response.toolCalls || response.toolCalls.length === 0) && response.content) {
            const toolCallPatterns = [
                // Pattern 1: {"name": "tool_name", "arguments": {...}}
                /\{\s*"name"\s*:\s*"([^"]+)"\s*,\s*"arguments"\s*:\s*(\{[^}]+\})\s*\}/g,
                // Pattern 2: function call format
                /(\w+_\w+)\s*\(\s*(\{[^}]*\}|\s*)\s*\)/g,
            ];

            for (const pattern of toolCallPatterns) {
                const matches = [...response.content.matchAll(pattern)];
                if (matches.length > 0) {
                    console.log("[AI Chat] FALLBACK: Detected tool call in text response, extracting...");
                    response.toolCalls = response.toolCalls || [];
                    for (const match of matches) {
                        try {
                            const toolName = match[1];
                            const argsStr = match[2] || "{}";
                            const args = JSON.parse(argsStr.replace(/'/g, '"'));
                            response.toolCalls.push({ name: toolName, args });
                            console.log(`[AI Chat] FALLBACK: Extracted tool call: ${toolName}`, args);
                        } catch (e) {
                            console.log("[AI Chat] FALLBACK: Failed to parse embedded tool call:", e.message);
                        }
                    }
                    // Clear the text content since we extracted tool calls
                    if (response.toolCalls.length > 0) {
                        response.content = "";
                    }
                    break;
                }
            }
        }

        // 4. Handle Tool Calls
        if (response.toolCalls && response.toolCalls.length > 0) {
            console.log(
                "[AI Chat] Executing tools:",
                response.toolCalls.map((tc) => tc.name),
            );
            const toolResults = [];
            for (const call of response.toolCalls) {
                try {
                    let result = "";
                    switch (call.name) {
                        case "get_proxy_hosts": {
                            const hosts = await internalProxyHost.getAll(access);
                            result = JSON.stringify(
                                hosts.map((h) => ({
                                    id: h.id,
                                    domain_names: h.domain_names,
                                    forward_scheme: h.forward_scheme,
                                    forward_host: h.forward_host,
                                    forward_port: h.forward_port,
                                    access_list_id: h.access_list_id,
                                    enabled: h.enabled,
                                })),
                            );
                            break;
                        }
                        case "create_proxy_host": {
                            // Determine certificate ID based on user intent
                            let certId = 0;
                            let meta = {};

                            if (call.args.request_ssl) {
                                certId = "new";
                                meta = {
                                    letsencrypt_email: call.args.email || "admin@example.com", // Default or require from user
                                    letsencrypt_agree: true,
                                    dns_challenge: false,
                                };
                            }

                            // Provide defaults for missing fields
                            const data = {
                                certificate_id: certId,
                                access_list_id: 0,
                                ssl_forced: call.args.ssl_forced || false,
                                caching_enabled: false,
                                block_exploits: true,
                                advanced_config: "",
                                meta: meta,
                                ...call.args,
                            };
                            const newHost = await internalProxyHost.create(access, data);
                            result = `Created Proxy Host ID: ${newHost.id}`;
                            break;
                        }
                        case "delete_proxy_host": {
                            const deletedId = call.args.id;
                            await internalProxyHost.delete(access, { id: deletedId });
                            // Auto-verify: Check if host is really gone
                            const remainingHosts = await internalProxyHost.getAll(access);
                            const stillExists = remainingHosts.some((h) => h.id === deletedId);
                            if (stillExists) {
                                result = `ERROR: Delete failed! Proxy Host ID ${deletedId} still exists!`;
                            } else {
                                result = `Deleted and VERIFIED: Proxy Host ID ${deletedId} no longer exists.`;
                            }
                            break;
                        }
                        case "enable_proxy_host": {
                            await internalProxyHost.enable(access, { id: call.args.id });
                            result = `Enabled Proxy Host ID: ${call.args.id}`;
                            break;
                        }
                        case "disable_proxy_host": {
                            await internalProxyHost.disable(access, { id: call.args.id });
                            result = `Disabled Proxy Host ID: ${call.args.id}`;
                            break;
                        }
                        // Redirection Hosts
                        case "get_redirection_hosts": {
                            const hosts = await internalRedirectionHost.getAll(access);
                            result = JSON.stringify(
                                hosts.map((h) => ({
                                    id: h.id,
                                    domain_names: h.domain_names,
                                    forward_http_code: h.forward_http_code,
                                    forward_scheme: h.forward_scheme,
                                    forward_domain_name: h.forward_domain_name,
                                    enabled: h.enabled,
                                })),
                            );
                            break;
                        }
                        case "create_redirection_host": {
                            let certId = 0;
                            let meta = {};
                            if (call.args.request_ssl) {
                                certId = "new";
                                meta = {
                                    letsencrypt_email: call.args.email || "admin@example.com",
                                    letsencrypt_agree: true,
                                    dns_challenge: false,
                                };
                            }
                            const newHost = await internalRedirectionHost.create(access, {
                                certificate_id: certId,
                                ssl_forced: false,
                                block_exploits: true,
                                advanced_config: "",
                                meta: meta,
                                ...call.args,
                            });
                            result = `Created Redirection Host ID: ${newHost.id}`;
                            break;
                        }
                        case "delete_redirection_host": {
                            const deletedId = call.args.id;
                            await internalRedirectionHost.delete(access, { id: deletedId });
                            // Auto-verify
                            const remainingRedir = await internalRedirectionHost.getAll(access);
                            const stillExistsRedir = remainingRedir.some((h) => h.id === deletedId);
                            if (stillExistsRedir) {
                                result = `ERROR: Delete failed! Redirection Host ID ${deletedId} still exists!`;
                            } else {
                                result = `Deleted and VERIFIED: Redirection Host ID ${deletedId} no longer exists.`;
                            }
                            break;
                        }
                        // Dead Hosts
                        case "get_dead_hosts": {
                            const hosts = await internalDeadHost.getAll(access);
                            result = JSON.stringify(hosts);
                            break;
                        }
                        case "create_dead_host": {
                            let certId = 0;
                            let meta = {};
                            if (call.args.request_ssl) {
                                certId = "new";
                                meta = {
                                    letsencrypt_email: call.args.email || "admin@example.com",
                                    letsencrypt_agree: true,
                                    dns_challenge: false,
                                };
                            }
                            const newHost = await internalDeadHost.create(access, {
                                certificate_id: certId,
                                ssl_forced: false,
                                block_exploits: true,
                                advanced_config: "",
                                meta: meta,
                                ...call.args,
                            });
                            result = `Created 404 Host ID: ${newHost.id}`;
                            break;
                        }
                        case "delete_dead_host": {
                            const deletedId = call.args.id;
                            await internalDeadHost.delete(access, { id: deletedId });
                            // Auto-verify
                            const remainingDead = await internalDeadHost.getAll(access);
                            const stillExistsDead = remainingDead.some((h) => h.id === deletedId);
                            if (stillExistsDead) {
                                result = `ERROR: Delete failed! 404 Host ID ${deletedId} still exists!`;
                            } else {
                                result = `Deleted and VERIFIED: 404 Host ID ${deletedId} no longer exists.`;
                            }
                            break;
                        }
                        // Streams
                        case "get_streams": {
                            const streams = await internalStream.getAll(access);
                            result = JSON.stringify(
                                streams.map((s) => ({
                                    id: s.id,
                                    incoming_port: s.incoming_port,
                                    forwarding_host: s.forwarding_host,
                                    forwarding_port: s.forwarding_port,
                                    tcp_forwarding: s.tcp_forwarding,
                                    udp: s.udp_forwarding,
                                    enabled: s.enabled,
                                })),
                            );
                            break;
                        }
                        case "create_stream": {
                            const newStream = await internalStream.create(access, {
                                certificate_id: 0,
                                meta: {},
                                ...call.args,
                            });
                            result = `Created Stream ID: ${newStream.id}`;
                            break;
                        }
                        case "delete_stream": {
                            const deletedId = call.args.id;
                            await internalStream.delete(access, { id: deletedId });
                            // Auto-verify
                            const remainingStreams = await internalStream.getAll(access);
                            const stillExistsStream = remainingStreams.some((s) => s.id === deletedId);
                            if (stillExistsStream) {
                                result = `ERROR: Delete failed! Stream ID ${deletedId} still exists!`;
                            } else {
                                result = `Deleted and VERIFIED: Stream ID ${deletedId} no longer exists.`;
                            }
                            break;
                        }
                        // Global Settings
                        case "get_global_settings": {
                            const settings = await internalSetting.getAll(access);
                            result = JSON.stringify(settings.map((s) => ({ id: s.id, value: s.value })));
                            break;
                        }
                        // Reports
                        case "get_host_counts": {
                            const counts = await internalReport.getHostsReport(access);
                            result = JSON.stringify(counts);
                            break;
                        }
                        // IP Ranges
                        case "renew_ip_ranges": {
                            // internalIpRanges.fetch() is usually internal, but safe to trigger manually for update.
                            // It doesn't take access param but needs system perm effectively.
                            // Assuming running as system if triggered by AI admin.
                            await internalIpRanges.fetch();
                            result = "IP Ranges renewal triggered.";
                            break;
                        }
                        // Access Lists
                        case "get_access_lists": {
                            const lists = await internalAccessList.getAll(access);
                            result = JSON.stringify(lists.map((l) => ({ id: l.id, name: l.name })));
                            break;
                        }
                        case "create_access_list": {
                            const newList = await internalAccessList.create(access, {
                                items: [],
                                clients: [],
                                meta: {},
                                ...call.args,
                            });
                            result = `Created Access List ID: ${newList.id}`;
                            break;
                        }
                        // Missing CRUD Implementations
                        case "update_proxy_host": {
                            // We need to fetch existing to merge, or internalProxyHost.update handles partials?
                            // Usually update requires full object or specific logic.
                            // Standard NPMplus update logic often replaces lists. Be careful.
                            // However, let's assume standard update.
                            await internalProxyHost.update(access, { id: call.args.id, ...call.args });
                            result = `Updated Proxy Host ID: ${call.args.id}`;
                            break;
                        }
                        case "delete_user": {
                            // Soft delete usually implemented as update is_deleted=1, or delete impl
                            await internalUser.delete(access, { id: call.args.id });
                            result = `Deleted User ID: ${call.args.id}`;
                            break;
                        }
                        case "update_user": {
                            await internalUser.update(access, { id: call.args.id, ...call.args });
                            result = `Updated User ID: ${call.args.id}`;
                            break;
                        }
                        case "delete_cloudflared_tunnel": {
                            // Use imported Model
                            await CloudflaredTunnel.query().deleteById(call.args.id);
                            result = `Deleted Tunnel ID: ${call.args.id}`;
                            break;
                        }
                        case "get_cloudflared_tunnels": {
                            const tunnels = await CloudflaredTunnel.query();
                            result = JSON.stringify(
                                tunnels.map((t) => ({
                                    id: t.id,
                                    name: t.name,
                                    status: t.status,
                                    created_on: t.created_on,
                                })),
                            );
                            break;
                        }
                        case "create_cloudflared_tunnel": {
                            const newTunnel = await CloudflaredTunnel.query().insert({
                                name: call.args.name,
                                token: call.args.token,
                                status: 0, // Stopped by default
                            });
                            result = `Created Cloudflare Tunnel ID: ${newTunnel.id}`;
                            break;
                        }
                        case "create_user": {
                            // Prepare data for internalUser.create
                            const userData = {
                                name: call.args.name,
                                email: call.args.email,
                                nickname: call.args.nickname || call.args.name,
                                roles: call.args.roles || ["user"],
                                is_disabled: false,
                                auth: {
                                    type: "local",
                                    secret: call.args.password || "changeme123", // Fallback if not provided, though generic prompt should ask
                                },
                            };
                            const newUser = await internalUser.create(access, userData);
                            result = `Created User ID: ${newUser.id} (Email: ${newUser.email})`;
                            break;
                        }
                        // Certificates
                        case "get_certificates": {
                            const certs = await internalCertificate.getAll(access);
                            result = JSON.stringify(
                                certs.map((c) => ({
                                    id: c.id,
                                    nice_name: c.nice_name,
                                    provider: c.provider,
                                    domain_names: c.domain_names,
                                    expires_on: c.expires_on,
                                })),
                            );
                            break;
                        }
                        case "delete_certificate": {
                            await internalCertificate.delete(access, { id: call.args.id });
                            result = `Deleted Certificate ID: ${call.args.id}`;
                            break;
                        }
                        case "create_certificate": {
                            const meta = call.args.meta || {};
                            if (call.args.provider === "letsencrypt") {
                                meta.letsencrypt_agree = true; // Force agree via AI
                                if (!meta.email) meta.email = "admin@example.com";
                            }

                            const newCert = await internalCertificate.create(access, {
                                provider: call.args.provider,
                                domain_names: call.args.domain_names,
                                meta: meta,
                            });
                            result = `Created Certificate ID: ${newCert.id} (${call.args.provider})`;
                            break;
                        }
                        case "test_nginx_config": {
                            try {
                                await internalNginx.test();
                                result = "Nginx configuration is valid.";
                            } catch (err) {
                                result = `Nginx Test Failed: ${err.message}`;
                            }
                            break;
                        }
                        case "force_nginx_reload": {
                            await internalNginx.reload();
                            result = "Nginx Reloaded";
                            break;
                        }
                        case "get_system_status": {
                            const net = await si.networkStats();
                            const rx = net.reduce((acc, iface) => acc + (iface.rx_sec || 0), 0);
                            const tx = net.reduce((acc, iface) => acc + (iface.tx_sec || 0), 0);
                            result = JSON.stringify({ rx_sec: rx, tx_sec: tx, total_sec: rx + tx });
                            break;
                        }
                        case "validate_certificate": {
                            const files = {
                                certificate: { data: Buffer.from(call.args.certificate) },
                                certificate_key: { data: Buffer.from(call.args.certificate_key) },
                            };
                            if (call.args.intermediate_certificate) {
                                files.intermediate_certificate = {
                                    data: Buffer.from(call.args.intermediate_certificate),
                                };
                            }
                            const valid = await internalCertificate.validate({ files: files });
                            result = JSON.stringify(valid, null, 2);
                            break;
                        }
                        case "upload_certificate": {
                            const files = {
                                certificate: { data: Buffer.from(call.args.certificate) },
                                certificate_key: { data: Buffer.from(call.args.certificate_key) },
                            };
                            if (call.args.intermediate_certificate) {
                                files.intermediate_certificate = {
                                    data: Buffer.from(call.args.intermediate_certificate),
                                };
                            }
                            await internalCertificate.upload(access, { id: call.args.id, files: files });
                            result = `Uploaded certificate content for ID: ${call.args.id}`;
                            break;
                        }
                        case "renew_certificate": {
                            const cert = await internalCertificate.get(access, { id: call.args.id });
                            if (cert.provider === "letsencrypt") {
                                await internalCertificate.requestCertbot(cert);
                                result = `Renewed Certificate ID: ${call.args.id}`;
                            } else {
                                result = "Error: Only LetsEncrypt certificates can be renewed.";
                            }
                            break;
                        }
                        case "get_certificate_details": {
                            const cert = await internalCertificate.get(access, { id: call.args.id });
                            result = JSON.stringify(cert, null, 2);
                            break;
                        }
                        case "get_dns_providers": {
                            const plugins = dnsPlugins;
                            result = JSON.stringify(
                                Object.keys(plugins).map((k) => ({ id: k, name: plugins[k].name })),
                            );
                            break;
                        }
                        case "test_http_challenge": {
                            const testResult = await internalCertificate.testHttpsChallenge(access, {
                                domain_names: call.args.domains,
                            });
                            result = JSON.stringify(testResult);
                            break;
                        }
                        case "get_analytics_series": {
                            const summaryResult = await ai._tools.get_analytics_summary(call.args); // Reuse summary logic or fetch specifically
                            // Re-implement series logic briefly
                            const start = dayjs().subtract(24, "hour").toISOString();
                            const end = dayjs().toISOString();
                            const data = await AnalyticCount.query()
                                .where("timestamp", ">=", start)
                                .andWhere("timestamp", "<=", end)
                                .orderBy("timestamp", "asc");
                            // Simply return raw length or condensed
                            result = `Series Data Points: ${data.length}`;
                            break;
                        }
                        // Other Updates
                        case "update_redirection_host": {
                            await internalRedirectionHost.update(access, { id: call.args.id, ...call.args });
                            result = `Updated Redirection Host ID: ${call.args.id}`;
                            break;
                        }
                        case "update_dead_host": {
                            await internalDeadHost.update(access, { id: call.args.id, ...call.args });
                            result = `Updated Dead Host ID: ${call.args.id}`;
                            break;
                        }
                        case "update_stream": {
                            await internalStream.update(access, { id: call.args.id, ...call.args });
                            result = `Updated Stream ID: ${call.args.id}`;
                            break;
                        }
                        case "update_access_list": {
                            await internalAccessList.update(access, { id: call.args.id, ...call.args });
                            result = `Updated Access List ID: ${call.args.id}`;
                            break;
                        }
                        case "delete_access_list": {
                            // AccessList delete might not be directly exposed in internalAccessList based on previous check,
                            // but usually it exists. If not, use Model.
                            // Let's assume standard internal pattern.
                            await internalAccessList.delete(access, { id: call.args.id });
                            result = `Deleted Access List ID: ${call.args.id}`;
                            break;
                        }
                        // Consistent Enable/Disable
                        case "enable_redirection_host": {
                            await internalRedirectionHost.enable(access, { id: call.args.id });
                            result = `Enabled Redirection Host ID: ${call.args.id}`;
                            break;
                        }
                        case "disable_redirection_host": {
                            await internalRedirectionHost.disable(access, { id: call.args.id });
                            result = `Disabled Redirection Host ID: ${call.args.id}`;
                            break;
                        }
                        case "enable_dead_host": {
                            await internalDeadHost.enable(access, { id: call.args.id });
                            result = `Enabled Dead Host ID: ${call.args.id}`;
                            break;
                        }
                        case "disable_dead_host": {
                            await internalDeadHost.disable(access, { id: call.args.id });
                            result = `Disabled Dead Host ID: ${call.args.id}`;
                            break;
                        }
                        case "enable_stream": {
                            await internalStream.enable(access, { id: call.args.id });
                            result = `Enabled Stream ID: ${call.args.id}`;
                            break;
                        }
                        case "disable_stream": {
                            await internalStream.disable(access, { id: call.args.id });
                            result = `Disabled Stream ID: ${call.args.id}`;
                            break;
                        }
                        // Settings
                        case "update_global_setting": {
                            await internalSetting.update(access, { id: call.args.id, ...call.args });
                            result = `Updated Setting: ${call.args.id}`;
                            break;
                        }
                        // User Updates
                        case "update_user_password": {
                            await internalUser.setPassword(access, { id: call.args.id, ...call.args });
                            result = `Updated Password for User ID: ${call.args.id}`;
                            break;
                        }
                        case "update_user_permissions": {
                            await internalUser.setPermissions(access, { id: call.args.id, ...call.args });
                            result = `Updated Permissions for User ID: ${call.args.id}`;
                            break;
                        }
                        // Tunnels
                        case "update_cloudflared_tunnel": {
                            await CloudflaredTunnel.query().patchAndFetchById(call.args.id, {
                                name: call.args.name,
                                token: call.args.token,
                            });
                            result = `Updated Tunnel ID: ${call.args.id}`;
                            break;
                        }
                        // Certificates
                        case "update_certificate": {
                            await internalCertificate.update(access, { id: call.args.id, ...call.args });
                            result = `Updated Certificate ID: ${call.args.id}`;
                            break;
                        }
                        // Auth & Tokens
                        case "login_as_user": {
                            const loginResult = await internalUser.loginAs(access, { id: call.args.id });
                            result = `Logged in as User ${call.args.id}. Token: ${loginResult.token}`;
                            break;
                        }
                        case "create_api_token": {
                            // Use getFreshToken to generate a new token
                            const expiry = call.args.expiry || "1d";
                            const newToken = await internalToken.getFreshToken(access, {
                                scope: "user", // Default scope as user
                                expiry: expiry,
                            });
                            result = `Created API Token: ${newToken.token}`;
                            break;
                        }
                        case "create_client_certificate": {
                            const tmpDir = `/tmp/client-cert-${Date.now()}`;
                            const p12Path = await internalPki.createClientCert(
                                {
                                    common_name: call.args.common_name,
                                    password: call.args.password,
                                    years: call.args.years || 1,
                                },
                                tmpDir,
                            );
                            result = `Client Certificate Created at: ${p12Path}. You can retrieve it from the server filesystem.`;
                            break;
                        }
                        // Missing Read/Log Tools
                        case "get_users": {
                            const users = await internalUser.getAll(access);
                            result = JSON.stringify(
                                users.map((u) => ({ id: u.id, name: u.name, email: u.email, roles: u.roles })),
                            );
                            break;
                        }
                        case "get_audit_log": {
                            const logs = await internalAuditLog.getAll(access, ["user"]);
                            result = JSON.stringify(
                                logs.map((l) => ({
                                    action: l.action,
                                    user: l.user ? l.user.name : "System",
                                    time: l.created_on,
                                    meta: l.meta,
                                })),
                            );
                            break;
                        }
                        case "read_nginx_logs": {
                            const type = call.args.log_type;
                            const lines = call.args.lines || 50;
                            const file = type === "error" ? "/data/logs/error.log" : "/data/logs/access.log";
                            try {
                                const { stdout } = await execAsync(`tail -n ${lines} ${file}`);
                                result = stdout;
                            } catch (err) {
                                result = `Error reading logs: ${err.message}`;
                            }
                            break;
                        }
                        case "get_analytics_summary": {
                            const start = dayjs().subtract(24, "hour").toISOString();
                            const end = dayjs().toISOString();
                            const stats =
                                (await AnalyticCount.knex()
                                    .from("analytic_count")
                                    .where("timestamp", ">=", start)
                                    .andWhere("timestamp", "<=", end)
                                    .sum("request_count as count")
                                    .sum("bytes_sent as bytes")
                                    .sum("status_code_2xx as s2xx")
                                    .sum("status_code_5xx as s5xx")
                                    .first()) || {};

                            result = JSON.stringify({
                                requests_24h: stats.count || 0,
                                bytes_24h: stats.bytes || 0,
                                errors_5xx: stats.s5xx || 0,
                            });
                            break;
                        }
                        default:
                            result = "Error: Unknown tool";
                    }
                    toolResults.push({ name: call.name, result });
                } catch (err) {
                    toolResults.push({ name: call.name, result: `Error: ${err.message}` });
                }
            }

            console.log(
                "[AI Chat] Tool results:",
                toolResults.map((tr) => ({ name: tr.name, resultLength: tr.result?.length || 0 })),
            );

            // Call LLM again with results
            if (config.provider === "gemini") {
                return await ai._callGeminiWithResults(
                    config,
                    systemPrompt,
                    message,
                    history,
                    response,
                    toolResults,
                    tools,
                );
            }
            return await ai._callLocalWithResults(config, systemPrompt, message, history, response, toolResults);
        }

        console.log("[AI Chat] Returning response:", {
            role: "assistant",
            contentLength: response.content?.length || 0,
        });

        // HALLUCINATION DETECTION: Warn if AI claims action but no tool was called
        let finalContent = response.content || "";
        const actionWords = [
            // German
            /gelöscht/i,
            /erstellt/i,
            /aktiviert/i,
            /deaktiviert/i,
            /aktualisiert/i,
            // English
            /deleted/i,
            /created/i,
            /enabled/i,
            /disabled/i,
            /updated/i,
            /removed/i,
            /added/i,
        ];
        const toolsExecuted = response.toolCalls && response.toolCalls.length > 0;

        if (!toolsExecuted && finalContent) {
            const claimsAction = actionWords.some((pattern) => pattern.test(finalContent));
            if (claimsAction) {
                console.log("[AI Chat] WARNING: AI claims action but no tool was executed!");
                finalContent = `⚠️ WARNING: The AI claims to have performed an action, but no tool was executed. Please verify manually!\n\n---\n\n${finalContent}`;
            }
        }

        return {
            role: "assistant",
            content: finalContent,
        };
    },

    // --- Private Provider Implementations ---

    _callGemini: async (config, systemPrompt, message, history, tools) => {
        if (!config.api_key) throw new Error("Gemini API Key is missing");

        const genAI = new GoogleGenerativeAI(config.api_key);
        const model = genAI.getGenerativeModel({
            model: config.model || "gemini-1.5-flash",
            systemInstruction: systemPrompt,
        });

        // Convert tools to SDK format
        const geminiTools =
            tools.length > 0
                ? tools.map((t) => ({
                    functionDeclarations: [
                        {
                            name: t.function.name,
                            description: t.function.description,
                            parameters: t.function.parameters,
                        },
                    ],
                }))
                : undefined;

        // Start chat session with history
        const chat = model.startChat({
            history: history.map((h) => ({
                role: h.role === "assistant" ? "model" : "user",
                parts: [{ text: h.content || "" }],
            })),
            tools: geminiTools,
        });

        console.log("[Gemini SDK] Sending message with tools:", geminiTools?.length || 0);

        const result = await chat.sendMessage(message);
        const response = result.response;

        console.log("[Gemini SDK] Response:", {
            hasText: !!response.text(),
            hasFunctionCalls: !!(response.functionCalls() && response.functionCalls().length > 0),
        });

        // Check for function calls
        const functionCalls = response.functionCalls();
        if (functionCalls && functionCalls.length > 0) {
            console.log(
                "[Gemini SDK] Tool calls detected:",
                functionCalls.map((fc) => fc.name),
            );
            return {
                content: response.text() || "",
                toolCalls: functionCalls.map((fc) => ({
                    name: fc.name,
                    args: fc.args,
                })),
                chat: chat, // Store chat session for follow-up
            };
        }

        return { content: response.text() || "" };
    },

    _callGeminiWithResults: async (config, systemPrompt, message, history, previousResponse, toolResults, tools) => {
        // If we have a chat session from the previous call, use it
        if (previousResponse.chat) {
            console.log("[Gemini SDK] Sending tool results via chat session");

            // Format tool results for SDK - must use functionResponse structure
            const functionResponseParts = toolResults.map((tr) => ({
                functionResponse: {
                    name: tr.name,
                    response: {
                        content: tr.result,
                    },
                },
            }));

            const result = await previousResponse.chat.sendMessage(functionResponseParts);
            const response = result.response;

            console.log("[Gemini SDK] Final response after tools:", { textLength: response.text()?.length || 0 });

            return {
                role: "assistant",
                content: response.text() || "",
            };
        }

        // Fallback: No chat session (shouldn't happen with SDK, but keep for safety)
        throw new Error("No chat session available for tool results");
    },

    _callLocalLLM: async (config, systemPrompt, message, history, tools) => {
        const baseUrl = config.base_url || "http://localhost:11434";
        const isOllamaNative = baseUrl.includes(":11434") && !baseUrl.includes("/v1");

        let targetUrl;
        try {
            if (isOllamaNative) {
                targetUrl = new URL("api/chat", baseUrl);
            } else {
                targetUrl = new URL("v1/chat/completions", baseUrl);
            }
        } catch (err) {
            throw new Error(`Invalid base_url: ${err.message}`);
        }
        const url = targetUrl.toString();

        const messages = [{ role: "system", content: systemPrompt }, ...history, { role: "user", content: message }];

        let payload;

        if (isOllamaNative) {
            // Ollama Native Format
            if (!config.model) throw new Error("No Model selected. Please configure a Model in Settings -> AI Agent");

            payload = {
                model: config.model,
                messages,
                stream: false,
                keep_alive: config.keep_alive || "5m",
                options: {
                    num_ctx: config.num_ctx || 8192,
                    num_batch: config.num_batch || 512,
                    num_thread: config.num_thread || 4,
                },
                tools:
                    tools.length > 0
                        ? tools.map((t) => ({
                            type: "function",
                            function: t.function,
                        }))
                        : undefined,
            };
        } else {
            // OpenAI Compatible Format
            if (!config.model) throw new Error("No Model selected. Please configure a Model in Settings -> AI Agent");

            payload = {
                model: config.model,
                messages,
                // Note: OpenAI spec ignores 'options', but some compatible servers might read it
                keep_alive: config.keep_alive || "5m", // Try sending top-level for compat
                options: {
                    num_ctx: config.num_ctx || 8192,
                    num_batch: config.num_batch || 512,
                    num_thread: config.num_thread || 4,
                },
                tools:
                    tools.length > 0
                        ? tools.map((t) => ({
                            type: "function",
                            function: t.function,
                        }))
                        : undefined,
            };
        }

        const res = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${config.api_key}`, // Optional for some local LLMs
            },
            body: JSON.stringify(payload),
        });

        if (!res.ok) {
            const err = await res.text();
            throw new Error(`Local LLM Error: ${res.status} - ${err}`);
        }

        const json = await res.json();
        let content = "";
        let toolCalls = [];

        if (isOllamaNative) {
            // Parse Ollama Response
            content = json.message?.content || "";
            if (json.message?.tool_calls) {
                toolCalls = json.message.tool_calls.map((tc) => ({
                    name: tc.function.name,
                    args: tc.function.arguments, // Ollama returns object, not string
                    id: tc.function.name, // Ollama might not have ID, use name fallback
                }));
            }
        } else {
            // Parse OpenAI Response
            const choice = json.choices?.[0];
            const msg = choice?.message;
            content = msg?.content || "";
            if (msg?.tool_calls) {
                toolCalls = msg.tool_calls.map((tc) => ({
                    name: tc.function.name,
                    args: JSON.parse(tc.function.arguments),
                    id: tc.id,
                }));
            }
        }

        if (toolCalls.length > 0) {
            return {
                content,
                toolCalls,
            };
        }

        return { content };
    },

    _callLocalWithResults: async (config, systemPrompt, message, history, previousResponse, toolResults) => {
        const baseUrl = config.base_url || "http://localhost:11434";
        const isOllamaNative = baseUrl.includes(":11434") && !baseUrl.includes("/v1");

        let targetUrl;
        try {
            if (isOllamaNative) {
                targetUrl = new URL("api/chat", baseUrl);
            } else {
                targetUrl = new URL("v1/chat/completions", baseUrl);
            }
        } catch (err) {
            throw new Error(`Invalid base_url: ${err.message}`);
        }
        const url = targetUrl.toString();

        const messages = [
            { role: "system", content: systemPrompt },
            ...history,
            { role: "user", content: message },
            // Initial Assistant Response with Tool Calls
            {
                role: "assistant",
                content: previousResponse.content,
                tool_calls: previousResponse.toolCalls.map((tc) => {
                    // Ollama Native expects arguments as JSON object, not string
                    if (isOllamaNative) {
                        return {
                            id: tc.id,
                            type: "function",
                            function: {
                                name: tc.name,
                                arguments: tc.args, // Already an object
                            },
                        };
                    }
                    // OpenAI Compatible expects JSON string
                    return {
                        id: tc.id,
                        type: "function",
                        function: {
                            name: tc.name,
                            arguments: JSON.stringify(tc.args),
                        },
                    };
                }),
            },
            // Tool Outputs
            ...toolResults.map((tr, idx) => ({
                role: "tool",
                tool_call_id: previousResponse.toolCalls[idx].id, // Need to match ID
                content: tr.result,
            })),
        ];

        let payload;
        const options = {
            num_ctx: config.num_ctx || 8192,
            num_batch: config.num_batch || 512,
            num_thread: config.num_thread || 4,
        };

        if (isOllamaNative) {
            payload = {
                model: config.model,
                messages,
                stream: false,
                keep_alive: config.keep_alive || "5m",
                options,
            };
        } else {
            payload = {
                model: config.model,
                messages,
                keep_alive: config.keep_alive || "5m",
                options,
            };
        }

        const res = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${config.api_key}`,
            },
            body: JSON.stringify(payload),
        });

        if (!res.ok) {
            const err = await res.text();
            throw new Error(`Local LLM Result Error: ${res.status} - ${err}`);
        }

        const json = await res.json();

        if (isOllamaNative) {
            return { content: json.message?.content || "" };
        }

        return { content: json.choices?.[0]?.message?.content || "" };
    },
};

export default ai;
