import _ from "lodash";
import errs from "../../lib/error.js";
import utils from "../../lib/utils.js";
import proxyHostModel from "../../models/proxy_host.js";
import internalAuditLog from "../audit-log/service.js";
import internalCertificate from "../certificate/service.js";
import internalGitDeploy from "../git-deploy/service.js";
import internalGitOps from "../gitops/service.js";
import { hostService } from "../../modules/host/index.js";
import { nginxService } from "../../modules/nginx/index.js";
import {
	attachHostDomains,
	cleanupOAuth2Proxy,
	ensureOAuth2Proxy,
	omissions,
	prepareEncryptedFields,
} from "./helpers.js";
import { get } from "./reads.js";

const create = async (access, data) => {
	let thisData = data;
	const createCertificate = thisData.certificate_id === "new";
	if (createCertificate) delete thisData.certificate_id;
	await access.can("proxy_hosts:create", thisData);
	const checkResults = await Promise.all(
		thisData.domain_names.map((domainName) => hostService.isHostnameTaken(domainName)),
	);
	checkResults.map((result) => {
		if (result.is_taken) throw new errs.ValidationError(`${result.hostname} is already in use`);
		return true;
	});
	thisData.owner_user_id = access.token.getUserId(1);
	thisData = hostService.cleanSslHstsData(createCertificate, thisData);
	if (typeof thisData.advanced_config === "undefined") thisData.advanced_config = "";
	thisData = attachHostDomains(prepareEncryptedFields(thisData));
	let row = await proxyHostModel.query().insertGraphAndFetch(thisData);
	row = utils.omitRow(omissions())(row);
	if (createCertificate) {
		const cert = await internalCertificate.createQuickCertificate(access, thisData);
		await update(access, { id: row.id, certificate_id: cert.id }, { skip_configure: true });
	}
	row = await get(access, {
		id: row.id,
		expand: ["certificate", "owner", "access_list.[clients,items]", "host_domains"],
	});
	await nginxService.configure(proxyHostModel, "proxy_host", row);
	thisData.meta = _.assign({}, thisData.meta || {}, row.meta);
	await internalAuditLog.add(access, {
		action: "created",
		object_type: "proxy-host",
		object_id: row.id,
		meta: thisData,
	});
	internalGitOps.triggerAutoPush("proxy-host");
	if (row.git_sync_enabled && row.git_repo_url) internalGitDeploy.startPollingForHost(row);
	await ensureOAuth2Proxy(row.access_list_id);
	return row;
};

const update = async (access, data, options = {}) => {
	let thisData = data;
	const createCertificate = thisData.certificate_id === "new";
	if (createCertificate) delete thisData.certificate_id;
	await access.can("proxy_hosts:update", thisData.id);
	if (typeof thisData.domain_names !== "undefined") {
		const checkResults = await Promise.all(
			thisData.domain_names.map((domainName) => hostService.isHostnameTaken(domainName, "proxy", thisData.id)),
		);
		checkResults.map((result) => {
			if (result.is_taken) throw new errs.ValidationError(`${result.hostname} is already in use`);
			return true;
		});
	}
	let row = await get(access, { id: thisData.id });
	const oldAccessListId = row.access_list_id;
	if (row.id !== thisData.id)
		throw new errs.InternalValidationError(
			`Proxy Host could not be updated, IDs do not match: ${row.id} !== ${thisData.id}`,
		);
	if (createCertificate) {
		const cert = await internalCertificate.createQuickCertificate(access, {
			domain_names: thisData.domain_names || row.domain_names,
			meta: _.assign({}, row.meta, thisData.meta),
		});
		thisData.certificate_id = cert.id;
	}
	thisData = _.assign({}, { domain_names: row.domain_names }, data);
	thisData = hostService.cleanSslHstsData(createCertificate, thisData, row);
	thisData = attachHostDomains(prepareEncryptedFields(thisData));
	await proxyHostModel.query().upsertGraphAndFetch(thisData);
	await internalAuditLog.add(access, {
		action: "updated",
		object_type: "proxy-host",
		object_id: row.id,
		meta: thisData,
	});
	row = await get(access, {
		id: thisData.id,
		expand: ["owner", "certificate", "access_list.[clients,items]", "host_domains"],
	});
	if (!options.skip_configure) {
		const newMeta = await nginxService.configure(proxyHostModel, "proxy_host", row);
		row.meta = newMeta;
	}
	internalGitOps.triggerAutoPush("proxy-host");
	internalGitDeploy.startPollingForHost(row);
	if (row.access_list_id !== oldAccessListId) {
		await ensureOAuth2Proxy(row.access_list_id);
		await cleanupOAuth2Proxy(oldAccessListId);
	}
	return _.omit(hostService.cleanRowCertificateMeta(row), omissions());
};

export { create, update };
