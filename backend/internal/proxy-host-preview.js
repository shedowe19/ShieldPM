import fs from "node:fs";
import errs from "../lib/error.js";
import { buildPreviewDiff, redactPreviewConfig } from "../lib/nginx-preview.js";
import AccessList from "../models/access_list.js";
import Certificate from "../models/certificate.js";
import internalHost from "./host.js";
import internalNginx from "./nginx.js";
import internalProxyHost from "./proxy-host.js";
import { validateRelayConfigForHost } from "./upload-relay.js";

const MAX_CONFIG_BYTES = 2 * 1024 * 1024;

/** Read only the authorized numeric host's active config, without following a substituted file symlink. */
const readCurrentConfig = async (id) => {
	const filename = internalNginx.getConfigName("proxy_host", id);
	let handle;
	try {
		handle = await fs.promises.open(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
		const info = await handle.stat();
		if (!info.isFile() || info.size > MAX_CONFIG_BYTES) {
			throw new errs.ValidationError("Active host configuration is too large for a preview");
		}
		return await handle.readFile("utf8");
	} catch (err) {
		if (err.code === "ENOENT") return null;
		if (err instanceof errs.ValidationError) throw err;
		throw new errs.ConfigurationError("Unable to read the active proxy host configuration for preview");
	} finally {
		await handle?.close();
	}
};

const internalProxyHostPreview = {
	/**
	 * Render the exact host template without persisting data or touching live Nginx.
	 * @param {import("../lib/types.js").Access} access
	 * @param {object} payload A validated proxy-host create or update payload
	 * @param {number|null} [id] Numeric existing host ID; null creates an unsaved preview
	 * @returns {Promise<{config: string, diff: string, hasCurrent: boolean, nginxValidated: false, limitations: string[]}>}
	 */
	preview: async (access, payload, id = null) => {
		if (id !== null && (!Number.isSafeInteger(id) || id < 1)) {
			throw new errs.ValidationError("Invalid proxy host ID");
		}
		let existing = null;
		if (id === null) {
			await access.can("proxy_hosts:create", payload);
		} else {
			await access.can("proxy_hosts:update", id);
			existing = await internalProxyHost.get(
				access,
				{ id, expand: ["certificate", "access_list.[clients,items]", "host_domains"] },
				{ preserveManagedPath: true },
			);
		}

		const data = { ...payload };
		await internalHost.validateReferences(access, data, existing || {});
		const domainNames = data.domain_names ?? existing?.domain_names;
		internalHost.validateDomainNames(domainNames);
		const taken = await Promise.all(
			domainNames.map((domain) => internalHost.isHostnameTaken(domain, id === null ? undefined : "proxy", id)),
		);
		const conflict = taken.find((entry) => entry.is_taken);
		if (conflict) throw new errs.ValidationError(`${conflict.hostname} is already in use`);

		if (data.forward_host === "(managed)" && existing?.forward_host?.startsWith("/data/websites/")) {
			data.forward_host = existing.forward_host;
		}
		const pendingCertificate = data.certificate_id === "new";
		const candidate = internalHost.cleanSslHstsData(pendingCertificate, {
			...(existing || {}),
			...data,
			id: id || 0,
			domain_names: domainNames,
			enabled: data.enabled ?? existing?.enabled ?? true,
			locations: data.locations ?? existing?.locations ?? [],
			advanced_config: data.advanced_config ?? existing?.advanced_config ?? "",
		});
		// Creating a certificate needs ACME and filesystem changes, which are deliberately absent here.
		if (pendingCertificate) {
			candidate.certificate_id = 0;
			candidate.certificate = null;
			candidate.ssl_forced = false;
			candidate.hsts_enabled = false;
			candidate.hsts_subdomains = false;
		} else if (!candidate.certificate_id) {
			candidate.certificate = null;
		} else if (candidate.certificate_id !== existing?.certificate_id) {
			candidate.certificate = await Certificate.query().findById(candidate.certificate_id);
		} else {
			candidate.certificate = existing?.certificate || null;
		}
		if (!candidate.access_list_id) {
			candidate.access_list = null;
		} else if (candidate.access_list_id !== existing?.access_list_id) {
			candidate.access_list = await AccessList.query()
				.findById(candidate.access_list_id)
				.withGraphFetched("[clients,items]");
		} else {
			candidate.access_list = existing?.access_list || null;
		}
		if (candidate.upload_relay_enabled) await validateRelayConfigForHost(candidate);

		return internalNginx.withConfigurationLock(async () => {
			let proposed;
			try {
				proposed = await internalNginx.renderConfig("proxy_host", candidate, { preview: true });
			} catch {
				// Template failures can contain user data or expanded secret values.
				throw new errs.ConfigurationError("Unable to render the proposed proxy host configuration");
			}
			if (Buffer.byteLength(proposed, "utf8") > MAX_CONFIG_BYTES) {
				throw new errs.ValidationError("Proposed host configuration is too large for a preview");
			}
			const current = id === null ? null : await readCurrentConfig(id);
			const config = redactPreviewConfig(proposed);
			return {
				config,
				diff: buildPreviewDiff(current === null ? null : redactPreviewConfig(current), config),
				hasCurrent: current !== null,
				nginxValidated: false,
				limitations: [
					"render-only",
					...(id === null ? ["id-pending"] : []),
					...(pendingCertificate ? ["certificate-pending"] : []),
				],
			};
		});
	},
};

export default internalProxyHostPreview;
