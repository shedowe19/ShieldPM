import _ from "lodash";
import { encrypt } from "../../lib/encryption.js";
import AccessList from "../../models/access_list.js";
import proxyHostModel from "../../models/proxy_host.js";
import { oauth2ProxyService } from "../../modules/oauth2-proxy/index.js";

const omissions = () => ["is_deleted", "owner.is_deleted"];

const ensureOAuth2Proxy = async (accessListId) => {
	if (!accessListId) return;
	try {
		const list = await AccessList.query().where("id", accessListId).where("is_deleted", 0).first();
		if (list?.meta && (list.meta.auth_type === "oauth2_proxy" || list.meta.authType === "oauth2_proxy")) {
			await oauth2ProxyService.start(list);
		}
	} catch (err) {
		console.error(`[OAuth2Proxy] Error ensuring proxy for access list #${accessListId}:`, err);
	}
};

const cleanupOAuth2Proxy = async (accessListId) => {
	if (!accessListId) return;
	try {
		const list = await AccessList.query().where("id", accessListId).where("is_deleted", 0).first();
		if (!list || !list.meta || (list.meta.auth_type !== "oauth2_proxy" && list.meta.authType !== "oauth2_proxy")) {
			return;
		}
		const otherHosts = await proxyHostModel.query().where("access_list_id", accessListId).where("is_deleted", 0);
		if (otherHosts.length === 0) {
			await oauth2ProxyService.stop(accessListId);
		}
	} catch (err) {
		console.error(`[OAuth2Proxy] Error cleaning up proxy for access list #${accessListId}:`, err);
	}
};

const prepareEncryptedFields = (data) => {
	const next = { ...data };
	if (next.forward_scheme === "terminal") {
		if (next.terminal_password) next.terminal_password = encrypt(next.terminal_password);
		if (next.terminal_private_key) next.terminal_private_key = encrypt(next.terminal_private_key);
	}
	if (data.git_credentials) {
		next.git_credentials = encrypt(data.git_credentials);
	} else if (typeof data.git_credentials !== "undefined" && data.git_credentials === "") {
		delete next.git_credentials;
	}
	if (data.terminal_password) next.terminal_password = encrypt(data.terminal_password);
	if (data.terminal_private_key) next.terminal_private_key = encrypt(data.terminal_private_key);
	return next;
};

const attachHostDomains = (data) => {
	if (data.domain_names && Array.isArray(data.domain_names)) {
		return { ...data, host_domains: data.domain_names.map((domain) => ({ domain_name: domain })) };
	}
	return data;
};

const omitProxyHostRow = (row) => _.omit(row, omissions());

export { attachHostDomains, cleanupOAuth2Proxy, ensureOAuth2Proxy, omitProxyHostRow, omissions, prepareEncryptedFields };
