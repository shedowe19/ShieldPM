import dns from "node:dns/promises";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import errs from "./error.js";
import { isPublicAddress, validateSourceUrl } from "./firewall-download.js";

/** Reuse the firewall feed policy: public HTTPS, no userinfo, fragments or private destinations. */
export function validateNotificationUrl(value, type = "webhook") {
	let url;
	try {
		url = validateSourceUrl(value);
	} catch (error) {
		throw new errs.ValidationError(
			"Notification endpoint must be a public HTTPS URL without URL credentials",
			error,
		);
	}
	if (
		type === "discord" &&
		(!/^(?:canary\.|ptb\.)?discord\.com$/i.test(url.hostname) ||
			!/^\/api(?:\/v\d+)?\/webhooks\/\d+\/[\w-]+$/.test(url.pathname))
	)
		throw new errs.ValidationError("Discord requires a discord.com API webhook URL");
	return url;
}

/** Bounded POST with DNS answers pinned to the socket; redirects never receive secrets or payloads. */
export async function deliverNotification(target, secret, payload, deliveryId, signal) {
	const url = validateNotificationUrl(secret.url, target.type);
	const hostname = url.hostname.replace(/^\[|\]$/g, "");
	const deadline = AbortSignal.timeout(10_000);
	const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
	combined.throwIfAborted();
	let cancelResolution;
	const aborted = new Promise((_, reject) => {
		cancelResolution = () => reject(new errs.InternalError("Notification request timed out"));
		combined.addEventListener("abort", cancelResolution, { once: true });
	});
	let addresses;
	try {
		addresses = net.isIP(hostname)
			? [{ address: hostname, family: net.isIP(hostname) }]
			: await Promise.race([dns.lookup(hostname, { all: true, verbatim: true }), aborted]);
	} finally {
		combined.removeEventListener("abort", cancelResolution);
	}
	combined.throwIfAborted();
	if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address)))
		throw new errs.ValidationError("Notification endpoint must resolve only to public IP addresses");
	const text = `ShieldPM ${payload.state.toUpperCase()}: host #${payload.host_id}, incident #${payload.incident_id}\n${payload.message}\n${payload.checked_at}`;
	const body =
		target.type === "ntfy"
			? text
			: JSON.stringify(target.type === "discord" ? { content: text, allowed_mentions: { parse: [] } } : payload);
	const headers = {
		Host: url.host,
		"Content-Type": target.type === "ntfy" ? "text/plain; charset=utf-8" : "application/json",
		"Content-Length": Buffer.byteLength(body),
		"User-Agent": "ShieldPM-Notifications/1",
		"Idempotency-Key": `shieldpm-delivery-${deliveryId}`,
		...(secret.token ? { Authorization: `Bearer ${secret.token}` } : {}),
	};
	return new Promise((resolve, reject) => {
		const request = https.request(
			{
				hostname: "shieldpm-notification.invalid",
				port: url.port || 443,
				path: `${url.pathname}${url.search}`,
				method: "POST",
				agent: false,
				signal: combined,
				rejectUnauthorized: true,
				servername: net.isIP(hostname) ? "" : hostname,
				checkServerIdentity: (_servername, certificate) => tls.checkServerIdentity(hostname, certificate),
				lookup: (_name, options, callback) => {
					const candidates = options.family
						? addresses.filter((item) => item.family === options.family)
						: addresses;
					if (!candidates.length)
						callback(new errs.InternalError("Notification address family is unavailable"), "", 4);
					else if (options.all) callback(null, candidates);
					else callback(null, candidates[0].address, candidates[0].family);
				},
				headers,
			},
			(response) => {
				response.on("error", () => {});
				response.destroy();
				if (response.statusCode >= 200 && response.statusCode < 300) resolve(response.statusCode);
				else reject(new errs.InternalError(`Notification endpoint returned HTTP ${response.statusCode}`));
			},
		);
		request.on("error", (error) => reject(new errs.InternalError("Notification connection failed", error)));
		request.end(body);
	});
}
