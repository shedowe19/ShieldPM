import { randomBytes } from "node:crypto";
import { resolve4, resolve6 } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import { domainToASCII } from "node:url";
import errs from "../lib/error.js";
import internalProxyHost from "./proxy-host.js";

const PROBE_TIMEOUT_MS = 3000;
const WARNING_DAYS = 14;

const result = (key, status, message, detail) => ({
	key,
	status,
	message,
	...(detail === undefined ? {} : { detail: String(detail) }),
});

const bounded = async (promise) => {
	let timer;
	try {
		return await Promise.race([
			promise,
			new Promise((_, reject) => {
				timer = setTimeout(
					() => reject(Object.assign(new errs.InternalError("Probe timeout"), { code: "ETIMEDOUT" })),
					PROBE_TIMEOUT_MS,
				);
			}),
		]);
	} finally {
		clearTimeout(timer);
	}
};

/** Permit a path within the same configured host, never a URL or encoded escape. */
export const validateWebsocketPath = (path) => {
	if (
		typeof path !== "string" ||
		path.length > 256 ||
		!/^\/(?!\/)[A-Za-z0-9._~!$&'()+,;=:@/-]*$/.test(path) ||
		path.includes("//") ||
		path.split("/").some((part) => part === "." || part === "..")
	) {
		throw new errs.ValidationError("WebSocket path must be a relative path on this host (max. 256 characters)");
	}
	return path;
};

// Never let raw resolver, TLS, proxy or upstream errors reach the browser. These
// errors may contain internal IP addresses, private paths or provider details.
const failureCode = (error) => {
	if (error?.code === "ECONNREFUSED") return "connectionRefused";
	if (error?.code === "ETIMEDOUT") return "timeout";
	if (error?.code === "ENOTFOUND" || error?.code === "EAI_AGAIN") return "nameResolution";
	return "unreachable";
};

const validDomain = (name) => {
	if (typeof name !== "string" || name.startsWith("*.")) return null;
	const ascii = domainToASCII(name);
	if (
		!ascii ||
		ascii.length > 253 ||
		!ascii
			.split(".")
			.every((part) => part.length > 0 && part.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(part))
	)
		return null;
	return ascii;
};

const listenAddress = () => {
	const configured = process.env.IPV4_BINDING || "0.0.0.0";
	return net.isIP(configured) === 4 && configured !== "0.0.0.0" ? configured : "127.0.0.1";
};

const port = (value, fallback) => {
	const parsed = Number(value || fallback);
	return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535 ? parsed : fallback;
};

const listenerFor = (host) => {
	if (process.env.LISTEN_PROXY_PROTOCOL === "true") return null;
	if (host.certificate_id > 0) {
		return { scheme: "https", hostname: listenAddress(), port: port(process.env.HTTPS_PORT, 443) };
	}
	if (process.env.DISABLE_HTTP === "true") {
		return { scheme: "http", socketPath: `/run/shieldpm/nginx-${host.id}.sock` };
	}
	return { scheme: "http", hostname: listenAddress(), port: port(process.env.HTTP_PORT, 80) };
};

const resolveDns = async (domain) => {
	if (!domain) return result("dns", "skip", "dns.noExactDomain");
	const [a, aaaa] = await Promise.allSettled([bounded(resolve4(domain)), bounded(resolve6(domain))]);
	const ipv4 = a.status === "fulfilled" ? a.value.length : 0;
	const ipv6 = aaaa.status === "fulfilled" ? aaaa.value.length : 0;
	return ipv4 || ipv6
		? result("dns", "pass", "dns.resolved", `A: ${ipv4}, AAAA: ${ipv6}`)
		: result("dns", "fail", "dns.unresolved");
};

const connectTls = (listener, domain) =>
	new Promise((resolve, reject) => {
		const socket = tls.connect({
			host: listener.hostname,
			port: listener.port,
			servername: domain,
			rejectUnauthorized: false,
		});
		socket.setTimeout(PROBE_TIMEOUT_MS, () =>
			socket.destroy(Object.assign(new errs.InternalError("Probe timeout"), { code: "ETIMEDOUT" })),
		);
		socket.once("secureConnect", () => {
			const cert = socket.getPeerCertificate();
			const authorized = socket.authorized;
			const identityError = cert?.raw ? tls.checkServerIdentity(domain, cert) : null;
			socket.destroy();
			resolve({ cert, authorized, identityError });
		});
		socket.once("error", reject);
	});

const checkTls = async (host, listener, domain) => {
	if (!host.certificate_id) return result("tls", "skip", "tls.notConfigured");
	if (!host.enabled) return result("tls", "skip", "host.disabled");
	if (!domain) return result("tls", "skip", "dns.noExactDomain");
	if (!listener) return result("tls", "skip", "listener.proxyProtocol");
	try {
		const { cert, authorized, identityError } = await connectTls(listener, domain);
		const expires = Date.parse(cert?.valid_to);
		const starts = Date.parse(cert?.valid_from);
		if (!cert?.raw || !Number.isFinite(expires) || !Number.isFinite(starts)) {
			return result("tls", "fail", "tls.noCertificate");
		}
		if (starts > Date.now() || expires <= Date.now()) return result("tls", "fail", "tls.expired");
		if (identityError) return result("tls", "fail", "tls.hostnameMismatch");
		const days = Math.ceil((expires - Date.now()) / 86400000);
		if (!authorized) return result("tls", "warn", "tls.untrusted", days);
		return days <= WARNING_DAYS
			? result("tls", "warn", "tls.expiring", days)
			: result("tls", "pass", "tls.valid", days);
	} catch (error) {
		return result("tls", "fail", `tls.${failureCode(error)}`);
	}
};

// The route probe contacts only ShieldPM's local listener, never the DNS answer.
// Do not follow redirects, forward browser cookies, or read response bodies.
const requestLocal = (listener, domain, websocket = false, websocketPath = "/") =>
	new Promise((resolve, reject) => {
		const client = listener.scheme === "https" ? https : http;
		const request = client.request(
			{
				...listener,
				method: websocket ? "GET" : "HEAD",
				path: websocket ? websocketPath : "/",
				servername: domain,
				rejectUnauthorized: false,
				headers: {
					Host: domain,
					Connection: websocket ? "Upgrade" : "close",
					...(websocket
						? {
								Upgrade: "websocket",
								"Sec-WebSocket-Version": "13",
								"Sec-WebSocket-Key": randomBytes(16).toString("base64"),
							}
						: {}),
				},
			},
			(response) => {
				const status = response.statusCode || 0;
				response.destroy();
				resolve(status);
			},
		);
		request.setTimeout(PROBE_TIMEOUT_MS, () =>
			request.destroy(Object.assign(new errs.InternalError("Probe timeout"), { code: "ETIMEDOUT" })),
		);
		request.once("upgrade", (response, socket) => {
			socket.destroy();
			resolve(response.statusCode || 101);
		});
		request.once("error", reject);
		request.end();
	});

/** @returns {Promise<void>} */
const tcpReachable = (hostname, targetPort) =>
	new Promise((resolve, reject) => {
		const socket = net.createConnection({ host: hostname, port: targetPort });
		// A socket inactivity timeout may start only after DNS/connect. An explicit
		// timer also bounds name resolution for a configured upstream hostname.
		const timer = setTimeout(
			() => socket.destroy(Object.assign(new errs.InternalError("Probe timeout"), { code: "ETIMEDOUT" })),
			PROBE_TIMEOUT_MS,
		);
		socket.once("close", () => clearTimeout(timer));
		socket.once("connect", () => {
			socket.destroy();
			resolve();
		});
		socket.once("error", reject);
	});

const checkUpstream = async (host) => {
	if (!["http", "https", "grpc", "grpcs", "terminal"].includes(host.forward_scheme)) {
		return result("upstream", "skip", "upstream.notNetworkService");
	}
	// Nginx splits a base path from forward_host before opening the upstream;
	// terminal proxies instead connect to their dedicated SSH target.
	const rawHost = host.forward_scheme === "terminal" ? host.terminal_host : host.forward_host?.split("/")[0];
	const targetPort = host.forward_scheme === "terminal" ? host.terminal_port || 22 : host.forward_port;
	const hostname = typeof rawHost === "string" && /^\[[0-9a-f:]+\]$/i.test(rawHost) ? rawHost.slice(1, -1) : rawHost;
	const validHost = net.isIP(hostname) || validDomain(hostname);
	if (!validHost || !Number.isInteger(targetPort) || targetPort < 1 || targetPort > 65535) {
		return result("upstream", "skip", "upstream.unsupportedAddress");
	}
	try {
		await tcpReachable(hostname, targetPort);
		return result("upstream", "pass", "upstream.connected");
	} catch (error) {
		return result("upstream", "fail", `upstream.${failureCode(error)}`);
	}
};

const checkRoute = async (host, listener, domain) => {
	if (!host.enabled) return result("route", "skip", "host.disabled");
	if (!domain) return result("route", "skip", "dns.noExactDomain");
	if (!listener) return result("route", "skip", "listener.proxyProtocol");
	try {
		const status = await requestLocal(listener, domain);
		if (status >= 500) return result("route", "fail", "route.serverError", status);
		if (status >= 300 && status < 400) return result("route", "pass", "route.redirect", status);
		if (status === 401 || status === 403) return result("route", "warn", "route.protected", status);
		if (status >= 200 && status < 300) return result("route", "pass", "route.reached", status);
		return result("route", "warn", "route.httpError", status);
	} catch (error) {
		return result("route", "fail", `route.${failureCode(error)}`);
	}
};

const checkAuth = (host, route) => {
	if (!host.access_list_id) return result("auth", "skip", "auth.notConfigured");
	if (route.status === "skip" || route.status === "fail") return result("auth", "skip", "auth.routeUnavailable");
	const status = Number(route.detail);
	if ([301, 302, 303, 307, 308, 401, 403].includes(status)) return result("auth", "pass", "auth.challenge", status);
	// Local probes may be allowlisted by IP or `satisfy any`. A 2xx response
	// cannot determine whether unauthenticated external clients are allowed.
	if (status >= 200 && status < 300) return result("auth", "skip", "auth.indeterminate", status);
	return result("auth", "warn", "auth.unexpectedResponse", status);
};

const checkWebsocket = async (host, listener, domain, websocketPath) => {
	if (!host.allow_websocket_upgrade) return result("websocket", "skip", "websocket.notConfigured");
	if (!host.enabled) return result("websocket", "skip", "host.disabled");
	if (!domain) return result("websocket", "skip", "dns.noExactDomain");
	if (!listener) return result("websocket", "skip", "listener.proxyProtocol");
	try {
		const status = await requestLocal(listener, domain, true, websocketPath);
		if (status === 101) return result("websocket", "pass", "websocket.upgraded", status);
		if ((status >= 300 && status < 400) || status === 401 || status === 403) {
			return result("websocket", "warn", "websocket.authProtected", status);
		}
		if (status >= 500) return result("websocket", "fail", "websocket.serverError", status);
		return result("websocket", "warn", "websocket.notUpgraded", status);
	} catch (error) {
		return result("websocket", "fail", `websocket.${failureCode(error)}`);
	}
};

const internalProxyHostDiagnostics = {
	/**
	 * On-demand, read-only diagnosis of one authorized proxy host. There is no
	 * caller-controlled URL, host, port, header or credential in this operation.
	 * The optional WebSocket path stays on the same authorized host.
	 * @param {import("../lib/types.js").Access} access
	 * @param {{id: number, websocket_path?: string}} data
	 * @returns {Promise<{hostId: number, domain: string|null, checkedAt: string, checks: object[]}>}
	 */
	diagnose: async (access, data) => {
		const host = await internalProxyHost.get(access, { id: data.id, expand: ["access_list", "host_domains"] });
		const websocketPath = validateWebsocketPath(data.websocket_path ?? "/");
		const domain = host.domain_names?.map(validDomain).find(Boolean) || null;
		const listener = listenerFor(host);
		const dns = await resolveDns(domain);
		const [tlsCheck, upstream, route] = await Promise.all([
			checkTls(host, listener, domain),
			checkUpstream(host),
			checkRoute(host, listener, domain),
		]);
		const websocket = await checkWebsocket(host, listener, domain, websocketPath);
		return {
			hostId: host.id,
			domain,
			checkedAt: new Date().toISOString(),
			checks: [dns, tlsCheck, route, upstream, checkAuth(host, route), websocket],
		};
	},
};

export default internalProxyHostDiagnostics;
