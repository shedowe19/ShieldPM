import { execFile } from "node:child_process";
import util from "node:util";
import { global as logger } from "../../logger.js";
import { getArchiveCertPath, getLiveCertPath, getRenewalConfigPath } from "./paths.js";

const execFileAsync = util.promisify(execFile);

const runCertbot = async (args) => {
	const fullArgs = ["--config", "/etc/letsencrypt/cli.ini", ...args];
	logger.info(`[certbot] certbot ${fullArgs.join(" ")}`);
	const result = await execFileAsync("certbot", fullArgs, { env: process.env, maxBuffer: 10 * 1024 * 1024 });
	return `${result.stdout || ""}${result.stderr || ""}`.trim();
};

const requestCertbot = async (certificate) => {
	const domains = (certificate.domain_names || []).flatMap((domain) => ["-d", domain]);
	return runCertbot(["certonly", "--non-interactive", "--agree-tos", "--expand", "--cert-name", `npm-${certificate.id}`, "--webroot", "-w", "/data/letsencrypt-acme-challenge", ...domains]);
};

const requestCertbotWithDnsChallenge = async (certificate) => {
	const domains = (certificate.domain_names || []).flatMap((domain) => ["-d", domain]);
	const provider = certificate.meta?.dns_provider;
	const credentials = certificate.meta?.dns_provider_credentials_file || certificate.meta?.dns_provider_credentials;
	const propagation = String(certificate.meta?.dns_provider_propagation_seconds || 30);
	const args = [
		"certonly",
		"--non-interactive",
		"--agree-tos",
		"--expand",
		"--cert-name",
		`npm-${certificate.id}`,
		`--dns-${provider}`,
		`--dns-${provider}-credentials`,
		credentials,
		`--dns-${provider}-propagation-seconds`,
		propagation,
		...domains,
	];
	return runCertbot(args);
};

const renewCertbot = async (certificate) => {
	return runCertbot(["renew", "--cert-name", `npm-${certificate.id}`]);
};

const renewCertbotWithDnsChallenge = async (certificate) => {
	const provider = certificate.meta?.dns_provider;
	const credentials = certificate.meta?.dns_provider_credentials_file || certificate.meta?.dns_provider_credentials;
	const propagation = String(certificate.meta?.dns_provider_propagation_seconds || 30);
	return runCertbot([
		"renew",
		"--cert-name",
		`npm-${certificate.id}`,
		`--dns-${provider}`,
		`--dns-${provider}-credentials`,
		credentials,
		`--dns-${provider}-propagation-seconds`,
		propagation,
	]);
};

const revokeCertbot = async (certificate, throwErrors = true) => {
	try {
		return await runCertbot(["revoke", "--cert-path", `${getLiveCertPath(certificate.id)}/cert.pem`, "--delete-after-revoke", "--non-interactive"]);
	} catch (err) {
		if (throwErrors) throw err;
		logger.warn(`[certbot] revoke failed for #${certificate.id}: ${err.message}`);
		return null;
	}
};

const performTestForDomain = async (domain) => {
	const response = await fetch(`http://${domain}/.well-known/acme-challenge/npm-test`);
	return response.ok;
};

const testHttpsChallenge = async (_access, payload) => {
	const domains = payload.domain_names || [];
	const results = await Promise.all(domains.map(async (domain) => ({ domain, ok: await performTestForDomain(domain).catch(() => false) })));
	return {
		success: results.every((r) => r.ok),
		results,
	};
};

export default {
	getLiveCertPath,
	getArchiveCertPath,
	getRenewalConfigPath,
	requestCertbot,
	requestCertbotWithDnsChallenge,
	renewCertbot,
	renewCertbotWithDnsChallenge,
	revokeCertbot,
	testHttpsChallenge,
	performTestForDomain,
};
