import fs from "node:fs";
import { ensureInitialSetupOwnership } from "./internal/initial-setup.js";
import internalNginx from "./internal/nginx.js";
import { installPlugins } from "./lib/certbot.js";
import utils from "./lib/utils.js";
import { setup as logger } from "./logger.js";
import certificateModel from "./models/certificate.js";
import deadModel from "./models/dead_host.js";
import proxyModel from "./models/proxy_host.js";
import redirectionModel from "./models/redirection_host.js";
import settingModel from "./models/setting.js";
import streamModel from "./models/stream.js";
import userModel from "./models/user.js";

export const isSetup = async () => {
	const row = await userModel.query().select("id").where("is_deleted", 0).first();
	return row?.id > 0;
};

/**
 * Creates default settings if they don't already exist in the database
 *
 * @returns {Promise<void>}
 */
const setupDefaultSettings = async () => {
	let rowds = await settingModel.query().select("id").where({ id: "default-site" }).first();
	if (!rowds?.id) {
		await settingModel.query().insert({
			id: "default-site",
			name: "Default Site",
			description: "What to show when Nginx is hit with an unknown Host",
			value: process.env.INITIAL_DEFAULT_PAGE || "",
			meta: {},
		});
		logger.info("Default settings added");
		rowds = await settingModel.query().select("id").where({ id: "default-site" }).first();
	}

	const rowoidc = await settingModel.query().select("id").where({ id: "oidc-config" }).first();
	if (!rowoidc?.id) {
		await settingModel.query().insert({
			id: "oidc-config",
			name: "Open ID Connect",
			description: "Sign in to ShieldPM with an external Identity Provider",
			value: "metadata",
			meta: {},
		});
		logger.info("Added oidc-config setting");
	}

	await internalNginx.generateConfig("default", rowds);
};

/**
 * Installs all Certbot plugins which are required for an installed certificate
 *
 * @returns {Promise<void>}
 */
const setupCertbotPlugins = async () => {
	// Ensure directory exists
	try {
		if (!fs.existsSync("/data/certbot-credentials")) {
			fs.mkdirSync("/data/certbot-credentials");
		}
	} catch (err) {
		logger.error(`Could not create /data/certbot-credentials: ${err.message}`);
	}

	// Symlink for legacy certificates
	try {
		const linkPath = "/tmp/certbot-credentials";
		if (fs.existsSync(linkPath)) {
			const stats = fs.lstatSync(linkPath);
			if (stats.isDirectory()) {
				fs.rmSync(linkPath, { recursive: true, force: true });
			} else {
				// It's a file or symlink, remove it to be safe
				fs.unlinkSync(linkPath);
			}
		}
		fs.symlinkSync("/data/certbot-credentials", linkPath);
	} catch (err) {
		logger.error(`Could not create symlink for legacy certs: ${err.message}`);
	}

	// Ensure other certbot directories exist
	try {
		const dirs = ["/data/certbot-log", "/data/certbot-work", "/data/acme-challenge", "/data/tls/certbot"];
		for (const dir of dirs) {
			if (!fs.existsSync(dir)) {
				fs.mkdirSync(dir, { recursive: true });
			}
		}
	} catch (err) {
		logger.error(`Could not create certbot directories: ${err.message}`);
	}

	const certificates = await certificateModel.query().where("is_deleted", 0).andWhere("provider", "letsencrypt");

	if (certificates?.length) {
		const plugins = [];

		for (const certificate of certificates) {
			if (certificate.meta && certificate.meta.dns_challenge === true) {
				if (plugins.indexOf(certificate.meta.dns_provider) === -1) {
					plugins.push(certificate.meta.dns_provider);
				}

				await fs.promises.writeFile(
					`/data/certbot-credentials/credentials-${certificate.id}`,
					certificate.meta.dns_provider_credentials,
					{ mode: 0o600 },
				);
			}
		}

		if (plugins.length) {
			await installPlugins(plugins);
			logger.info(`Added Certbot plugins ${plugins.join(", ")}`);
		}
	}
};

/**
 * regenerate all hosts if needed
 *
 * @returns {Promise<void>}
 */
const regenerateAllHosts = async () => {
	if (process.env.REGENERATE_ALL === "true") {
		const proxy_hosts = await proxyModel
			.query()
			.where("is_deleted", 0)
			.andWhere("enabled", 1)
			.withGraphFetched("[certificate, access_list.[clients,items]]");

		if (proxy_hosts?.length) {
			await internalNginx.bulkGenerateConfigs(proxyModel, "proxy_host", proxy_hosts);
		}

		const redirection_hosts = await redirectionModel
			.query()
			.where("is_deleted", 0)
			.andWhere("enabled", 1)
			.withGraphFetched("[certificate]");

		if (redirection_hosts?.length) {
			await internalNginx.bulkGenerateConfigs(redirectionModel, "redirection_host", redirection_hosts);
		}

		const dead_hosts = await deadModel
			.query()
			.where("is_deleted", 0)
			.andWhere("enabled", 1)
			.withGraphFetched("[certificate]");

		if (dead_hosts?.length) {
			await internalNginx.bulkGenerateConfigs(deadModel, "proxy_host", dead_hosts);
		}

		const streams = await streamModel
			.query()
			.where("is_deleted", 0)
			.andWhere("enabled", 1)
			.withGraphFetched("[certificate]");

		if (streams?.length) {
			await internalNginx.bulkGenerateConfigs(streamModel, "stream", streams);
		}

		utils.writeHash();
	}
};

export default async () => {
	await ensureInitialSetupOwnership();
	await setupDefaultSettings();
	await setupCertbotPlugins();
	await regenerateAllHosts();
};
