/**
 * Debug Script for NPMplus Analytics Log Parsing & DB Connectivity
 * Run with: node debug_analytics.js
 *
 * This script will:
 * 1. Attempt to connect to the database using the app's configuration.
 * 2. Load active Proxy Hosts.
 * 3. Simulate log parsing with provided sample logs.
 * 4. ATTEMPT to insert the parsed logs into the database to verify write permissions/schema.
 */

import dayjs from "dayjs";
import ProxyHost from "./models/proxy_host.js";
import AnalyticsLogs from "./models/analytics_logs.js";
import AnalyticCount from "./models/analytic_count.js";

// Ensure DATA_PATH is set if not present (default for docker)
if (!process.env.DATA_PATH) {
	process.env.DATA_PATH = "/data";
	console.log("ℹ️  Setting default DATA_PATH to /data");
} else {
	console.log(`ℹ️  Using DATA_PATH: ${process.env.DATA_PATH}`);
}

const hostCache = new Map();

async function loadDomains() {
	try {
		console.log("🔌 Connecting to Database...");
		const hosts = await ProxyHost.query().where("is_deleted", 0).select("id", "domain_names");
		console.log(`✅ Database Connected. Found ${hosts.length} active Proxy Hosts.`);

		for (const host of hosts) {
			try {
				const domains =
					typeof host.domain_names === "string" ? JSON.parse(host.domain_names) : host.domain_names;

				if (Array.isArray(domains)) {
					for (const domain of domains) {
						hostCache.set(domain, host.id);
					}
				}
			} catch (_e) { }
		}
	} catch (err) {
		console.error("❌ Database Connection Failed:", err.message);
		process.exit(1);
	}
}

async function processLineAndInsert(line) {
	console.log("\n--- Processing Log Line ---");

	try {
		// 1. Fix unquoted geoip_country_code
		let fixedLine = line.replace(/"geoip_country_code":([A-Z]{2})}/g, '"geoip_country_code":"$1"}');
		fixedLine = fixedLine.replace(/"geoip_country_code":-}/g, '"geoip_country_code":null}');

		const data = JSON.parse(fixedLine);

		// 2. Resolve Hostname
		let hostname = data.server_name;
		if (!hostname || hostname === "_") {
			hostname = data.http_host;
		}

		// 3. Resolve Host ID
		const hostId = hostCache.get(hostname) || 0;

		console.log(`Hostname: '${hostname}' | Resolved ID: ${hostId}`);

		if (hostId === 0) {
			console.warn("❌ WARNING: Host ID is 0. Ignoring DB insert for this line.");
			return;
		}

		const status = Number.parseInt(data.status, 10) || 0;
		const bytes = Number.parseInt(data.body_bytes_sent, 10) || 0;
		const duration = Math.floor(Number.parseFloat(data.request_time || 0) * 1000);
		const logDate = dayjs(data.time_iso8601);

		console.log(`stats: status=${status} bytes=${bytes} duration=${duration}ms time=${logDate.format()}`);
		console.log(`details: method=${data.request_method} path=${data.request_uri}`);
		console.log(`geo: ip=${data.remote_addr} country=${data.geoip_country_code}`);
		console.log(`ua: ${data.http_user_agent}`);

		// 4. TEST INSERT (Batch Mode - Raw Knex)
		console.log("💾 Attempting DB Insert (Batch Mode)...");

		// Detailed Log
		const logEntry = {
			host_id: hostId,
			time: logDate.toISOString(),
			method: data.request_method,
			path: data.request_uri,
			status: status,
			bytes: bytes,
			ip: data.remote_addr,
			country_code: data.geoip_country_code || null,
			referer: data.http_referer || null,
			user_agent: data.http_user_agent || null,
			duration: duration,
		};

		// Use Knex directly to bypass Objection's "batch insert only works with..." on MySQL
		await AnalyticsLogs.knex().table("analytics_logs").insert([logEntry]);
		console.log("✅ Detailed Log Batch Inserted!");

		// Check Count
		const startOfMinute = logDate.startOf("minute").toISOString();
		const s2xx = status >= 200 && status < 300 ? 1 : 0;
		const s3xx = status >= 300 && status < 400 ? 1 : 0;
		const s4xx = status >= 400 && status < 500 ? 1 : 0;
		const s5xx = status >= 500 ? 1 : 0;

		await AnalyticCount.query().insert({
			proxy_host_id: hostId,
			timestamp: startOfMinute,
			request_count: 1,
			bytes_sent: bytes,
			status_code_2xx: s2xx,
			status_code_3xx: s3xx,
			status_code_4xx: s4xx,
			status_code_5xx: s5xx,
		});

		console.log("✅ Aggregated Count Inserted!");
	} catch (err) {
		console.error("❌ PARSING/INSERT FAILED:", err.message);
		console.error("Stack:", err.stack);
	}
}

// Sample Logs provided by user
const logs = [
	'{"msec": "1766794479.565", "connection": "1", "connection_requests": "1", "pid": "1688", "request_id": "62867a9902d4051234fd8d9eb06556d2", "request_length": "517", "remote_addr": "93.192.75.254", "remote_user": "", "remote_port": "60959", "time_local": "27/Dec/2025:01:14:39 +0100", "time_iso8601": "2025-12-27T01:14:39+01:00", "request": "GET / HTTP/2.0", "request_uri": "/", "args": "", "status": "200", "body_bytes_sent": "679", "bytes_sent": "978", "http_referer": "", "http_user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36", "http_x_forwarded_for": "", "http_host": "npmplus.clawsucht.eu", "server_name": "npmplus.clawsucht.eu", "request_time": "0.061", "upstream": "127.0.0.1:81", "upstream_connect_time": "0.036", "upstream_header_time": "0.061", "upstream_response_time": "0.061", "upstream_response_length": "1439", "upstream_cache_status": "", "ssl_protocol": "TLSv1.3", "ssl_cipher": "TLS_AES_256_GCM_SHA384", "scheme": "https", "request_method": "GET", "server_protocol": "HTTP/2.0", "pipe": ".", "gzip_ratio": "2.12", "http_cf_ray": "","geoip_country_code":DE}',
];

(async () => {
	await loadDomains();
	console.log("\n🧪 Running Insert Test...");
	// Only process first log line to avoid spamming production DB too much
	await processLineAndInsert(logs[0]);
	process.exit(0);
})();
