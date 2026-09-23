import { createHash, randomBytes, timingSafeEqual, X509Certificate } from "node:crypto";
import { resolve4, resolve6 } from "node:dns/promises";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import { domainToASCII } from "node:url";
import errs from "../lib/error.js";
import internalProxyHost from "./proxy-host.js";

const PROBE_TIMEOUT_MS = 3000;
const WARNING_DAYS = 14;
const MAX_CERTIFICATE_BYTES = 256 * 1024;
const UNTRUSTED_CERTIFICATE_CODES = new Set([
	"CERT_UNTRUSTED",
	"DEPTH_ZERO_SELF_SIGNED_CERT",
	"SELF_SIGNED_CERT_IN_CHAIN",
	"UNABLE_TO_GET_ISSUER_CERT",
	"UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
	"UNABLE_TO_VERIFY_LEAF_SIGNATURE",
]);

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

const tlsFailureCode = (error) => {
	if (error?.code === "CERT_HAS_EXPIRED") return "tls.expired";
	if (error?.code === "ERR_TLS_CERT_ALTNAME_INVALID") return "tls.hostnameMismatch";
	if (UNTRUSTED_CERTIFICATE_CODES.has(error?.code)) return "tls.untrusted";
	return `tls.${failureCode(error)}`;
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

/** Only trust the certificate selected by this host, using the same provider paths as the Nginx template. */
const getConfiguredTrust = async (host) => {
	const id = host.certificate_id;
	if (!Number.isSafeInteger(id) || id < 1 || host.certificate?.id !== id) return null;
	const directory = {
		letsencrypt: "certbot/live",
		internal: "internal",
		other: "custom",
	}[host.certificate.provider];
	if (!directory) return null;
	let handle;
	try {
		handle = await fs.promises.open(`/data/tls/${directory}/npm-${id}/fullchain.pem`, "r");
		const info = await handle.stat();
		if (!info.isFile() || info.size === 0 || info.size > MAX_CERTIFICATE_BYTES) return null;
		const pem = await handle.readFile("utf8");
		const fingerprint = createHash("sha256").update(new X509Certificate(pem).raw).digest();
		return { pem, fingerprint };
	} catch {
		return null;
	} finally {
		await handle?.close();
	}
};

/** Node calls this only after verifying the chain against the configured CA. */
const checkPinnedIdentity = (expected) => (domain, certificate) => {
	const identityError = tls.checkServerIdentity(domain, certificate);
	if (identityError) return identityError;
	const actual = certificate.raw && createHash("sha256").update(certificate.raw).digest();
	if (actual && timingSafeEqual(actual, expected)) return undefined;
	return Object.assign(new Error("The served certificate differs from the configured certificate"), {
		code: "CERT_PIN_MISMATCH",
	});
};

const verifiedTlsOptions = (pin) => ({
	rejectUnauthorized: true,
	...(pin
		? {
				ca: pin.pem,
				allowPartialTrustChain: true,
				checkServerIdentity: checkPinnedIdentity(pin.fingerprint),
			}
		: {}),
});

const connectTls = (listener, domain, pin = null) =>
	new Promise((resolve, reject) => {
		const socket = tls.connect({
			host: listener.hostname,
			port: listener.port,
			servername: domain,
			...verifiedTlsOptions(pin),
		});
		socket.setTimeout(PROBE_TIMEOUT_MS, () =>
			socket.destroy(Object.assign(new errs.InternalError("Probe timeout"), { code: "ETIMEDOUT" })),
		);
		socket.once("secureConnect", () => {
			const cert = socket.getPeerCertificate();
			const identityError = cert?.raw ? tls.checkServerIdentity(domain, cert) : null;
			socket.destroy();
			resolve({ cert, identityError });
		});
		socket.once("error", reject);
	});

const checkTls = async (host, listener, domain) => {
	const checked = (check, pin = null) => ({ check, pin });
	if (!host.certificate_id) return checked(result("tls", "skip", "tls.notConfigured"));
	if (!host.enabled) return checked(result("tls", "skip", "host.disabled"));
	if (!domain) return checked(result("tls", "skip", "dns.noExactDomain"));
	if (!listener) return checked(result("tls", "skip", "listener.proxyProtocol"));
	let pin = null;
	let publiclyTrusted = true;
	try {
		let connection;
		try {
			connection = await connectTls(listener, domain);
		} catch (error) {
			if (!UNTRUSTED_CERTIFICATE_CODES.has(error?.code)) throw error;
			pin = await getConfiguredTrust(host);
			if (!pin) throw error;
			connection = await connectTls(listener, domain, pin);
			publiclyTrusted = false;
		}
		const { cert, identityError } = connection;
		const expires = Date.parse(cert?.valid_to);
		const starts = Date.parse(cert?.valid_from);
		if (!cert?.raw || !Number.isFinite(expires) || !Number.isFinite(starts)) {
			return checked(result("tls", "fail", "tls.noCertificate"));
		}
		if (starts > Date.now() || expires <= Date.now()) return checked(result("tls", "fail", "tls.expired"));
		if (identityError) return checked(result("tls", "fail", "tls.hostnameMismatch"));
		const days = Math.ceil((expires - Date.now()) / 86400000);
		if (!publiclyTrusted) return checked(result("tls", "warn", "tls.untrusted", days), pin);
		return days <= WARNING_DAYS
			? checked(result("tls", "warn", "tls.expiring", days))
			: checked(result("tls", "pass", "tls.valid", days));
	} catch (error) {
		return checked(result("tls", "fail", tlsFailureCode(error)));
	}
};

// The route probe contacts only ShieldPM's local listener, never the DNS answer.
// Do not follow redirects, forward browser cookies, or read response bodies.
const requestLocal = (listener, domain, websocket = false, websocketPath = "/", pin = null) =>
	new Promise((resolve, reject) => {
		const client = listener.scheme === "https" ? https : http;
		const request = client.request(
			{
				...listener,
				method: websocket ? "GET" : "HEAD",
				path: websocket ? websocketPath : "/",
				servername: domain,
				agent: false,
				...(listener.scheme === "https" ? verifiedTlsOptions(pin) : {}),
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

const checkRoute = async (host, listener, domain, pin) => {
	if (!host.enabled) return result("route", "skip", "host.disabled");
	if (!domain) return result("route", "skip", "dns.noExactDomain");
	if (!listener) return result("route", "skip", "listener.proxyProtocol");
	try {
		const status = await requestLocal(listener, domain, false, "/", pin);
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

const checkWebsocket = async (host, listener, domain, websocketPath, pin) => {
	if (!host.allow_websocket_upgrade) return result("websocket", "skip", "websocket.notConfigured");
	if (!host.enabled) return result("websocket", "skip", "host.disabled");
	if (!domain) return result("websocket", "skip", "dns.noExactDomain");
	if (!listener) return result("websocket", "skip", "listener.proxyProtocol");
	try {
		const status = await requestLocal(listener, domain, true, websocketPath, pin);
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
		const host = await internalProxyHost.get(access, {
			id: data.id,
			expand: ["access_list", "host_domains", "certificate"],
		});
		const websocketPath = validateWebsocketPath(data.websocket_path ?? "/");
		const domain = host.domain_names?.map(validDomain).find(Boolean) || null;
		const listener = listenerFor(host);
		const dns = await resolveDns(domain);
		const { check: tlsCheck, pin } = await checkTls(host, listener, domain);
		const [upstream, route] = await Promise.all([checkUpstream(host), checkRoute(host, listener, domain, pin)]);
		const websocket = await checkWebsocket(host, listener, domain, websocketPath, pin);
		return {
			hostId: host.id,
			domain,
			checkedAt: new Date().toISOString(),
			checks: [dns, tlsCheck, route, upstream, checkAuth(host, route), websocket],
		};
	},
};

export default internalProxyHostDiagnostics;
