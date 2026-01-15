/**
 * Certbot Module - Extracted from certificate.js
 * Handles Let's Encrypt certificate operations via Certbot
 */

import fs from "node:fs";
import https from "node:https";
import { ProxyAgent } from "proxy-agent";
import punycode from "punycode";
import { ssl as logger } from "../logger.js";
import utils from "../lib/utils.js";
import { installPlugin } from "../lib/certbot.js";
import dnsPlugins from "../certbot/dns-plugins.json" with { type: "json" };
import pjson from "../package.json" with { type: "json" };

// State variable for processing lock
let processing = false;

/**
 * Check if certbot is currently processing
 * @returns {boolean}
 */
export const isProcessing = () => processing;

/**
 * Request a certificate using HTTP challenge
 * @param {Object} certificate - The certificate row
 * @returns {Promise<string>}
 */
export const requestCertbot = async (certificate) => {
    logger.info(
        `Requesting Certbot certificates for Cert #${certificate.id}: ${certificate.domain_names.join(", ")}`,
    );

    const result = await utils.execFile("certbot", [
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
        throw Error(`Unknown DNS provider '${certificate.meta.dns_provider}'`);
    }
    await installPlugin(certificate.meta.dns_provider);

    logger.info(
        `Requesting LetsEncrypt certificates via ${dnsPlugin.name} for Cert #${certificate.id}: ${certificate.domain_names.join(", ")}`,
    );

    const credentialsLocation = `/data/certbot-credentials/credentials-${certificate.id}`;
    fs.writeFileSync(credentialsLocation, certificate.meta.dns_provider_credentials, { mode: 0o600 });

    const result = await utils.execFile("certbot", [
        "--config",
        "/etc/certbot.ini",
        "certonly",
        "--cert-name",
        `npm-${certificate.id}`,
        "--domains",
        certificate.domain_names.map((domain_name) => punycode.toASCII(domain_name)).join(","),
        dnsPlugin.full_plugin_name ? "--authenticator" : "--dns-" + certificate.meta.dns_provider,
        ...(dnsPlugin.full_plugin_name ? [dnsPlugin.full_plugin_name] : []),
        "--" + dnsPlugin.credentials_argument,
        credentialsLocation,
        ...(certificate.meta.propagation_seconds ? ["--dns-" + certificate.meta.dns_provider + "-propagation-seconds", certificate.meta.propagation_seconds] : []),
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
    if (processing) {
        throw new Error("Another Certbot process is currently running. Please try again later.");
    }

    processing = true;

    logger.info(
        `Renewing Certbot certificates for Cert #${certificate.id}: ${certificate.domain_names.join(", ")}`,
    );

    try {
        const renewResult = await utils.execFile("certbot", [
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
    } finally {
        processing = false;
    }
};

/**
 * Renew a certificate using DNS challenge
 * @param {Object} certificate - The certificate row
 * @returns {Promise<string>}
 */
export const renewCertbotWithDnsChallenge = async (certificate) => {
    if (processing) {
        throw new Error("Another Certbot process is currently running. Please try again later.");
    }

    processing = true;

    const dnsPlugin = dnsPlugins[certificate.meta.dns_provider];
    if (!dnsPlugin) {
        processing = false;
        throw Error(`Unknown DNS provider '${certificate.meta.dns_provider}'`);
    }

    logger.info(
        `Renewing LetsEncrypt certificates via ${dnsPlugin.name} for Cert #${certificate.id}: ${certificate.domain_names.join(", ")}`,
    );

    try {
        const renewResult = await utils.execFile("certbot", [
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
    } finally {
        processing = false;
    }
};

/**
 * Revoke a certificate
 * @param {Object} certificate - The certificate row
 * @param {boolean} [throwErrors] - Whether to throw errors
 * @returns {Promise<string|undefined>}
 */
export const revokeCertbot = async (certificate, throwErrors) => {
    logger.info(
        `Revoking Certbot certificates for Cert #${certificate.id}: ${certificate.domain_names.join(", ")}`,
    );

    try {
        const result = await utils.execFile("certbot", [
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
    const testChallengeFile = `${testChallengeDir}/test-challenge`;
    fs.mkdirSync(testChallengeDir, { recursive: true });
    fs.writeFileSync(testChallengeFile, "Success", { encoding: "utf8" });

    const results = new Map();
    for (const domain of payload.domains) {
        results.set(domain, await performTestForDomain(domain));
    }

    // Remove the test challenge file
    fs.unlinkSync(testChallengeFile);

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
export const performTestForDomain = async (domain) => {
    logger.info(`Testing http challenge for ${domain}`);
    const agent = new ProxyAgent();
    const url = `http://${punycode.toASCII(domain)}/.well-known/acme-challenge/test-challenge`;
    const formBody = `method=G&url=${encodeURI(url)}&bodytype=T&locationid=10`;
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
        logger.info(
            `HTTP challenge test failed for domain ${domain} because error was returned: ${result.error.msg}`,
        );
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
