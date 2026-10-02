import { createPrivateKey, randomUUID, X509Certificate } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import errs from "../lib/error.js";
import utils from "../lib/utils.js";
import { nginx as logger } from "../logger.js";
import certificateModel from "../models/certificate.js";
import deadHostModel from "../models/dead_host.js";
import proxyHostModel from "../models/proxy_host.js";
import redirectionHostModel from "../models/redirection_host.js";
import settingModel from "../models/setting.js";
import streamModel from "../models/stream.js";
import internalAcmeOptions from "./acme-options.js";
import internalNginx from "./nginx.js";

/** Atomically replace a managed configuration, preserving its permissions. */
const writeFile = async (filename, content, mode = 0o644) => {
	await fs.promises.mkdir(path.dirname(filename), { recursive: true });
	const temporary = `${filename}.${randomUUID()}.tmp`;
	try {
		await fs.promises.writeFile(temporary, content, { mode });
		await fs.promises.chmod(temporary, mode);
		await fs.promises.rename(temporary, filename);
	} finally {
		await fs.promises.rm(temporary, { force: true });
	}
};

const snapshotFiles = async (filenames) =>
	Promise.all(
		filenames.map(async (filename) => {
			try {
				return {
					filename,
					content: await fs.promises.readFile(filename),
					mode: (await fs.promises.stat(filename)).mode & 0o777,
				};
			} catch (error) {
				if (error.code === "ENOENT") return { filename, content: null, mode: 0o644 };
				throw error;
			}
		}),
	);

const restoreFiles = async (snapshots) => {
	for (const { filename, content, mode } of snapshots) {
		if (content === null) await fs.promises.rm(filename, { force: true });
		else await writeFile(filename, content, mode);
	}
};

const tlsHosts = async () => {
	/** @type {Array<[string, any, string]>} */
	const groups = [
		["proxy_host", proxyHostModel, "[host_domains,certificate,access_list.[clients,items]]"],
		["redirection_host", redirectionHostModel, "certificate"],
		["dead_host", deadHostModel, "certificate"],
		["stream", streamModel, "certificate"],
	];
	/** @type {Array<{type:string,host:any}>} */
	const result = [];
	for (const [type, model, graph] of groups) {
		const hosts = await model
			.query()
			.where("is_deleted", 0)
			.where("enabled", 1)
			.where("certificate_id", ">", 0)
			.withGraphFetched(graph);
		for (const host of hosts) result.push({ type, host });
	}
	const defaultSite = await settingModel.query().findById("default-site");
	result.push({ type: "default", host: defaultSite || { id: "default-site", value: "congratulations", meta: {} } });
	return result;
};

/** A saved issuance preference does not change TLS Feature extensions on deployed leaves. */
const assertStaplingCanBeDisabled = async (policy, hosts, defaultPair) => {
	if (policy.ocsp_stapling && policy.custom_ocsp_stapling) return;
	const files = new Set();
	const add = (provider, filename) => {
		if (
			(provider === "letsencrypt" && !policy.ocsp_stapling) ||
			(provider === "other" && !policy.custom_ocsp_stapling)
		)
			files.add(filename);
	};
	add(defaultPair.provider, defaultPair.certificate);
	for (const { type, host } of hosts) {
		if (type === "default") continue;
		const certificate =
			host.certificate || (await certificateModel.query().findById(host.certificate_id).where("is_deleted", 0));
		const directory = { letsencrypt: "certbot/live", other: "custom" }[certificate?.provider];
		if (directory)
			add(
				certificate.provider,
				path.join(internalAcmeTls.getTlsRootPath(), directory, `npm-${host.certificate_id}`, "fullchain.pem"),
			);
	}
	for (const filename of files) {
		try {
			await fs.promises.access(filename);
		} catch (error) {
			if (error.code === "ENOENT") continue;
			throw error;
		}
		let extension;
		try {
			extension = await utils.execFile("openssl", ["x509", "-in", filename, "-noout", "-ext", "tlsfeature"]);
		} catch {
			throw new errs.ValidationError("Could not inspect deployed certificate OCSP requirements");
		}
		if (/\bstatus_request(?:_v2)?\b/i.test(extension))
			throw new errs.ValidationError(
				"Renew or replace deployed Must-Staple certificates before disabling OCSP stapling",
			);
	}
};

const regenerate = async (policy, hosts) => {
	await internalAcmeTls.refreshDefaultInclude(policy);
	for (const { type, host } of hosts) {
		await internalNginx.generateConfig(type, host, { acme_options: policy });
	}
};

const internalAcmeTls = {
	getDefaultIncludePath: () => "/data/nginx/include/default-tls.conf",
	getTlsRootPath: () => "/data/tls",

	/** Resolve only managed paths. A missing imported selection must not prevent opening Settings. */
	resolveDefaultCertificate: async (policy, { allowFallback = false, trx = undefined } = {}) => {
		const id = policy.default_certificate_id;
		const root = internalAcmeTls.getTlsRootPath();
		if (id === 0)
			return {
				provider: "dummy",
				certificate: path.join(root, "dummycert.pem"),
				key: path.join(root, "dummykey.pem"),
			};
		try {
			if (!Number.isSafeInteger(id) || id < 1) throw new Error("invalid id");
			const certificate = await certificateModel.query(trx).findById(id).where("is_deleted", 0);
			const directory = { letsencrypt: "certbot/live", other: "custom", internal: "internal" }[
				certificate?.provider
			];
			if (!certificate || !directory) throw new Error("invalid certificate");
			const certificatePath = path.join(root, directory, `npm-${id}`, "fullchain.pem");
			const keyPath = path.join(root, directory, `npm-${id}`, "privkey.pem");
			for (const filename of [certificatePath, keyPath]) {
				const stat = await fs.promises.stat(filename);
				if (!stat.isFile() || stat.size === 0) throw new Error("missing pair");
			}
			const [pem, privateKey] = await Promise.all([
				fs.promises.readFile(certificatePath),
				fs.promises.readFile(keyPath),
			]);
			if (!new X509Certificate(pem).checkPrivateKey(createPrivateKey(privateKey)))
				throw new Error("mismatched pair");
			return {
				provider: certificate.provider,
				certificate: certificatePath,
				key: keyPath,
				response: path.join(root, directory, `npm-${id}.der`),
			};
		} catch {
			if (!allowFallback)
				throw new errs.ValidationError(
					"Select an active default certificate with a valid certificate and key pair",
				);
			logger.warn("The selected default certificate is unavailable; using the bootstrap certificate.");
			return {
				provider: "dummy",
				certificate: path.join(root, "dummycert.pem"),
				key: path.join(root, "dummykey.pem"),
			};
		}
	},

	/** Install the include shared by the UI, GoAccess and the default site. */
	refreshDefaultInclude: async (policy, { trx = undefined } = {}) => {
		const pair = await internalAcmeTls.resolveDefaultCertificate(policy, { allowFallback: true, trx });
		const lines = [`ssl_certificate ${pair.certificate};`, `ssl_certificate_key ${pair.key};`];
		if (
			(pair.provider === "letsencrypt" && policy.ocsp_stapling) ||
			(pair.provider === "other" && policy.custom_ocsp_stapling)
		) {
			lines.push("ssl_stapling on;", "ssl_stapling_verify on;");
			try {
				const response = await fs.promises.stat(pair.response);
				if (response.isFile() && response.size > 0) lines.push(`ssl_stapling_file ${pair.response};`);
			} catch (error) {
				if (error.code !== "ENOENT") throw error;
			}
		}
		const filename = internalAcmeTls.getDefaultIncludePath();
		const content = `${lines.join("\n")}\n`;
		try {
			if ((await fs.promises.readFile(filename, "utf8")) === content) return;
		} catch (error) {
			if (error.code !== "ENOENT") throw error;
		}
		await writeFile(filename, content);
	},

	/** The caller must hold the Nginx configuration lock before detaching/revoking a certificate. */
	assertCertificateDeletable: async (id) => {
		const policy = await internalAcmeOptions.getPublicPolicy();
		if (policy.default_certificate_id === id) {
			throw new errs.ValidationError(
				"Select another default certificate in Settings before deleting this certificate",
			);
		}
	},

	/** Prepare persisted TLS settings before the startup Nginx reload. */
	initialize: () =>
		internalNginx.withConfigurationLock(async () => {
			const policy = await internalAcmeOptions.getPublicPolicy();
			const hosts = [];
			for (const item of await tlsHosts()) {
				// The launcher removes broken hosts with missing PEMs. Do not recreate them before the UI can repair them.
				if (item.type === "default" || fs.existsSync(internalNginx.getConfigName(item.type, item.host.id)))
					hosts.push(item);
			}
			await internalNginx.refreshOcsp(policy);
			await regenerate(policy, hosts);
		}),

	/** Stage files and save the policy in one rollback-capable Nginx operation. */
	applyPolicy: (policy, persist) =>
		internalNginx.withConfigurationLock(async () => {
			const previous = await internalAcmeOptions.getPublicPolicy();
			const defaultPair = await internalAcmeTls.resolveDefaultCertificate(policy);
			const hosts = await tlsHosts();
			await assertStaplingCanBeDisabled(policy, hosts, defaultPair);
			const filenames = [
				internalAcmeTls.getDefaultIncludePath(),
				...hosts.map(({ type, host }) => internalNginx.getConfigName(type, host.id)),
			];
			const snapshots = await snapshotFiles(filenames);
			try {
				await internalNginx.refreshOcsp(policy);
				await regenerate(policy, hosts);
				await internalNginx.test();
				await settingModel.transaction(async (trx) => {
					await persist(trx);
					await internalNginx.reload({ acme_options: policy, trx });
				});
			} catch {
				await restoreFiles(snapshots);
				try {
					await internalNginx.reload({ acme_options: previous });
				} catch {
					logger.error("Could not reload the restored TLS configuration.");
				}
				throw new errs.ValidationError(
					"Could not apply TLS settings. The previous settings and configuration were restored.",
				);
			}
		}),
};

export default internalAcmeTls;
