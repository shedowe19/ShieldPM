import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import Certificate from "../../models/certificate.js";
import DeadHost from "../../models/dead_host.js";
import ProxyHost from "../../models/proxy_host.js";
import RedirectionHost from "../../models/redirection_host.js";
import settingModel from "../../models/setting.js";
import Stream from "../../models/stream.js";
import User from "../../models/user.js";
import { global as logger } from "../../logger.js";
import { isDemoMode } from "../../lib/config.js";
import errs from "../../lib/error.js";
import { GITOPS_DIR, getConfigDir, initRepo } from "./helpers.js";

const sanitizeForExport = (obj, excludeFields) => {
	const result = { ...obj };
	for (const field of excludeFields) delete result[field];
	return result;
};

const exportCertificateFiles = async (configDir, exportedFiles) => {
	const certFilesDir = path.join(configDir, "certificate-files");
	if (!fs.existsSync(certFilesDir)) await fs.promises.mkdir(certFilesDir, { recursive: true });
	const letsencryptDir = "/data/tls/certbot/live";
	if (fs.existsSync(letsencryptDir)) {
		const domains = (await fs.promises.readdir(letsencryptDir)).filter((d) => !d.startsWith("."));
		for (const domain of domains) {
			const domainDir = path.join(letsencryptDir, domain);
			const targetDir = path.join(certFilesDir, "letsencrypt", domain);
			if (!fs.existsSync(targetDir)) await fs.promises.mkdir(targetDir, { recursive: true });
			for (const file of ["fullchain.pem", "cert.pem", "chain.pem"]) {
				const srcPath = path.join(domainDir, file);
				const destPath = path.join(targetDir, file);
				if (fs.existsSync(srcPath)) {
					await fs.promises.copyFile(srcPath, destPath);
					exportedFiles.push(destPath);
				}
			}
		}
	}
	const customDir = "/data/tls/custom";
	if (fs.existsSync(customDir)) {
		const items = await fs.promises.readdir(customDir);
		const customTargetDir = path.join(certFilesDir, "custom");
		if (!fs.existsSync(customTargetDir)) await fs.promises.mkdir(customTargetDir, { recursive: true });
		for (const item of items) {
			const srcPath = path.join(customDir, item);
			const destPath = path.join(customTargetDir, item);
			const stats = await fs.promises.stat(srcPath);
			if (stats.isFile()) {
				if (!item.includes("privkey") && !item.endsWith(".key")) {
					await fs.promises.copyFile(srcPath, destPath);
					exportedFiles.push(destPath);
				}
			} else if (stats.isDirectory() && item.startsWith("npm-")) {
				if (!fs.existsSync(destPath)) await fs.promises.mkdir(destPath, { recursive: true });
				const files = await fs.promises.readdir(srcPath);
				for (const file of files) {
					if (!file.includes("privkey") && !file.endsWith(".key")) {
						const srcFile = path.join(srcPath, file);
						const destFile = path.join(destPath, file);
						if ((await fs.promises.stat(srcFile)).isFile()) {
							await fs.promises.copyFile(srcFile, destFile);
							exportedFiles.push(destFile);
						}
					}
				}
			}
		}
	}
	const internalDir = "/data/tls/internal";
	if (fs.existsSync(internalDir)) {
		const internalTargetDir = path.join(certFilesDir, "internal");
		if (!fs.existsSync(internalTargetDir)) await fs.promises.mkdir(internalTargetDir, { recursive: true });
		for (const file of ["root_ca.crt", "root_ca.srl"]) {
			const srcPath = path.join(internalDir, file);
			const destPath = path.join(internalTargetDir, file);
			if (fs.existsSync(srcPath)) {
				await fs.promises.copyFile(srcPath, destPath);
				exportedFiles.push(destPath);
			}
		}
		const items = await fs.promises.readdir(internalDir);
		for (const item of items) {
			const itemPath = path.join(internalDir, item);
			if ((await fs.promises.stat(itemPath)).isDirectory() && item.startsWith("npm-")) {
				const destDir = path.join(internalTargetDir, item);
				if (!fs.existsSync(destDir)) await fs.promises.mkdir(destDir, { recursive: true });
				const files = await fs.promises.readdir(itemPath);
				for (const file of files) {
					if (!file.includes("privkey") && !file.endsWith(".key")) {
						const srcFile = path.join(itemPath, file);
						const destFile = path.join(destDir, file);
						await fs.promises.copyFile(srcFile, destFile);
						exportedFiles.push(destFile);
					}
				}
			}
		}
	}
};

const exportConfig = async () => {
	if (isDemoMode()) throw new errs.AuthError("GitOps is disabled in Demo Mode");
	await initRepo();
	const configDir = getConfigDir();
	const exportedFiles = [];
	for (const dir of [
		"proxy-hosts",
		"redirection-hosts",
		"dead-hosts",
		"streams",
		"certificates",
		"users",
		"settings",
		"ddns-providers",
	]) {
		const dirPath = path.join(configDir, dir);
		if (!fs.existsSync(dirPath)) await fs.promises.mkdir(dirPath, { recursive: true });
	}
	for (const host of await ProxyHost.query().where("is_deleted", 0)) {
		const filename = `${host.id}-${(host.domain_names?.[0] || "unknown").replace(/[^a-z0-9.-]/gi, "-")}.yaml`;
		const filePath = path.join(configDir, "proxy-hosts", filename);
		await fs.promises.writeFile(filePath, yaml.dump(sanitizeForExport(host, ["is_deleted"]), { indent: 2 }));
		exportedFiles.push(filePath);
	}
	for (const host of await RedirectionHost.query().where("is_deleted", 0)) {
		const filename = `${host.id}-${(host.domain_names?.[0] || "unknown").replace(/[^a-z0-9.-]/gi, "-")}.yaml`;
		const filePath = path.join(configDir, "redirection-hosts", filename);
		await fs.promises.writeFile(filePath, yaml.dump(sanitizeForExport(host, ["is_deleted"]), { indent: 2 }));
		exportedFiles.push(filePath);
	}
	for (const host of await DeadHost.query().where("is_deleted", 0)) {
		const filename = `${host.id}-${(host.domain_names?.[0] || "unknown").replace(/[^a-z0-9.-]/gi, "-")}.yaml`;
		const filePath = path.join(configDir, "dead-hosts", filename);
		await fs.promises.writeFile(filePath, yaml.dump(sanitizeForExport(host, ["is_deleted"]), { indent: 2 }));
		exportedFiles.push(filePath);
	}
	for (const stream of await Stream.query().where("is_deleted", 0)) {
		const filename = `${stream.id}-${stream.incoming_port || "unknown"}.yaml`;
		const filePath = path.join(configDir, "streams", filename);
		await fs.promises.writeFile(filePath, yaml.dump(sanitizeForExport(stream, ["is_deleted"]), { indent: 2 }));
		exportedFiles.push(filePath);
	}
	for (const cert of await Certificate.query().where("is_deleted", 0)) {
		const filename = `${cert.id}-${(cert.nice_name || cert.domain_names?.[0] || "unknown").replace(/[^a-z0-9.-]/gi, "-")}.yaml`;
		const filePath = path.join(configDir, "certificates", filename);
		await fs.promises.writeFile(filePath, yaml.dump(sanitizeForExport(cert, ["is_deleted"]), { indent: 2 }));
		exportedFiles.push(filePath);
	}
	for (const user of await User.query().where("is_deleted", 0).withGraphFetched("permissions")) {
		const filename = `${user.id}-${(user.nickname || user.email || "unknown").replace(/[^a-z0-9.-]/gi, "-")}.yaml`;
		const filePath = path.join(configDir, "users", filename);
		await fs.promises.writeFile(filePath, yaml.dump(sanitizeForExport(user, ["is_deleted"]), { indent: 2 }));
		exportedFiles.push(filePath);
	}
	for (const setting of await settingModel.query().whereNot("id", "gitops-config")) {
		const filePath = path.join(configDir, "settings", `${setting.id}.yaml`);
		await fs.promises.writeFile(filePath, yaml.dump({ ...setting }, { indent: 2 }));
		exportedFiles.push(filePath);
	}
	await exportCertificateFiles(configDir, exportedFiles);
	const pruneDirectory = async (dir) => {
		if (!fs.existsSync(dir)) return;
		for (const item of await fs.promises.readdir(dir)) {
			const fullPath = path.join(dir, item);
			const stat = await fs.promises.stat(fullPath);
			if (stat.isDirectory()) {
				await pruneDirectory(fullPath);
				if ((await fs.promises.readdir(fullPath)).length === 0) await fs.promises.rmdir(fullPath);
			} else if (!exportedFiles.includes(fullPath)) {
				await fs.promises.unlink(fullPath);
				logger.info(`GitOps: Pruned stale file: ${fullPath.replace(GITOPS_DIR, "")}`);
			}
		}
	};
	await pruneDirectory(configDir);
	logger.info(`Exported ${exportedFiles.length} configuration files`);
	return exportedFiles;
};

export { exportCertificateFiles, exportConfig, sanitizeForExport };
