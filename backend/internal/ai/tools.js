/**
 * AI Tool Definitions
 * Extracted from ai.js for modularity
 */

/**
 * Returns the full array of tool definitions for the AI chat.
 * @returns {Array} Tool definitions in OpenAI/Gemini function format
 */
const getAllToolDefinitions = () => [
	{
		function: {
			name: "get_system_status",
			description: "Get System Health (CPU, RAM, Network Traffic)",
			parameters: { type: "object", properties: {} },
		},
	},
	{
		function: {
			name: "force_nginx_reload",
			description: "Force Nginx Reload",
			parameters: { type: "object", properties: {} },
		},
	},
	{
		function: {
			name: "test_nginx_config",
			description: "Test Nginx Configuration",
			parameters: { type: "object", properties: {} },
		},
	},
	// Proxy Hosts
	{
		function: {
			name: "get_proxy_hosts",
			description: "Get a list of all Proxy Hosts",
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
					domain_names: { type: "array", items: { type: "string" }, description: "List of domain names" },
					forward_scheme: { type: "string", enum: ["http", "https"], description: "Forwarding scheme" },
					forward_host: { type: "string", description: "Internal IP or hostname to forward to" },
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
					bandwidth_limit: { type: "string", description: "Limit bandwidth (e.g. 100k, 1m)" },
					forward_query: { type: "string", description: "Query string to append" },
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
			name: "update_proxy_host",
			description: "Update an existing Proxy Host",
			parameters: {
				type: "object",
				properties: {
					id: { type: "integer" },
					domain_names: { type: "array", items: { type: "string" } },
					forward_host: { type: "string" },
					forward_port: { type: "integer" },
					locations: { type: "array", items: { type: "object" } },
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
			name: "delete_proxy_host",
			description: "Delete a Proxy Host by ID",
			parameters: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] },
		},
	},
	{
		function: {
			name: "enable_proxy_host",
			description: "Enable a Proxy Host by ID",
			parameters: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] },
		},
	},
	{
		function: {
			name: "set_maintenance_mode",
			description: "Enable or Disable Maintenance Mode for a Proxy Host (displays maintenance page to visitors)",
			parameters: {
				type: "object",
				properties: {
					id: { type: "integer", description: "Proxy Host ID" },
					active: { type: "boolean", description: "true to enable maintenance, false to disable" },
					reason: { type: "string", description: "Reason for maintenance (optional)" },
				},
				required: ["id", "active"],
			},
		},
	},
	{
		function: {
			name: "disable_proxy_host",
			description: "Disable a Proxy Host by ID",
			parameters: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] },
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
						},
					},
					clients: {
						type: "array",
						items: {
							type: "object",
							properties: { address: { type: "string" }, directive: { type: "string" } },
						},
					},
				},
				required: ["id"],
			},
		},
	},
	{
		function: {
			name: "delete_access_list",
			description: "Delete an Access List",
			parameters: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] },
		},
	},

	// Certificates
	{
		function: {
			name: "get_certificates",
			description: "Get all Certificates",
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
					provider: { type: "string", enum: ["letsencrypt", "internal"], description: "Provider type" },
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
			name: "update_certificate",
			description: "Update a Certificate",
			parameters: {
				type: "object",
				properties: { id: { type: "integer" }, nice_name: { type: "string" } },
				required: ["id"],
			},
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
			name: "get_certificate_details",
			description: "Get full details for a Certificate",
			parameters: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] },
		},
	},
	{
		function: {
			name: "renew_certificate",
			description: "Renew a Let's Encrypt Certificate",
			parameters: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] },
		},
	},
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
			name: "get_dns_plugins",
			description: "Get list of supported Certbot DNS Plugins (Cloudflare, etc)",
			parameters: { type: "object", properties: {} },
		},
	},

	// DDNS Client
	{
		function: {
			name: "get_ddns_providers",
			description: "Get configured DDNS Client Providers",
			parameters: { type: "object", properties: {} },
		},
	},
	{
		function: {
			name: "create_ddns_provider",
			description: "Create a new DDNS Provider",
			parameters: {
				type: "object",
				properties: {
					name: { type: "string" },
					provider: { type: "string", enum: ["cloudflare", "duckdns", "custom"] },
					domains: { type: "array", items: { type: "string" } },
					ip_ver: { type: "string", enum: ["v4", "v6", "dual"] },
					config: {
						type: "object",
						description: "Provider configuration",
						properties: {
							token: { type: "string", description: "Cloudflare API Token or DuckDNS Token" },
							zone_id: { type: "string", description: "Cloudflare Zone ID" },
							url: { type: "string", description: "Custom URL" },
						},
					},
				},
				required: ["name", "provider", "domains"],
			},
		},
	},
	{
		function: {
			name: "update_ddns_provider",
			description: "Update a DDNS Provider",
			parameters: {
				type: "object",
				properties: {
					id: { type: "integer" },
					name: { type: "string" },
					provider: { type: "string" },
					domains: { type: "array", items: { type: "string" } },
					ip_ver: { type: "string" },
					config: {
						type: "object",
						properties: {
							token: { type: "string" },
							zone_id: { type: "string" },
							url: { type: "string" },
						},
					},
					enabled: { type: "boolean" },
				},
				required: ["id"],
			},
		},
	},
	{
		function: {
			name: "delete_ddns_provider",
			description: "Delete a DDNS Provider",
			parameters: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] },
		},
	},
	{
		function: {
			name: "test_ddns_provider",
			description: "Force Update / Test a DDNS Provider",
			parameters: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] },
		},
	},
	{
		function: {
			name: "test_http_challenge",
			description: "Test HTTP Challenge for domains",
			parameters: {
				type: "object",
				properties: { domains: { type: "array", items: { type: "string" } } },
				required: ["domains"],
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

	// Users
	{
		function: {
			name: "get_users",
			description: "Get all Users",
			parameters: { type: "object", properties: {} },
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
						properties: { type: { type: "string", enum: ["password"] }, secret: { type: "string" } },
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
				properties: { id: { type: "integer" }, permissions: { type: "object" } },
				required: ["id", "permissions"],
			},
		},
	},
	{
		function: {
			name: "delete_user",
			description: "Delete (soft delete) a User",
			parameters: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] },
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
			name: "create_cloudflared_tunnel",
			description: "Create a new Cloudflare Tunnel",
			parameters: {
				type: "object",
				properties: { name: { type: "string" }, token: { type: "string" } },
				required: ["name", "token"],
			},
		},
	},
	{
		function: {
			name: "update_cloudflared_tunnel",
			description: "Update Cloudflare Tunnel",
			parameters: {
				type: "object",
				properties: { id: { type: "integer" }, name: { type: "string" }, token: { type: "string" } },
				required: ["id"],
			},
		},
	},
	{
		function: {
			name: "delete_cloudflared_tunnel",
			description: "Delete a Cloudflare Tunnel",
			parameters: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] },
		},
	},

	// Analytics & Logs
	{
		function: {
			name: "get_host_analytics",
			description: "Get detailed analytics (Top IPs, User Agents, etc.) for a specific Proxy Host",
			parameters: {
				type: "object",
				properties: {
					host_id: { type: "integer", description: "ID of the Proxy Host" },
					range: {
						type: "string",
						description: "Time range (1h, 24h, 7d, 30d)",
						enum: ["1h", "24h", "7d", "30d"],
					},
				},
				required: ["host_id"],
			},
		},
	},
	{
		function: {
			name: "get_analytics_summary",
			description: "Get recent analytics summary (24h)",
			parameters: { type: "object", properties: {} },
		},
	},
	{
		function: {
			name: "get_analytics_series",
			description: "Get detailed analytics (Top IPs, User Agents, etc.) for a specific Proxy Host",
			parameters: {
				type: "object",
				properties: {
					host_id: { type: "integer", description: "ID of the Proxy Host" },
					range: {
						type: "string",
						description: "Time range (1h, 24h, 7d, 30d)",
						enum: ["1h", "24h", "7d", "30d"],
					},
				},
				required: ["host_id"],
			},
		},
	},
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
	// Tor Onion Services
	{
		function: {
			name: "get_tor_onion_services",
			description: "Get all Tor Onion Services",
			parameters: { type: "object", properties: {} },
		},
	},
	{
		function: {
			name: "create_tor_onion_service",
			description: "Create a new Tor Onion Service",
			parameters: {
				type: "object",
				properties: {
					name: { type: "string" },
					proxy_host_id: { type: "integer", description: "ID of Proxy Host to forward to" },
					virtual_port: { type: "integer", description: "Public port on .onion address (usually 80)" },
					target_port: { type: "integer", description: "Internal port to forward to (usually 80)" },
				},
				required: ["name", "virtual_port", "target_port"],
			},
		},
	},
	{
		function: {
			name: "update_tor_onion_service",
			description: "Update a Tor Onion Service",
			parameters: {
				type: "object",
				properties: {
					id: { type: "integer" },
					name: { type: "string" },
					proxy_host_id: { type: "integer" },
					virtual_port: { type: "integer" },
					target_port: { type: "integer" },
				},
				required: ["id"],
			},
		},
	},
	{
		function: {
			name: "delete_tor_onion_service",
			description: "Delete a Tor Onion Service",
			parameters: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] },
		},
	},
	{
		function: {
			name: "start_tor_onion_service",
			description: "Start a Tor Onion Service",
			parameters: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] },
		},
	},
	{
		function: {
			name: "stop_tor_onion_service",
			description: "Stop a Tor Onion Service",
			parameters: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] },
		},
	},
	{
		function: {
			name: "get_audit_log",
			description: "Get System Audit Logs",
			parameters: { type: "object", properties: { limit: { type: "integer" } } },
		},
	},

	// Settings & System
	{
		function: {
			name: "get_global_settings",
			description: "Get Global ShieldPM Settings",
			parameters: { type: "object", properties: {} },
		},
	},
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
	{
		function: {
			name: "get_host_counts",
			description: "Get Counts of all Host types",
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
	{
		function: {
			name: "test_nginx_config",
			description: "Test Nginx Configuration",
			parameters: { type: "object", properties: {} },
		},
	},
	{
		function: {
			name: "force_nginx_reload",
			description: "Force Nginx Reload",
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
];

const restrictedSystemTools = new Set(["test_nginx_config", "force_nginx_reload", "renew_ip_ranges"]);

/**
 * Returns the AI tool definitions the caller is authorized to receive.
 * Global Nginx and IP-range operations require settings:update and are hidden
 * when that capability cannot be verified.
 *
 * @param {import("../../lib/types.js").Access} access
 * @returns {Promise<Array>} Authorized tool definitions in OpenAI/Gemini function format
 */
export const getToolDefinitions = async (access) => {
	let canUpdateSettings = false;

	try {
		await access.can("settings:update");
		canUpdateSettings = true;
	} catch (_err) {
		// Fail closed: do not reveal or offer privileged system operations.
	}

	return getAllToolDefinitions().filter(
		(tool) => canUpdateSettings || !restrictedSystemTools.has(tool.function.name),
	);
};
