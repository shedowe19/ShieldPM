/**
 * Certbot Module - Extracted from certificate.js
 * Handles Let's Encrypt certificate operations via Certbot
 */

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import https from "node:https";
import punycode from "node:punycode";
import { ProxyAgent } from "proxy-agent";
import dnsPlugins from "../certbot/dns-plugins.json" with { type: "json" };
import { installPlugin } from "../lib/certbot.js";
import errs from "../lib/error.js";
import utils from "../lib/utils.js";
import { ssl as logger } from "../logger.js";
import pjson from "../package.json" with { type: "json" };

// State variable for processing lock
let processing = false;

/**
 * Check if certbot is currently processing
 * @returns {boolean}
 */
export const isProcessing = () => processing;

/** Execute all ACME operations under the same lock, including scheduled renewals. */
export const runCertbot = async (args) => {
	if (processing) {
		throw new errs.ValidationError("Another Certbot process is currently running. Please try again later.");
	}
	processing = true;
	try {
		return await utils.execFile("certbot", args);
	} finally {
		processing = false;
	}
};

/**
 * Request a certificate using HTTP challenge
 * @param {Object} certificate - The certificate row
 * @returns {Promise<string>}
 */
export const requestCertbot = async (certificate) => {
	logger.info(`Requesting Certbot certificates for Cert #${certificate.id}: ${certificate.domain_names.join(", ")}`);

	const result = await runCertbot([
		"--config",
		"/etc/certbot.ini",
		"certonly",
		"--cert-name",
		`npm-${certificate.id}`,
		"--domains",
		certificate.domain_names.map((domain_name) => punycode.toASCII(domain_name)).join(","),
		"--server",
		process.env.ACME_SERVER,
		"--authenticator",
		"webroot",
	]);
	logger.success(result);
	return result;
};

/**
 * Request a certificate using DNS challenge
 * @param {Object} certificate - The certificate row
 * @returns {Promise<string>}
 */
export const requestCertbotWithDnsChallenge = async (certificate) => {
	const dnsPlugin = dnsPlugins[certificate.meta.dns_provider];
	if (!dnsPlugin) {
		throw new errs.ValidationError(`Unknown DNS provider '${certificate.meta.dns_provider}'`);
	}
	await installPlugin(certificate.meta.dns_provider);

	logger.info(
		`Requesting LetsEncrypt certificates via ${dnsPlugin.name} for Cert #${certificate.id}: ${certificate.domain_names.join(", ")}`,
	);

	const credentialsLocation = `/data/certbot-credentials/credentials-${certificate.id}`;
	await fs.promises.mkdir("/data/certbot-credentials", { recursive: true });
	await fs.promises.writeFile(credentialsLocation, certificate.meta.dns_provider_credentials, { mode: 0o600 });
	await fs.promises.chmod(credentialsLocation, 0o600);

	// Determine the credentials argument - use defined value or fall back to standard pattern
	const credentialsArg = dnsPlugin.credentials_argument || `dns-${certificate.meta.dns_provider}-credentials`;

	const result = await runCertbot([
		"--config",
		"/etc/certbot.ini",
		"certonly",
		"--cert-name",
		`npm-${certificate.id}`,
		"--domains",
		certificate.domain_names.map((domain_name) => punycode.toASCII(domain_name)).join(","),
		dnsPlugin.full_plugin_name ? "--authenticator" : `--dns-${certificate.meta.dns_provider}`,
		...(dnsPlugin.full_plugin_name ? [dnsPlugin.full_plugin_name] : []),
		`--${credentialsArg}`,
		credentialsLocation,
		...(certificate.meta.propagation_seconds
			? [
					`--dns-${certificate.meta.dns_provider}-propagation-seconds`,
					String(certificate.meta.propagation_seconds),
				]
			: []),
		"--server",
		process.env.ACME_SERVER,
	]);
	logger.success(result);
	return result;
};

/**
 * Renew a certificate using HTTP challenge
 * @param {Object} certificate - The certificate row
 * @returns {Promise<string>}
 */
export const renewCertbot = async (certificate) => {
	logger.info(`Renewing Certbot certificates for Cert #${certificate.id}: ${certificate.domain_names.join(", ")}`);

	const renewResult = await runCertbot([
		"--config",
		"/etc/certbot.ini",
		"renew",
		"--server",
		process.env.ACME_SERVER,
		"--cert-name",
		`npm-${certificate.id}`,
		"--force-renewal",
	]);
	logger.info(renewResult);
	return renewResult;
};

/**
 * Renew a certificate using DNS challenge
 * @param {Object} certificate - The certificate row
 * @returns {Promise<string>}
 */
export const renewCertbotWithDnsChallenge = async (certificate) => {
	const dnsPlugin = dnsPlugins[certificate.meta.dns_provider];
	if (!dnsPlugin) {
		throw new errs.ValidationError(`Unknown DNS provider '${certificate.meta.dns_provider}'`);
	}

	logger.info(
		`Renewing LetsEncrypt certificates via ${dnsPlugin.name} for Cert #${certificate.id}: ${certificate.domain_names.join(", ")}`,
	);

	const renewResult = await runCertbot([
		"--config",
		"/etc/certbot.ini",
		"renew",
		"--server",
		process.env.ACME_SERVER,
		"--cert-name",
		`npm-${certificate.id}`,
		"--force-renewal",
	]);
	logger.info(renewResult);
	return renewResult;
};

/**
 * Revoke a certificate
 * @param {Object} certificate - The certificate row
 * @param {boolean} [throwErrors] - Whether to throw errors
 * @returns {Promise<string|undefined>}
 */
export const revokeCertbot = async (certificate, throwErrors) => {
	logger.info(`Revoking Certbot certificates for Cert #${certificate.id}: ${certificate.domain_names.join(", ")}`);

	try {
		const result = await runCertbot([
			"--config",
			"/etc/certbot.ini",
			"revoke",
			"--cert-name",
			`npm-${certificate.id}`,
			"--reason",
			"unspecified",
			"--delete-after-revoke",
		]);
		fs.rmSync(`/data/tls/certbot/live/npm-${certificate.id}.der`, { force: true });
		logger.info(result);
		return result;
	} catch (err) {
		logger.error(err.message);
		if (throwErrors) {
			throw err;
		}
	}
};

/**
 * Test HTTP challenge for domains
 * @param {Object} access - Access object
 * @param {Object} payload - Payload with domains array
 * @returns {Promise<Object>}
 */
export const testHttpsChallenge = async (access, payload) => {
	await access.can("certificates:list");

	// Create a test challenge file
	const dataPath = process.env.DATA_PATH || "/data";
	const testChallengeDir = `${dataPath}/acme-challenge/.well-known/acme-challenge`;
	const challengeName = `test-challenge-${randomUUID()}`;
	const testChallengeFile = `${testChallengeDir}/${challengeName}`;
	await fs.promises.mkdir(testChallengeDir, { recursive: true });
	await fs.promises.writeFile(testChallengeFile, "Success", { encoding: "utf8" });

	const results = new Map();
	try {
		for (const domain of payload.domains) {
			results.set(domain, await performTestForDomain(domain, challengeName));
		}
	} finally {
		await fs.promises.rm(testChallengeFile, { force: true });
	}

	const finalResult = Object.create(null);
	for (const [domain, result] of results) {
		Object.defineProperty(finalResult, domain, {
			value: result,
			enumerable: true,
			writable: true,
			configurable: true,
		});
	}

	return finalResult;
};

/**
 * Perform HTTP challenge test for a domain
 * @param {string} domain - Domain name
 * @returns {Promise<string>}
 */
export const performTestForDomain = async (domain, challengeName = "test-challenge") => {
	logger.info(`Testing http challenge for ${domain}`);
	const agent = new ProxyAgent();
	const url = `http://${punycode.toASCII(domain)}/.well-known/acme-challenge/${challengeName}`;
	const formBody = new URLSearchParams({ method: "G", url, bodytype: "T", locationid: "10" }).toString();
	const options = {
		method: "POST",
		headers: {
			"User-Agent": `ShieldPM/${pjson.version}`,
			"Content-Type": "application/x-www-form-urlencoded",
			"Content-Length": Buffer.byteLength(formBody),
		},
		agent,
	};

	const result = await new Promise((resolve) => {
		const req = https.request("https://www.site24x7.com/tools/restapi-tester", options, (res) => {
			let responseBody = "";
			res.on("error", () => resolve(undefined));
			res.on("aborted", () => resolve(undefined));

			res.on("data", (chunk) => {
				responseBody = responseBody + chunk;
			});

			res.on("end", () => {
				try {
					const parsedBody = JSON.parse(`${responseBody}`);
					if (res.statusCode !== 200) {
						logger.warn(
							`Failed to test HTTP challenge for domain ${domain} because HTTP status code ${res.statusCode} was returned: ${parsedBody.message}`,
						);
						resolve(undefined);
					} else {
						resolve(parsedBody);
					}
				} catch (err) {
					if (res.statusCode !== 200) {
						logger.warn(
							`Failed to test HTTP challenge for domain ${domain} because HTTP status code ${res.statusCode} was returned`,
						);
					} else {
						logger.warn(
							`Failed to test HTTP challenge for domain ${domain} because response failed to be parsed: ${err.message}`,
						);
					}
					resolve(undefined);
				}
			});
		});

		req.setTimeout(15000, () => {
			req.destroy();
			resolve(undefined);
		});

		// Make sure to write the request body.
		req.write(formBody);
		req.end();
		req.on("error", (e) => {
			logger.warn(`Failed to test HTTP challenge for domain ${domain}`, e);
			resolve(undefined);
		});
	});

	if (!result) {
		// Some error occurred while trying to get the data
		return "failed";
	}
	if (result.error) {
		logger.info(`HTTP challenge test failed for domain ${domain} because error was returned: ${result.error.msg}`);
		return `other:${result.error.msg}`;
	}
	if (`${result.responsecode}` === "200" && result.htmlresponse === "Success") {
		// Server exists and has responded with the correct data
		return "ok";
	}
	if (`${result.responsecode}` === "200") {
		// Server exists but has responded with wrong data
		logger.info(
			`HTTP challenge test failed for domain ${domain} because of invalid returned data:`,
			result.htmlresponse,
		);
		return "wrong-data";
	}
	if (`${result.responsecode}` === "404") {
		// Server exists but responded with a 404
		logger.info(`HTTP challenge test failed for domain ${domain} because code 404 was returned`);
		return "404";
	}
	if (
		`${result.responsecode}` === "0" ||
		(typeof result.reason === "string" && result.reason.toLowerCase() === "host unavailable")
	) {
		// Server does not exist at domain
		logger.info(`HTTP challenge test failed for domain ${domain} the host was not found`);
		return "no-host";
	}
	// Other errors
	logger.info(`HTTP challenge test failed for domain ${domain} because code ${result.responsecode} was returned`);
	return `other:${result.responsecode}`;
};

/**
 * Get the live certificate path
 * @param {number} certificateId - Certificate ID
 * @returns {string}
 */
export const getLiveCertPath = (certificateId) => {
	return `/data/tls/certbot/live/npm-${certificateId}`;
};
