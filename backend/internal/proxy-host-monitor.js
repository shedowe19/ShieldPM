import { X509Certificate } from "node:crypto";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import errs from "../lib/error.js";
import { global as logger } from "../logger.js";
import proxyHostModel from "../models/proxy_host.js";
import ProxyHostMonitor from "../models/proxy_host_monitor.js";
import ProxyHostMonitorCheck from "../models/proxy_host_monitor_check.js";
import internalChat from "./chat.js";

const TICK_MS = 10_000;
const MAX_CONCURRENT = 5;
const MAX_HISTORY = 100;
const RETENTION_DAYS = 30;
const RETENTION_CLEANUP_MS = 24 * 60 * 60 * 1000;
const ALERT_COOLDOWN_MS = 5 * 60 * 1000;
const SAFE_PATH = /^\/(?!\/)[A-Za-z0-9/_~.!$&'()*+,;=:-]*$/;
// MySQL TEXT stores at most 65,535 bytes, including PEM line breaks.
const MAX_CA_BYTES = 65_535;
const PEM_START = "-----BEGIN CERTIFICATE-----";
const PEM_END = "-----END CERTIFICATE-----";
const TLS_CERTIFICATE_ERRORS = new Set([
	"CERT_HAS_EXPIRED",
	"CERT_NOT_YET_VALID",
	"CERT_REVOKED",
	"CERT_UNTRUSTED",
	"DEPTH_ZERO_SELF_SIGNED_CERT",
	"ERR_TLS_CERT_ALTNAME_INVALID",
	"INVALID_CA",
	"INVALID_PURPOSE",
	"SELF_SIGNED_CERT_IN_CHAIN",
	"UNABLE_TO_GET_ISSUER_CERT",
	"UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
	"UNABLE_TO_VERIFY_LEAF_SIGNATURE",
]);
const NETWORK_ERRORS = {
	ENOTFOUND: "DNS lookup failed (ENOTFOUND)",
	EAI_AGAIN: "DNS lookup failed (EAI_AGAIN)",
	ECONNREFUSED: "Connection refused (ECONNREFUSED)",
	EHOSTUNREACH: "Host unreachable (EHOSTUNREACH)",
	ENETUNREACH: "Network unreachable (ENETUNREACH)",
	ECONNRESET: "Connection reset (ECONNRESET)",
	EPROTO: "TLS handshake failed (EPROTO)",
	ERR_SSL_WRONG_VERSION_NUMBER: "TLS handshake failed (ERR_SSL_WRONG_VERSION_NUMBER)",
};
export const networkMessage = (code, isHttps = false) => {
	if ((code === "EPROTO" || code === "ERR_SSL_WRONG_VERSION_NUMBER") && !isHttps) return "Connection failed";
	return Object.hasOwn(NETWORK_ERRORS, code) ? NETWORK_ERRORS[code] : "Connection failed";
};
/** @typedef {{ enabled: boolean, type: "http" | "tcp", path: string, interval_seconds: number, timeout_ms: number, expected_status: number, alert_enabled: boolean, upstream_ca?: string | null, upstream_server_name?: string | null, skip_certificate_verification?: boolean }} MonitorSettings */
const active = new Map();
let timer = null;
let scanning = false;
let lastCleanupAt = 0;

const pemWhitespace = (code) => code === 9 || code === 10 || code === 13 || code === 32;
const pemBase64 = (code) =>
	(code >= 65 && code <= 90) ||
	(code >= 97 && code <= 122) ||
	(code >= 48 && code <= 57) ||
	code === 43 ||
	code === 47 ||
	code === 61;

/** Parse a bounded PEM bundle in one pass. The X.509 parser validates each certificate. */
const validCertificateBundle = (pem) => {
	let position = 0;
	let count = 0;
	while (position < pem.length) {
		while (position < pem.length && pemWhitespace(pem.charCodeAt(position))) position++;
		if (position === pem.length) break;
		if (count === 8 || !pem.startsWith(PEM_START, position)) return false;
		const start = position;
		position += PEM_START.length;
		const end = pem.indexOf(PEM_END, position);
		if (end === -1) return false;
		let hasBase64 = false;
		for (; position < end; position++) {
			const code = pem.charCodeAt(position);
			if (pemWhitespace(code)) continue;
			if (!pemBase64(code)) return false;
			hasBase64 = true;
		}
		if (!hasBase64) return false;
		try {
			new X509Certificate(pem.slice(start, end + PEM_END.length));
		} catch {
			return false;
		}
		position = end + PEM_END.length;
		count++;
	}
	return count > 0;
};

/** HTTP GET discards the response body and never follows redirects or sends credentials. */
export function probeHttp(host, config, signal) {
	const started = performance.now();
	return new Promise((resolve) => {
		const client = host.forward_scheme === "https" ? https : http;
		let phase = net.isIP(host.forward_host) ? "connecting" : "resolving";
		let settled = false;
		let request;
		let timeout;
		const finish = (result) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			signal?.removeEventListener("abort", abort);
			resolve({ ...result, response_ms: Math.round(performance.now() - started) });
		};
		const abort = () => request?.destroy();
		try {
			request = client.request(
				{
					hostname: host.forward_host,
					port: Number(host.forward_port),
					path: config.path,
					method: "GET",
					agent: false,
					...(host.forward_scheme === "https"
						? {
								// Explicit per-host opt-in: accept any upstream certificate for this health probe.
								// This disables chain and hostname verification; do not send credentials.
								rejectUnauthorized: config.skip_certificate_verification !== true,
								...(config.skip_certificate_verification === true
									? {}
									: config.upstream_ca
										? { ca: config.upstream_ca, allowPartialTrustChain: true }
										: {}),
								...(config.upstream_server_name ? { servername: config.upstream_server_name } : {}),
							}
						: {}),
					headers: { "User-Agent": "ShieldPM-Monitor/1", Accept: "*/*" },
				},
				(response) => {
					const status = response.statusCode ?? null;
					finish({
						state: status === config.expected_status ? "up" : "down",
						status_code: status,
						message: `HTTP ${status ?? "unknown"}`,
					});
					// Reading headers is enough; a health endpoint must not stream into memory.
					response.destroy();
				},
			);
			request.once("socket", (socket) => {
				socket.once("lookup", () => {
					phase = "connecting";
				});
				socket.once("connect", () => {
					phase = host.forward_scheme === "https" ? "tls" : "headers";
				});
				socket.once("secureConnect", () => {
					phase = "headers";
				});
			});
			request.on("error", (error) => {
				const unverifiable =
					host.forward_scheme === "https" &&
					config.skip_certificate_verification !== true &&
					TLS_CERTIFICATE_ERRORS.has(error.code);
				finish({
					state: unverifiable ? "unknown" : "down",
					status_code: null,
					message: unverifiable
						? "TLS certificate could not be verified"
						: networkMessage(error.code, host.forward_scheme === "https"),
				});
			});
			signal?.addEventListener("abort", abort, { once: true });
			timeout = setTimeout(() => {
				finish({ state: "down", status_code: null, message: `Timed out during ${phase}` });
				request.destroy();
			}, config.timeout_ms);
			if (signal?.aborted) abort();
			else request.end();
		} catch {
			request?.destroy();
			finish({ state: "down", status_code: null, message: "Invalid upstream" });
		}
	});
}

/** A TCP check succeeds once a socket is connected; no application data is sent. */
export function probeTcp(host, config, signal) {
	const started = performance.now();
	return new Promise((resolve) => {
		let phase = net.isIP(host.forward_host) ? "connecting" : "resolving";
		let settled = false;
		let socket;
		let timeout;
		const finish = (state, message) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			signal?.removeEventListener("abort", abort);
			socket?.destroy();
			resolve({ state, message, status_code: null, response_ms: Math.round(performance.now() - started) });
		};
		const abort = () => finish("down", "Stopped");
		try {
			socket = net.connect({ host: host.forward_host, port: Number(host.forward_port) });
			socket.once("lookup", () => {
				phase = "connecting";
			});
			socket.once("connect", () => finish("up", "TCP connected"));
			socket.once("error", (error) => finish("down", networkMessage(error.code)));
			signal?.addEventListener("abort", abort, { once: true });
			timeout = setTimeout(() => finish("down", `Timed out during ${phase}`), config.timeout_ms);
			if (signal?.aborted) abort();
		} catch {
			finish("down", "Invalid upstream");
		}
	});
}

/** Match Nginx's forward_host/path split, but reject unsupported socket and file targets. */
function resolveTarget(host, config) {
	if (host.forward_scheme === "path") return null;
	if (config.type === "http" && !["http", "https"].includes(host.forward_scheme)) return null;
	let hostname = host.forward_scheme === "terminal" ? host.terminal_host : host.forward_host;
	let port = host.forward_scheme === "terminal" ? host.terminal_port || 22 : host.forward_port;
	if (typeof hostname !== "string" || hostname.startsWith("unix") || hostname.startsWith("/")) return null;
	let basePath = "";
	if (host.forward_scheme !== "terminal" && hostname.includes("/")) {
		const split = hostname.split("/");
		hostname = split.shift();
		basePath = `/${split.join("/")}`.replace(/\/$/, "");
	}
	if (hostname.startsWith("[") && hostname.endsWith("]")) hostname = hostname.slice(1, -1);
	port = Number(port);
	if (!hostname || !Number.isInteger(port) || port < 1 || port > 65535) return null;
	const path = basePath ? `${basePath}${config.path === "/" ? "" : config.path}` : config.path;
	if (!SAFE_PATH.test(path) || path.length > 255) return null;
	return { forward_scheme: host.forward_scheme, forward_host: hostname, forward_port: port, path };
}

/** Validate imported settings as strictly as the API request schema (without coercion). */
/** @param {any} data @returns {MonitorSettings} */
export function assertMonitorConfig(data) {
	const required = ["enabled", "type", "path", "interval_seconds", "timeout_ms", "expected_status", "alert_enabled"];
	const optional = ["upstream_ca", "upstream_server_name", "skip_certificate_verification"];
	if (
		!data ||
		typeof data !== "object" ||
		Array.isArray(data) ||
		Object.keys(data).some((key) => !required.includes(key) && !optional.includes(key)) ||
		required.some((key) => !Object.hasOwn(data, key))
	) {
		throw new errs.ValidationError("Invalid monitor settings");
	}
	if (
		typeof data.enabled !== "boolean" ||
		typeof data.alert_enabled !== "boolean" ||
		(data.skip_certificate_verification !== undefined && typeof data.skip_certificate_verification !== "boolean") ||
		!["http", "tcp"].includes(data.type) ||
		typeof data.path !== "string" ||
		data.path.length > 255 ||
		!SAFE_PATH.test(data.path) ||
		!Number.isInteger(data.interval_seconds) ||
		data.interval_seconds < 15 ||
		data.interval_seconds > 3600 ||
		!Number.isInteger(data.timeout_ms) ||
		data.timeout_ms < 500 ||
		data.timeout_ms > 15_000 ||
		!Number.isInteger(data.expected_status) ||
		data.expected_status < 100 ||
		data.expected_status > 599
	) {
		throw new errs.ValidationError("Invalid monitor settings");
	}
	if (data.timeout_ms >= data.interval_seconds * 1000)
		throw new errs.ValidationError("Timeout must be shorter than the interval");
	const ca = data.upstream_ca ?? null;
	if (
		ca !== null &&
		(typeof ca !== "string" || Buffer.byteLength(ca, "utf8") > MAX_CA_BYTES || !validCertificateBundle(ca))
	)
		throw new errs.ValidationError("Invalid upstream CA certificate");
	const serverName = data.upstream_server_name ?? null;
	if (
		serverName !== null &&
		(typeof serverName !== "string" ||
			serverName.length > 253 ||
			!serverName
				.split(".")
				.every(
					(part) => part.length > 0 && part.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(part),
				))
	) {
		throw new errs.ValidationError("Invalid upstream TLS server name");
	}
	return {
		...data,
		upstream_ca: ca,
		upstream_server_name: serverName,
		skip_certificate_verification: data.skip_certificate_verification ?? false,
	};
}

/** Persist the last announced state so recoveries delayed by cooldown still get sent. */
export function decideAlert(current, nextState, checkedAt) {
	if (!current.alert_enabled) return { send: false, last_alert_state: null, last_alert_at: null };
	if (nextState === "unknown") {
		return { send: false, last_alert_state: current.last_alert_state, last_alert_at: current.last_alert_at };
	}
	if (!current.last_alert_state && nextState === "up") {
		return { send: false, last_alert_state: "up", last_alert_at: null };
	}
	const elapsed = current.last_alert_at
		? Date.parse(checkedAt) - Date.parse(current.last_alert_at)
		: Number.POSITIVE_INFINITY;
	if (current.last_alert_state !== nextState && elapsed >= ALERT_COOLDOWN_MS) {
		return { send: true, last_alert_state: nextState, last_alert_at: checkedAt };
	}
	return { send: false, last_alert_state: current.last_alert_state, last_alert_at: current.last_alert_at };
}

/** Keep Telegram plaintext on one line even if an imported hostname or domain is malformed. */
const alertLabel = (value, maxLength) =>
	typeof value === "string"
		? value
				.replace(/\p{Cc}/gu, " ")
				.trim()
				.slice(0, maxLength)
		: "";

const alertPath = (path) => {
	if (typeof path !== "string" || !SAFE_PATH.test(path) || path.length > 255) return "";
	const parts = path.split("/");
	return parts
		.map((part, index) => {
			const previous = parts[index - 1] ?? "";
			if (
				/^(?:token|secret|api[-_]?key|password|passwd|auth|authorization|jwt|bearer|session)$/i.test(
					previous,
				) ||
				/(?:token|secret|key|password|passwd|auth|jwt|session)=/i.test(part) ||
				part.length > 32
			) {
				return "[redigiert]";
			}
			return part;
		})
		.join("/");
};

const alertTarget = (target, config) => {
	if (!target) return "kein unterstütztes Netzwerkziel";
	const hostname = target.forward_host;
	if (typeof hostname !== "string" || (!net.isIP(hostname) && !/^[a-z0-9._-]{1,253}$/i.test(hostname))) {
		return "ungültiger Zielname";
	}
	const address = net.isIP(hostname) === 6 ? `[${hostname}]` : hostname;
	const port = Number(target.forward_port);
	if (!Number.isInteger(port) || port < 1 || port > 65535) return "ungültiger Zielport";
	const path = config.type === "http" ? alertPath(target.path) : "";
	return `${config.type === "http" ? `${target.forward_scheme}://` : ""}${address}:${port}${path}`;
};

/** Explain the observed check result; never interpolate raw socket errors, response bodies or headers. */
const alertDiagnosis = (result, expectedStatus) => {
	if (result.status_code != null) {
		const hint = [301, 302, 303, 307, 308].includes(result.status_code)
			? "Weiterleitung wird nicht verfolgt; Prüfpfad und erwarteten Status prüfen."
			: [401, 403].includes(result.status_code)
				? "Der Prüfpfad verlangt möglicherweise eine Anmeldung oder sperrt den Zugriff."
				: result.status_code === 404
					? "Pfad des Health-Endpunkts prüfen."
					: [502, 503, 504].includes(result.status_code)
						? "Dienst hinter dem Proxy und dessen Logs prüfen."
						: "Antwort des Dienstes und erwarteten Status prüfen.";
		return {
			cause: `Der Upstream antwortete mit HTTP ${result.status_code} statt HTTP ${expectedStatus}.`,
			hint,
		};
	}
	const descriptions = {
		"Timed out during resolving": [
			"Zeitlimit bei der DNS-Auflösung erreicht.",
			"DNS-Auflösung und Nameserver des ShieldPM-Servers prüfen.",
		],
		"Timed out during connecting": [
			"TCP-Verbindung kam innerhalb des Zeitlimits nicht zustande.",
			"Erreichbarkeit, Firewall und Zielport prüfen.",
		],
		"Timed out during tls": [
			"TCP verbunden; TLS-Handshake nicht innerhalb des Zeitlimits abgeschlossen.",
			"HTTPS am Zielport und TLS-Konfiguration prüfen.",
		],
		"Timed out during headers": [
			"Verbindung hergestellt; keine HTTP-Antwortheader innerhalb des Zeitlimits.",
			"Health-Endpunkt und Anwendung prüfen.",
		],
		"DNS lookup failed (ENOTFOUND)": [
			"DNS konnte den Zielnamen nicht auflösen (ENOTFOUND).",
			"Hostname und DNS-Einträge vom ShieldPM-Server aus prüfen.",
		],
		"DNS lookup failed (EAI_AGAIN)": [
			"DNS-Auflösung vorübergehend fehlgeschlagen (EAI_AGAIN).",
			"DNS-Server und Verbindung des ShieldPM-Servers prüfen.",
		],
		"Connection refused (ECONNREFUSED)": [
			"TCP-Verbindung zum Zielport wurde abgelehnt (ECONNREFUSED).",
			"Prüfen, ob der Dienst auf diesem Host und Port lauscht.",
		],
		"Host unreachable (EHOSTUNREACH)": [
			"Zielhost über das Netzwerk nicht erreichbar (EHOSTUNREACH).",
			"Routing, Netzwerk und Firewall prüfen.",
		],
		"Network unreachable (ENETUNREACH)": [
			"Netzwerk zum Ziel nicht erreichbar (ENETUNREACH).",
			"Routing und Netzwerkverbindung prüfen.",
		],
		"Connection reset (ECONNRESET)": [
			"Verbindung wurde vor der Antwort zurückgesetzt (ECONNRESET).",
			"Logs des Dienstes und eventuelle Zwischenproxies prüfen.",
		],
		"TLS handshake failed (EPROTO)": [
			"TLS-Handshake fehlgeschlagen (EPROTO).",
			"Zielprotokoll und Port prüfen: Eventuell spricht der Port HTTP statt HTTPS.",
		],
		"TLS handshake failed (ERR_SSL_WRONG_VERSION_NUMBER)": [
			"TLS-Handshake wegen unpassender Protokollversion fehlgeschlagen.",
			"Zielprotokoll und Port prüfen: Eventuell spricht der Port HTTP statt HTTPS.",
		],
		"Invalid upstream": ["Upstream-Ziel ist ungültig.", "Zieladresse und Port des Proxy-Hosts prüfen."],
		"Unsupported upstream": [
			"Der konfigurierte Prüftyp unterstützt dieses Upstream-Ziel nicht.",
			"Prüftyp und Upstream-Ziel des Proxy-Hosts prüfen.",
		],
	};
	const [cause, hint] = Object.hasOwn(descriptions, result.message)
		? descriptions[result.message]
		: ["Verbindung zum Upstream ist fehlgeschlagen.", "Erreichbarkeit, Zielport und Dienstlogs prüfen."];
	return { cause, hint };
};

/** Plaintext Telegram alert, bounded below Telegram's message limit and independent of UI locale. */
export function formatHostMonitorAlert(hostId, config, target, result, previous, domains, checkedAt) {
	const domainNames = domains
		.map((domain) => alertLabel(domain.domain_name, 253))
		.filter((domain) => /^[*a-z0-9._-]{1,253}$/i.test(domain))
		.slice(0, 3);
	const lines = [`ShieldPM: Proxy-Host #${hostId} ist ${result.state.toUpperCase()}`];
	if (domainNames.length) lines.push(`Domain: ${domainNames.join(", ")}`);
	lines.push(`Ziel: ${alertTarget(target, config)}`);
	if (config.type === "http") {
		lines.push(`Prüfung: ${target?.forward_scheme === "https" ? "HTTPS" : "HTTP"} GET`);
		lines.push(`HTTP-Status: ${result.status_code ?? "keine Antwort"} (erwartet ${config.expected_status})`);
		if (target?.forward_scheme === "https") {
			lines.push(
				`TLS-Zertifikat: ${config.skip_certificate_verification ? "Prüfung deaktiviert" : "Prüfung aktiv"}`,
			);
		}
	} else {
		lines.push("Prüfung: TCP-Verbindung");
	}
	lines.push(`Dauer: ${result.response_ms} ms (Zeitlimit: ${config.timeout_ms} ms)`);
	lines.push(`Zeitpunkt (UTC): ${checkedAt}`);
	if (result.state === "up") {
		lines.push("Diagnose: Der Upstream antwortet wieder wie erwartet.");
		if (previous.state === "down") {
			lines.push(`Vorheriger Befund: ${alertDiagnosis(previous, config.expected_status).cause}`);
		}
	} else {
		const { cause, hint } = alertDiagnosis(result, config.expected_status);
		lines.push(`Diagnose: ${cause}`, `Hinweis: ${hint}`);
	}
	return lines.join("\n");
}

const publicConfig = (row) =>
	row && {
		enabled: !!row.enabled,
		type: row.type,
		path: row.path,
		interval_seconds: row.interval_seconds,
		timeout_ms: row.timeout_ms,
		expected_status: row.expected_status,
		alert_enabled: !!row.alert_enabled,
		upstream_ca: row.upstream_ca ?? null,
		upstream_server_name: row.upstream_server_name ?? null,
		skip_certificate_verification: !!row.skip_certificate_verification,
	};

const publicStatus = (row, host) =>
	row && {
		state: !host.enabled || !row.enabled ? "paused" : row.state,
		checked_at: row.checked_at,
		response_ms: row.response_ms,
		status_code: row.status_code,
		message: row.message,
	};

async function getHost(access, hostId, permission) {
	await access.can(`proxy_hosts:${permission}`, hostId);
	const host = await proxyHostModel.query().findById(hostId).where("is_deleted", 0);
	if (!host) throw new errs.ItemNotFoundError(hostId);
	return host;
}

async function pruneHistory(hostId) {
	const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
	await ProxyHostMonitorCheck.query().where("host_id", hostId).where("checked_at", "<", cutoff).delete();
	const newest = await ProxyHostMonitorCheck.query()
		.select("id")
		.where("host_id", hostId)
		.orderBy("id", "desc")
		.limit(MAX_HISTORY);
	if (newest.length === MAX_HISTORY) {
		await ProxyHostMonitorCheck.query().where("host_id", hostId).where("id", "<", newest.at(-1).id).delete();
	}
}

const internalProxyHostMonitor = {
	/** @param {import("../lib/types.js").Access} access @param {number} hostId */
	async get(access, hostId) {
		const host = await getHost(access, hostId, "get");
		const monitor = await ProxyHostMonitor.query().findOne({ host_id: hostId });
		const history = monitor
			? await ProxyHostMonitorCheck.query().where("host_id", hostId).orderBy("id", "desc").limit(MAX_HISTORY)
			: [];
		return { config: publicConfig(monitor), status: publicStatus(monitor, host), history };
	},

	/** @param {import("../lib/types.js").Access} access @param {number} hostId @param {MonitorSettings} data */
	async update(access, hostId, data, options = {}) {
		const host = await getHost(access, hostId, "update");
		const config = assertMonitorConfig(data);
		if (config.skip_certificate_verification && (config.type !== "http" || host.forward_scheme !== "https")) {
			throw new errs.ValidationError("Skipping certificate verification requires an HTTPS upstream check");
		}
		if (config.enabled && config.type === "http" && !["http", "https"].includes(host.forward_scheme)) {
			throw new errs.ValidationError("HTTP checks require an HTTP or HTTPS upstream");
		}
		if (config.enabled && !resolveTarget(host, config)) {
			throw new errs.ValidationError(
				"Monitoring requires a TCP upstream; file and Unix socket targets are unsupported",
			);
		}
		const existing = await ProxyHostMonitor.query().findOne({ host_id: hostId });
		active.get(hostId)?.abort();
		const measurementChanged =
			!existing ||
			[
				"type",
				"path",
				"expected_status",
				"upstream_ca",
				"upstream_server_name",
				"skip_certificate_verification",
			].some((field) => existing[field] !== config[field]);
		const restart = measurementChanged || existing.enabled !== config.enabled;
		const next = {
			...config,
			version: (existing?.version ?? 0) + 1,
			next_check_at: null,
			...(restart
				? { state: "unknown", checked_at: null, response_ms: null, status_code: null, message: null }
				: {}),
			...(restart || existing.alert_enabled !== config.alert_enabled
				? { last_alert_at: null, last_alert_state: null }
				: {}),
		};
		if (existing) {
			const patched = await ProxyHostMonitor.query()
				.where("id", existing.id)
				.where("version", existing.version)
				.patch(next);
			if (!patched) throw new errs.ValidationError("Monitor settings changed; reload before saving");
		} else await ProxyHostMonitor.query().insert({ host_id: hostId, ...next });
		// Preserve history for alert, interval and timeout edits. A changed endpoint or
		// expected code describes a different measurement and starts a fresh history.
		if (measurementChanged) await ProxyHostMonitorCheck.query().where("host_id", hostId).delete();
		if (!options.skipAutoPush) {
			// Delayed import avoids a module cycle: GitOps itself imports this service to restore monitors.
			const { default: gitops } = await import("./gitops.js");
			gitops.triggerAutoPush("proxy-host-monitor");
		}
		return this.get(access, hostId);
	},

	/** @param {import("../lib/types.js").Access} access @param {number[]} ids */
	async listStatus(access, ids) {
		const accessData = await access.can("proxy_hosts:list");
		if (!ids.length) return [];
		const query = proxyHostModel.query().select("id", "enabled").whereIn("id", ids).where("is_deleted", 0);
		if (accessData.permission_visibility !== "all") query.where("owner_user_id", access.token.getUserId(1));
		const hosts = await query;
		const monitors = await ProxyHostMonitor.query().whereIn(
			"host_id",
			hosts.map((host) => host.id),
		);
		const hostMap = new Map(hosts.map((host) => [host.id, host]));
		return monitors.map((monitor) => ({
			host_id: monitor.host_id,
			...publicStatus(monitor, hostMap.get(monitor.host_id)),
		}));
	},

	/** @param {import("../lib/types.js").Access} access @param {number} hostId */
	async check(access, hostId) {
		const host = await getHost(access, hostId, "update");
		if (!host.enabled) throw new errs.ValidationError("Enable the proxy host before running a check");
		const config = await ProxyHostMonitor.query().findOne({ host_id: hostId });
		if (!config?.enabled) throw new errs.ValidationError("Enable monitoring before running a check");
		if (active.has(hostId)) throw new errs.ValidationError("A check is already running");
		if (active.size >= MAX_CONCURRENT) throw new errs.ValidationError("Too many checks are running");
		return this.run(hostId);
	},

	/** Scheduler and manual checks share the same single-flight implementation. */
	async run(hostId) {
		if (active.has(hostId) || active.size >= MAX_CONCURRENT) return null;
		const abort = new AbortController();
		active.set(hostId, abort);
		try {
			const config = await ProxyHostMonitor.query().findOne({ host_id: hostId });
			const host = await proxyHostModel.query().findById(hostId).where("is_deleted", 0);
			if (!config?.enabled || !host?.enabled) return null;
			const target = resolveTarget(host, config);
			const result = !target
				? { state: "down", response_ms: 0, status_code: null, message: "Unsupported upstream" }
				: config.type === "tcp"
					? await probeTcp(target, config, abort.signal)
					: await probeHttp(target, { ...config, path: target.path }, abort.signal);
			if (abort.signal.aborted) return null;
			const current = await ProxyHostMonitor.query().findById(config.id);
			const currentHost = await proxyHostModel.query().findById(hostId).where("is_deleted", 0);
			if (!current?.enabled || !currentHost?.enabled || current.version !== config.version) return null;
			const checkedAt = new Date().toISOString();
			const transition = current.state !== result.state;
			const alert = decideAlert(current, result.state, checkedAt);
			const persisted = await ProxyHostMonitor.transaction(async (trx) => {
				const patched = await ProxyHostMonitor.query(trx)
					.where("id", config.id)
					.where("version", config.version)
					.patch({
						...result,
						checked_at: checkedAt,
						last_alert_at: alert.last_alert_at,
						last_alert_state: alert.last_alert_state,
						next_check_at: new Date(Date.now() + config.interval_seconds * 1000).toISOString(),
					});
				if (!patched) return false;
				await ProxyHostMonitorCheck.query(trx).insert({
					host_id: hostId,
					checked_at: checkedAt,
					...result,
					transition,
				});
				return true;
			});
			if (!persisted) return null;
			await pruneHistory(hostId);
			if (alert.send) {
				let domains = [];
				/** @type {ProxyHostMonitor | ProxyHostMonitorCheck} */
				let previous = current;
				try {
					domains = await currentHost
						.$relatedQuery("host_domains")
						.select("domain_name")
						.orderBy("id")
						.limit(3);
				} catch (error) {
					logger.warn(`[Monitor] Could not load domains for host #${hostId}: ${error.message}`);
				}
				if (result.state === "up" && current.state !== "down" && current.last_alert_state === "down") {
					try {
						previous =
							(await ProxyHostMonitorCheck.query()
								.where({ host_id: hostId, state: "down" })
								.orderBy("checked_at", "desc")
								.first()) ?? current;
					} catch (error) {
						logger.warn(`[Monitor] Could not load previous check for host #${hostId}: ${error.message}`);
					}
				}
				// A failed notification must never change the persisted health result.
				try {
					await internalChat.sendHostMonitorAlert(
						currentHost.owner_user_id,
						formatHostMonitorAlert(hostId, config, target, result, previous, domains, checkedAt),
					);
				} catch (error) {
					logger.warn(`[Monitor] Could not deliver alert for host #${hostId}: ${error.message}`);
				}
			}
			return { ...result, checked_at: checkedAt, transition };
		} finally {
			active.delete(hostId);
		}
	},

	/** Poll only due, enabled hosts. Concurrent checks are bounded across manual and scheduled calls. */
	async tick() {
		if (scanning || active.size >= MAX_CONCURRENT) return;
		scanning = true;
		try {
			if (Date.now() - lastCleanupAt >= RETENTION_CLEANUP_MS) {
				// Paused monitors do not run probes, so trim their expired history here too.
				lastCleanupAt = Date.now();
				const cutoff = new Date(lastCleanupAt - RETENTION_DAYS * RETENTION_CLEANUP_MS).toISOString();
				await ProxyHostMonitorCheck.query().where("checked_at", "<", cutoff).delete();
				const deletedHosts = await ProxyHostMonitor.query()
					.select("host_id")
					.whereNotIn("host_id", proxyHostModel.query().select("id").where("is_deleted", 0))
					.limit(200);
				for (const monitor of deletedHosts) await this.removeHost(monitor.host_id);
			}
			const due = await ProxyHostMonitor.query()
				.join("proxy_host", "proxy_host_monitor.host_id", "proxy_host.id")
				.select("proxy_host_monitor.host_id")
				.where("proxy_host_monitor.enabled", 1)
				.where("proxy_host.enabled", 1)
				.where("proxy_host.is_deleted", 0)
				.where((builder) =>
					builder
						.whereNull("proxy_host_monitor.next_check_at")
						.orWhere("proxy_host_monitor.next_check_at", "<=", new Date().toISOString()),
				)
				.orderBy("proxy_host_monitor.next_check_at", "asc")
				.limit(MAX_CONCURRENT + active.size);
			const candidates = due.filter((row) => !active.has(row.host_id)).slice(0, MAX_CONCURRENT - active.size);
			await Promise.allSettled(candidates.map((row) => this.run(row.host_id)));
		} catch (error) {
			logger.error("[Monitor] Scheduler failed:", error);
		} finally {
			scanning = false;
		}
	},

	init() {
		if (timer) return;
		timer = setInterval(() => void this.tick(), TICK_MS);
		void this.tick();
	},

	stop() {
		if (timer) clearInterval(timer);
		timer = null;
		lastCleanupAt = 0;
		for (const controller of active.values()) controller.abort();
	},

	/** Called after a host was successfully deleted, to purge private health data. */
	async removeHost(hostId) {
		active.get(hostId)?.abort();
		await ProxyHostMonitor.transaction(async (trx) => {
			await ProxyHostMonitorCheck.query(trx).where("host_id", hostId).delete();
			await ProxyHostMonitor.query(trx).where("host_id", hostId).delete();
		});
	},

	/** Invalidate a measurement when the host's actual upstream changes. */
	async resetHost(hostId, options = {}) {
		active.get(hostId)?.abort();
		await ProxyHostMonitor.transaction(async (trx) => {
			const monitor = await ProxyHostMonitor.query(trx).findOne({ host_id: hostId });
			if (!monitor) return;
			const host = options.disableUnsupported
				? await proxyHostModel.query(trx).findById(hostId).where("is_deleted", 0)
				: null;
			const unsupported = options.disableUnsupported && (!host || !resolveTarget(host, monitor));
			// A new upstream target must never inherit the previous target's certificate exception.
			await ProxyHostMonitor.query(trx).patchAndFetchById(monitor.id, {
				...(unsupported ? { enabled: false } : {}),
				skip_certificate_verification: false,
				version: monitor.version + 1,
				state: "unknown",
				checked_at: null,
				next_check_at: null,
				response_ms: null,
				status_code: null,
				message: null,
				last_alert_at: null,
				last_alert_state: null,
			});
			await ProxyHostMonitorCheck.query(trx).where("host_id", hostId).delete();
		});
	},
};

export default internalProxyHostMonitor;
