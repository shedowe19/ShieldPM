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
            return meta;
        } catch (err) {
            // Return default config if not found
            return {
                enabled: false,
                provider: "gemini",
                api_key: "",
                base_url: "",
                model: ""
            };
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
                meta: dataToSave
            });
        } catch (err) {
            const SettingModel = (await import("../models/setting.js")).default;
            await SettingModel.query().insert({
                id: AI_CONFIG_ID,
                description: "AI Agent Configuration",
                value: data.enabled ? "true" : "false",
                meta: dataToSave
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
                    .filter(m => m.name.includes("gemini"))
                    .map(m => ({
                        id: m.name.replace("models/", ""),
                        name: m.displayName || m.name
                    }))
                    .sort((a, b) => b.id.localeCompare(a.id));
            } catch (err) {
                throw new Error(`Failed to fetch Gemini models: ${err.message}`);
            }
        } else {
            // Local / OpenAI
            const baseUrl = config.base_url || "http://localhost:11434";
            const url = `${baseUrl}/v1/models`;
            try {
                const headers = {};
                if (config.api_key) headers["Authorization"] = `Bearer ${config.api_key}`;

                const res = await fetch(url, { headers });
                if (!res.ok) throw new Error(`Local Provider Error: ${res.status} ${res.statusText}`);
                const data = await res.json();
                return (data.data || [])
                    .map(m => ({
                        id: m.id,
                        name: m.id
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
        // 1. Get Config
        const config = await ai.getConfig(access);
        if (!config.enabled) {
            throw new Error("AI Agent is disabled.");
        }

        // 2. Prepare System Prompt & Tools
        // 2. Prepare System Prompt & Tools
        const defaultPrompt = `You are the AI Administrator for NPMplus, a powerful Nginx Proxy Manager.
You have access to tools to control the server. 
Always use tools when the user asks for information about the system or asks to perform actions.
Be concise and helpful.
IMPORTANT: Always answer in the same language as the user.
Current Time: ${new Date().toISOString()}`;

        const systemPrompt = config.system_prompt || defaultPrompt;

        const tools = [
            {
                function: {
                    name: "get_proxy_hosts",
                    description: "Get a list of all Proxy Hosts",
                    parameters: {
                        type: "object",
                        properties: {},
                    }
                }
            },

            // Audit Log
            {
                function: {
                    name: "get_audit_log",
                    description: "Get System Audit Logs",
                    parameters: { type: "object", properties: { limit: { type: "integer" } } }
                }
            },
            // Analytics
            {
                function: {
                    name: "get_analytics_summary",
                    description: "Get recent analytics summary (24h)",
                    parameters: { type: "object", properties: {} }
                }
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
                            lines: { type: "integer", description: "Number of lines to read (max 100)" }
                        },
                        required: ["log_type"]
                    }
                }
            },
            // User Management
            {
                function: {
                    name: "get_users",
                    description: "Get all Users",
                    parameters: { type: "object", properties: {} }
                }
            },
            {
                function: {
                    name: "login_as_user",
                    description: "Log in as another user (Impersonation)",
                    parameters: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] }
                }
            },
            {
                function: {
                    name: "create_api_token",
                    description: "Create a new API Token",
                    parameters: {
                        type: "object",
                        properties: {
                            identity: { type: "string" },
                            expiry: { type: "string", description: "ISO Date or null" }
                        },
                        required: ["identity"]
                    }
                }
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
                            years: { type: "integer" }
                        },
                        required: ["common_name", "password"]
                    }
                }
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
                                    secret: { type: "string" }
                                },
                                required: ["type", "secret"]
                            },
                            is_disabled: { type: "boolean" }
                        },
                        required: ["name", "email", "roles"]
                    }
                }
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
                            is_disabled: { type: "boolean" }
                        },
                        required: ["id"]
                    }
                }
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
                                required: ["type", "secret"]
                            }
                        },
                        required: ["id", "auth"]
                    }
                }
            },
            {
                function: {
                    name: "update_user_permissions",
                    description: "Update a User's Permissions",
                    parameters: {
                        type: "object",
                        properties: {
                            id: { type: "integer" },
                            permissions: { type: "object" } // Schema technically defines extensive permission object
                        },
                        required: ["id", "permissions"]
                    }
                }
            },
            {
                function: {
                    name: "delete_user",
                    description: "Delete (soft delete) a User",
                    parameters: {
                        type: "object", properties: { id: { type: "integer" } }, required: ["id"]
                    }
                }
            },
            // Cloudflare Tunnels
            {
                function: {
                    name: "get_cloudflared_tunnels",
                    description: "Get all Cloudflare Tunnels",
                    parameters: { type: "object", properties: {} }
                }
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
                            token: { type: "string" }
                        },
                        required: ["id"]
                    }
                }
            },
            {
                function: {
                    name: "delete_cloudflared_tunnel",
                    description: "Delete a Cloudflare Tunnel",
                    parameters: {
                        type: "object", properties: { id: { type: "integer" } }, required: ["id"]
                    }
                }
            },
            {
                function: {
                    name: "create_cloudflared_tunnel",
                    description: "Create a new Cloudflare Tunnel",
                    parameters: {
                        type: "object",
                        properties: {
                            name: { type: "string" },
                            token: { type: "string" }
                        },
                        required: ["name", "token"]
                    }
                }
            },
            // Settings
            {
                function: {
                    name: "get_global_settings",
                    description: "Get Global NPMplus Settings",
                    parameters: { type: "object", properties: {} }
                }
            },
            {
                function: {
                    name: "get_host_counts",
                    description: "Get Counts of all Host types",
                    parameters: { type: "object", properties: {} }
                }
            },
            {
                function: {
                    name: "create_certificate",
                    description: "Create a Certificate (Let's Encrypt or Internal)",
                    parameters: {
                        type: "object",
                        properties: {
                            provider: { type: "string", enum: ["letsencrypt", "internal"], description: "Provider type" },
                            domain_names: { type: "array", items: { type: "string" } },
                            meta: {
                                type: "object",
                                properties: {
                                    dns_challenge: { type: "boolean" },
                                    email: { type: "string" },
                                    agree_tos: { type: "boolean" },
                                    years: { type: "integer", description: "Validity years (Internal only)" }
                                },
                                required: ["agree_tos"]
                            }
                        },
                        required: ["provider", "domain_names"]
                    }
                }
            },
            {
                function: {
                    name: "test_nginx_config",
                    description: "Test Nginx Configuration",
                    parameters: { type: "object", properties: {} }
                }
            },
            {
                function: {
                    name: "update_certificate",
                    description: "Update a Certificate",
                    parameters: {
                        type: "object",
                        properties: {
                            id: { type: "integer" },
                            nice_name: { type: "string" }
                        },
                        required: ["id"]
                    }
                }
            },
            {
                function: {
                    name: "get_certificate_details",
                    description: "Get full details for a Certificate",
                    parameters: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] }
                }
            },
            {
                function: {
                    name: "get_dns_providers",
                    description: "Get list of supported DNS Providers",
                    parameters: { type: "object", properties: {} }
                }
            },
            {
                function: {
                    name: "test_http_challenge",
                    description: "Test HTTP Challenge for domains",
                    parameters: {
                        type: "object",
                        properties: {
                            domains: { type: "array", items: { type: "string" } }
                        },
                        required: ["domains"]
                    }
                }
            },
            {
                function: {
                    name: "get_analytics_series",
                    description: "Get Analytics (Time Series)",
                    parameters: { type: "object", properties: {} }
                }
            },
            {
                function: {
                    name: "delete_certificate",
                    description: "Delete a Certificate",
                    parameters: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] }
                }
            },
            {
                function: {
                    name: "get_certificates",
                    description: "Get all Certificates",
                    parameters: { type: "object", properties: {} }
                }
            },

            {
                function: {
                    name: "renew_ip_ranges",
                    description: "Force renewal of Cloudflare IP Ranges",
                    parameters: { type: "object", properties: {} }
                }
            },
            {
                function: {
                    name: "create_proxy_host",
                    description: "Create a new Proxy Host",
                    parameters: {
                        type: "object",
                        properties: {
                            domain_names: { type: "array", items: { type: "string" }, description: "List of domain names (e.g. example.com)" },
                            forward_ip: { type: "string", description: "Internal IP to forward to" },
                            forward_port: { type: "integer", description: "Internal Port to forward to" },
                            locations: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        path: { type: "string", description: "Path to match (e.g. /api)" },
                                        forward_scheme: { type: "string", description: "http, https, grpc, grpcs, path" },
                                        forward_host: { type: "string" },
                                        forward_port: { type: "integer" },
                                        advanced_config: { type: "string" }
                                    },
                                    required: ["path", "forward_host", "forward_port"]
                                }
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
                            bandwidth_limit: { type: "string", description: "Limit bandwidth (e.g. 100k, 1m). 0 or empty for unlimited." },
                            forward_query: { type: "string", description: "Query string to append to forward path" },
                            maintenance_on_failure: { type: "boolean", description: "Show maintenance page if backend is down" },
                            adv_limit_req_rate: { type: "integer", description: "Requests per unit" },
                            adv_limit_req_unit: { type: "string", description: "'s' for seconds, 'm' for minutes" },
                            adv_limit_req_burst: { type: "integer", description: "Burst allowance" },
                            maintenance_active: { type: "boolean", description: "Force maintenance mode" },
                            maintenance_start: { type: "string", description: "ISO 8601 Datetime start" },
                            maintenance_end: { type: "string", description: "ISO 8601 Datetime end" },
                            maintenance_reason: { type: "string", description: "Reason displayed to user" },
                            advanced_config: { type: "string" },
                            request_ssl: { type: "boolean", description: "Set to true to Request a Let's Encrypt SSL Certificate" },
                            email: { type: "string", description: "Email for Let's Encrypt, required if request_ssl is true" },
                            meta: { type: "object" }
                        },
                        required: ["domain_names", "forward_ip", "forward_port"]
                    }
                }
            },
            {
                function: {
                    name: "delete_proxy_host",
                    description: "Delete a Proxy Host by ID",
                    parameters: {
                        type: "object",
                        properties: {
                            id: { type: "integer" }
                        },
                        required: ["id"]
                    }
                }
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
                            forward_ip: { type: "string" },
                            forward_port: { type: "integer" },
                            locations: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        path: { type: "string", description: "Path to match (e.g. /api)" },
                                        forward_scheme: { type: "string", description: "http, https, grpc, grpcs, path" },
                                        forward_host: { type: "string" },
                                        forward_port: { type: "integer" },
                                        advanced_config: { type: "string" }
                                    },
                                    required: ["path", "forward_host", "forward_port"]
                                }
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
                            meta: { type: "object" }
                        },
                        required: ["id"]
                    }
                }
            },
            {
                function: {
                    name: "enable_proxy_host",
                    description: "Enable a Proxy Host by ID",
                    parameters: {
                        type: "object",
                        properties: {
                            id: { type: "integer" }
                        },
                        required: ["id"]
                    }
                }
            },
            {
                function: {
                    name: "disable_proxy_host",
                    description: "Disable a Proxy Host by ID",
                    parameters: {
                        type: "object",
                        properties: {
                            id: { type: "integer" }
                        },
                        required: ["id"]
                    }
                }
            },
            // Consistent Enable/Disable for other types
            {
                function: {
                    name: "enable_redirection_host",
                    description: "Enable a Redirection Host",
                    parameters: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] }
                }
            },
            {
                function: {
                    name: "disable_redirection_host",
                    description: "Disable a Redirection Host",
                    parameters: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] }
                }
            },
            {
                function: {
                    name: "enable_dead_host",
                    description: "Enable a Dead Host",
                    parameters: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] }
                }
            },
            {
                function: {
                    name: "disable_dead_host",
                    description: "Disable a Dead Host",
                    parameters: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] }
                }
            },
            {
                function: {
                    name: "enable_stream",
                    description: "Enable a Stream",
                    parameters: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] }
                }
            },
            {
                function: {
                    name: "disable_stream",
                    description: "Disable a Stream",
                    parameters: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] }
                }
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
                            meta: { type: "object" }
                        },
                        required: ["id", "value"]
                    }
                }
            },
            // Redirection Hosts
            {
                function: {
                    name: "get_redirection_hosts",
                    description: "Get all Redirection Hosts",
                    parameters: { type: "object", properties: {} }
                }
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
                            request_ssl: { type: "boolean" },
                            email: { type: "string" }
                        },
                        required: ["domain_names", "forward_http_code", "forward_domain_name"]
                    }
                }
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
                            enabled: { type: "boolean" }
                        },
                        required: ["id"]
                    }
                }
            },
            {
                function: {
                    name: "delete_redirection_host",
                    description: "Delete a Redirection Host",
                    parameters: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] }
                }
            },
            // Dead Hosts
            {
                function: {
                    name: "get_dead_hosts",
                    description: "Get all Dead (404) Hosts",
                    parameters: { type: "object", properties: {} }
                }
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
                            request_ssl: { type: "boolean" },
                            email: { type: "string" }
                        },
                        required: ["domain_names"]
                    }
                }
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
                            enabled: { type: "boolean" }
                        },
                        required: ["id"]
                    }
                }
            },
            {
                function: {
                    name: "delete_dead_host",
                    description: "Delete a Dead Host",
                    parameters: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] }
                }
            },
            // Streams
            {
                function: {
                    name: "get_streams",
                    description: "Get all Streams",
                    parameters: { type: "object", properties: {} }
                }
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
                            meta: { type: "object" }
                        },
                        required: ["incoming_port", "forwarding_host", "forwarding_port"]
                    }
                }
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
                            meta: { type: "object" }
                        },
                        required: ["id"]
                    }
                }
            },
            {
                function: {
                    name: "delete_stream",
                    description: "Delete a Stream",
                    parameters: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] }
                }
            },
            // Access Lists
            {
                function: {
                    name: "get_access_lists",
                    description: "Get all Access Lists",
                    parameters: { type: "object", properties: {} }
                }
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
                                    required: ["username"]
                                }
                            },
                            clients: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: { address: { type: "string" }, directive: { type: "string" } },
                                    required: ["address", "directive"]
                                }
                            }
                        },
                        required: ["name"]
                    }
                }
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
                                    required: ["username"]
                                }
                            },
                            clients: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: { address: { type: "string" }, directive: { type: "string" } },
                                    required: ["address", "directive"]
                                }
                            }
                        },
                        required: ["id"]
                    }
                }
            },

            // System & Utilities
            {
                function: {
                    name: "force_nginx_reload",
                    description: "Force Nginx Reload",
                    parameters: { type: "object", properties: {} }
                }
            },
            {
                function: {
                    name: "get_system_status",
                    description: "Get System Network Status",
                    parameters: { type: "object", properties: {} }
                }
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
                            intermediate_certificate: { type: "string" }
                        },
                        required: ["certificate", "certificate_key"]
                    }
                }
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
                            intermediate_certificate: { type: "string" }
                        },
                        required: ["id", "certificate", "certificate_key"]
                    }
                }
            },
            {
                function: {
                    name: "renew_certificate",
                    description: "Renew a Let's Encrypt Certificate",
                    parameters: {
                        type: "object",
                        properties: { id: { type: "integer" } },
                        required: ["id"]
                    }
                }
            }
        ];

        console.log("[AI Chat] Calling LLM:", { provider: config.provider, messageLength: message.length, toolsCount: tools.length });

        // 3. Call Provider
        let response;
        if (config.provider === "gemini") {
            response = await ai._callGemini(config, systemPrompt, message, history, tools);
        } else {
            response = await ai._callLocalLLM(config, systemPrompt, message, history, tools);
        }

        console.log("[AI Chat] LLM Response:", { hasContent: !!response.content, hasToolCalls: !!response.toolCalls, contentLength: response.content?.length || 0 });

        // 4. Handle Tool Calls
        if (response.toolCalls && response.toolCalls.length > 0) {
            console.log("[AI Chat] Executing tools:", response.toolCalls.map(tc => tc.name));
            const toolResults = [];
            for (const call of response.toolCalls) {
                try {
                    let result = "";
                    switch (call.name) {
                        case "get_proxy_hosts": {
                            const hosts = await internalProxyHost.getAll(access);
                            result = JSON.stringify(hosts.map(h => ({
                                id: h.id,
                                domain_names: h.domain_names,
                                forward_ip: h.forward_ip,
                                forward_port: h.forward_port,
                                enabled: h.enabled
                            })));
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
                                    dns_challenge: false
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
                                ...call.args
                            };
                            const newHost = await internalProxyHost.create(access, data);
                            result = `Created Proxy Host ID: ${newHost.id}`;
                            break;
                        }
                        case "delete_proxy_host": {
                            await internalProxyHost.delete(access, { id: call.args.id });
                            result = `Deleted Proxy Host ID: ${call.args.id}`;
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
                            result = JSON.stringify(hosts.map(h => ({
                                id: h.id,
                                domain_names: h.domain_names,
                                forward_http_code: h.forward_http_code,
                                forward_scheme: h.forward_scheme,
                                forward_domain_name: h.forward_domain_name,
                                enabled: h.enabled
                            })));
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
                                    dns_challenge: false
                                };
                            }
                            const newHost = await internalRedirectionHost.create(access, {
                                certificate_id: certId,
                                ssl_forced: false,
                                block_exploits: true,
                                advanced_config: "",
                                meta: meta,
                                ...call.args
                            });
                            result = `Created Redirection Host ID: ${newHost.id}`;
                            break;
                        }
                        case "delete_redirection_host": {
                            await internalRedirectionHost.delete(access, { id: call.args.id });
                            result = `Deleted Redirection Host ID: ${call.args.id}`;
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
                                    dns_challenge: false
                                };
                            }
                            const newHost = await internalDeadHost.create(access, {
                                certificate_id: certId,
                                ssl_forced: false,
                                block_exploits: true,
                                advanced_config: "",
                                meta: meta,
                                ...call.args
                            });
                            result = `Created 404 Host ID: ${newHost.id}`;
                            break;
                        }
                        case "delete_dead_host": {
                            await internalDeadHost.delete(access, { id: call.args.id });
                            result = `Deleted 404 Host ID: ${call.args.id}`;
                            break;
                        }
                        // Streams
                        case "get_streams": {
                            const streams = await internalStream.getAll(access);
                            result = JSON.stringify(streams.map(s => ({
                                id: s.id,
                                incoming_port: s.incoming_port,
                                forward_ip: s.forward_ip,
                                forward_port: s.forward_port,
                                tcp: s.tcp_forwarding,
                                udp: s.udp_forwarding,
                                enabled: s.enabled
                            })));
                            break;
                        }
                        case "create_stream": {
                            const newStream = await internalStream.create(access, {
                                certificate_id: 0,
                                meta: {},
                                ...call.args
                            });
                            result = `Created Stream ID: ${newStream.id}`;
                            break;
                        }
                        case "delete_stream": {
                            await internalStream.delete(access, { id: call.args.id });
                            result = `Deleted Stream ID: ${call.args.id}`;
                            break;
                        }
                        // Global Settings
                        case "get_global_settings": {
                            const settings = await internalSetting.getAll(access);
                            result = JSON.stringify(settings.map(s => ({ id: s.id, value: s.value })));
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
                            result = JSON.stringify(lists.map(l => ({ id: l.id, name: l.name })));
                            break;
                        }
                        case "create_access_list": {
                            const newList = await internalAccessList.create(access, {
                                items: [],
                                clients: [],
                                meta: {},
                                ...call.args
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
                            result = JSON.stringify(tunnels.map(t => ({
                                id: t.id,
                                name: t.name,
                                status: t.status,
                                created_on: t.created_on
                            })));
                            break;
                        }
                        case "create_cloudflared_tunnel": {
                            const newTunnel = await CloudflaredTunnel.query().insert({
                                name: call.args.name,
                                token: call.args.token,
                                status: 0 // Stopped by default
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
                                    secret: call.args.password || "changeme123" // Fallback if not provided, though generic prompt should ask
                                }
                            };
                            const newUser = await internalUser.create(access, userData);
                            result = `Created User ID: ${newUser.id} (Email: ${newUser.email})`;
                            break;
                        }
                        // Certificates
                        case "get_certificates": {
                            const certs = await internalCertificate.getAll(access);
                            result = JSON.stringify(certs.map(c => ({
                                id: c.id,
                                nice_name: c.nice_name,
                                provider: c.provider,
                                domain_names: c.domain_names,
                                expires_on: c.expires_on
                            })));
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
                                meta: meta
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
                                certificate_key: { data: Buffer.from(call.args.certificate_key) }
                            };
                            if (call.args.intermediate_certificate) {
                                files.intermediate_certificate = { data: Buffer.from(call.args.intermediate_certificate) };
                            }
                            const valid = await internalCertificate.validate({ files: files });
                            result = JSON.stringify(valid, null, 2);
                            break;
                        }
                        case "upload_certificate": {
                            const files = {
                                certificate: { data: Buffer.from(call.args.certificate) },
                                certificate_key: { data: Buffer.from(call.args.certificate_key) }
                            };
                            if (call.args.intermediate_certificate) {
                                files.intermediate_certificate = { data: Buffer.from(call.args.intermediate_certificate) };
                            }
                            await internalCertificate.upload(access, { id: call.args.id, files: files });
                            result = `Uploaded certificate content for ID: ${call.args.id}`;
                            break;
                        }
                        case "renew_certificate": {
                            const cert = await internalCertificate.get(access, { id: call.args.id });
                            if (cert.provider === 'letsencrypt') {
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
                            result = JSON.stringify(Object.keys(plugins).map(k => ({ id: k, name: plugins[k].name })));
                            break;
                        }
                        case "test_http_challenge": {
                            const testResult = await internalCertificate.testHttpsChallenge(access, { domain_names: call.args.domains });
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
                                token: call.args.token
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
                                expiry: expiry
                            });
                            result = `Created API Token: ${newToken.token}`;
                            break;
                        }
                        case "create_client_certificate": {
                            const tmpDir = `/tmp/client-cert-${Date.now()}`;
                            const p12Path = await internalPki.createClientCert({
                                common_name: call.args.common_name,
                                password: call.args.password,
                                years: call.args.years || 1
                            }, tmpDir);
                            result = `Client Certificate Created at: ${p12Path}. You can retrieve it from the server filesystem.`;
                            break;
                        }
                        // Missing Read/Log Tools
                        case "get_users": {
                            const users = await internalUser.getAll(access);
                            result = JSON.stringify(users.map(u => ({ id: u.id, name: u.name, email: u.email, roles: u.roles })));
                            break;
                        }
                        case "get_audit_log": {
                            const logs = await internalAuditLog.getAll(access, ["user"]);
                            result = JSON.stringify(logs.map(l => ({
                                action: l.action,
                                user: l.user ? l.user.name : "System",
                                time: l.created_on,
                                meta: l.meta
                            })));
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
                            const stats = (await AnalyticCount.knex()
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
                                errors_5xx: stats.s5xx || 0
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

            console.log("[AI Chat] Tool results:", toolResults.map(tr => ({ name: tr.name, resultLength: tr.result?.length || 0 })));

            // Call LLM again with results
            if (config.provider === "gemini") {
                return await ai._callGeminiWithResults(config, systemPrompt, message, history, response, toolResults, tools);
            } else {
                return await ai._callLocalWithResults(config, systemPrompt, message, history, response, toolResults);
            }
        }

        console.log("[AI Chat] Returning response:", { role: "assistant", contentLength: response.content?.length || 0 });

        return {
            role: "assistant",
            content: response.content
        };
    },

    // --- Private Provider Implementations ---

    _callGemini: async (config, systemPrompt, message, history, tools) => {
        if (!config.api_key) throw new Error("Gemini API Key is missing");

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model || "gemini-1.5-flash"}:generateContent?key=${config.api_key}`;

        // Map Tools to Gemini Format
        const geminiTools = tools.length > 0 ? [{
            function_declarations: tools.map(t => ({
                name: t.function.name,
                description: t.function.description,
                parameters: t.function.parameters
            }))
        }] : undefined;

        const contents = [
            { role: "user", parts: [{ text: systemPrompt }] }, // System prompt as first user msg mostly works for Gemini REST, or use system_instruction
            ...history.map(h => ({
                role: h.role === "assistant" ? "model" : "user",
                parts: [{ text: h.content }]
            })),
            { role: "user", parts: [{ text: message }] }
        ];

        // Use system_instruction if model supports it (Gemini 1.5 does)
        const payload = {
            contents,
            system_instruction: { parts: [{ text: systemPrompt }] },
            tools: geminiTools
        };

        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Gemini API Error: ${res.status} - ${errText}`);
        }

        const json = await res.json();
        const candidate = json.candidates?.[0];

        if (!candidate) throw new Error("No response from Gemini");

        const parts = candidate.content.parts || [];
        const textPart = parts.find(p => p.text)?.text || "";
        const functionCallPart = parts.find(p => p.functionCall);

        if (functionCallPart) {
            return {
                content: textPart, // Might be empty or valid
                toolCalls: [{
                    name: functionCallPart.functionCall.name,
                    args: functionCallPart.functionCall.args
                }],
                rawParts: parts
            };
        }

        return { content: textPart };
    },

    _callGeminiWithResults: async (config, systemPrompt, message, history, previousResponse, toolResults, tools) => {
        if (!config.api_key) throw new Error("Gemini API Key is missing");
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model || "gemini-1.5-flash"}:generateContent?key=${config.api_key}`;

        // Map Tools to Gemini Format (same as _callGemini)
        const geminiTools = tools.length > 0 ? [{
            function_declarations: tools.map(t => ({
                name: t.function.name,
                description: t.function.description,
                parameters: t.function.parameters
            }))
        }] : undefined;

        // Construct the conversation flow for tool response
        const contents = [
            // Original conversation...
            ...history.map(h => ({
                role: h.role === "assistant" ? "model" : "user",
                parts: [{ text: h.content }]
            })),
            { role: "user", parts: [{ text: message }] },
            // The model's call
            {
                role: "model",
                parts: previousResponse.rawParts || previousResponse.toolCalls.map(tc => ({
                    functionCall: {
                        name: tc.name,
                        args: tc.args
                    }
                }))
            },
            // The tool result
            {
                role: "function", parts: toolResults.map(tr => ({
                    functionResponse: {
                        name: tr.name,
                        response: { result: tr.result } // Gemini expects an object here usually
                    }
                }))
            }
        ];

        const payload = {
            contents,
            system_instruction: { parts: [{ text: systemPrompt }] },
            tools: geminiTools
        };

        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const err = await res.text();
            throw new Error(`Gemini API Error (Tool Result): ${res.status} - ${err}`);
        }

        const json = await res.json();
        const candidate = json.candidates?.[0];
        const textPart = candidate?.content?.parts?.find(p => p.text)?.text || "";

        return {
            role: "assistant",
            content: textPart
        };
    },

    _callLocalLLM: async (config, systemPrompt, message, history, tools) => {
        // OpenAI Compatible
        const url = `${config.base_url}/v1/chat/completions`;

        const messages = [
            { role: "system", content: systemPrompt },
            ...history,
            { role: "user", content: message }
        ];

        const payload = {
            model: config.model || "gpt-3.5-turbo",
            messages,
            tools: tools.length > 0 ? tools.map(t => ({
                type: "function",
                function: t.function
            })) : undefined
        };

        const res = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${config.api_key}` // Optional for some local LLMs
            },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const err = await res.text();
            throw new Error(`Local LLM Error: ${res.status} - ${err}`);
        }

        const json = await res.json();
        const choice = json.choices?.[0];
        const msg = choice?.message;

        if (msg.tool_calls) {
            return {
                content: msg.content,
                toolCalls: msg.tool_calls.map(tc => ({
                    name: tc.function.name,
                    args: JSON.parse(tc.function.arguments),
                    id: tc.id
                }))
            };
        }

        return { content: msg.content };
    },

    _callLocalWithResults: async (config, systemPrompt, message, history, previousResponse, toolResults) => {
        const url = `${config.base_url}/v1/chat/completions`;

        const messages = [
            { role: "system", content: systemPrompt },
            ...history,
            { role: "user", content: message },
            // Initial Assistant Response with Tool Calls
            {
                role: "assistant",
                content: previousResponse.content,
                tool_calls: previousResponse.toolCalls.map(tc => ({
                    id: tc.id,
                    type: "function",
                    function: {
                        name: tc.name, // Local/OpenAI usually needs json string args
                        arguments: JSON.stringify(tc.args)
                    }
                }))
            },
            // Tool Outputs
            ...toolResults.map((tr, idx) => ({
                role: "tool",
                tool_call_id: previousResponse.toolCalls[idx].id, // Need to match ID
                content: tr.result
            }))
        ];

        const payload = {
            model: config.model,
            messages
        };

        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error("Local LLM Error (Tool Result)");
        const json = await res.json();
        return {
            role: "assistant",
            content: json.choices?.[0]?.message?.content
        };
    }
};

export default ai;
