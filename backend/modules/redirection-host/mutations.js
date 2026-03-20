import _ from "lodash";
import errs from "../../lib/error.js";
import utils from "../../lib/utils.js";
import redirectionHostModel from "../../models/redirection_host.js";
import internalAuditLog from "../../internal/audit-log.js";
import { certificateService } from "../../modules/certificate/index.js";
import { gitOpsService } from "../../modules/gitops/index.js";
import internalHost from "../../internal/host.js";
import { nginxService } from "../../modules/nginx/index.js";
import { omissions } from "./helpers.js";
import { get } from "./reads.js";

const assertDomainsAvailable = async (domainNames, mode, id) => {
	const checks = [];
	domainNames.map((domainName) => {
		checks.push(internalHost.isHostnameTaken(domainName, mode, id));
		return true;
	});
	const results = await Promise.all(checks);
	results.map((result) => {
		if (result.is_taken) throw new errs.ValidationError(`${result.hostname} is already in use`);
		return true;
	});
};

const create = async (access, data) => {
	let thisData = data || {};
	const createCertificate = thisData.certificate_id === "new";
	if (createCertificate) delete thisData.certificate_id;
	await access.can("redirection_hosts:create", thisData);
	await assertDomainsAvailable(thisData.domain_names);
	thisData.owner_user_id = access.token.getUserId(1);
	thisData = internalHost.cleanSslHstsData(createCertificate, thisData);
	if (typeof data.advanced_config === "undefined") data.advanced_config = "";
	let row = await redirectionHostModel.query().insertAndFetch(thisData);
	row = utils.omitRow(omissions())(row);
	if (createCertificate) {
		const cert = await certificateService.createQuickCertificate(access, thisData);
		await update(access, { id: row.id, certificate_id: cert.id }, { skip_configure: true });
	}
	row = await get(access, { id: row.id, expand: ["certificate", "owner"] });
	await nginxService.configure(redirectionHostModel, "redirection_host", row);
	thisData.meta = _.assign({}, thisData.meta || {}, row.meta);
	await internalAuditLog.add(access, { action: "created", object_type: "redirection-host", object_id: row.id, meta: thisData });
	gitOpsService.triggerAutoPush("redirection-host");
	return row;
};

const update = async (access, data, options = {}) => {
	let thisData = data || {};
	const createCertificate = thisData.certificate_id === "new";
	if (createCertificate) delete thisData.certificate_id;
	await access.can("redirection_hosts:update", thisData.id);
	let row = await get(access, { id: thisData.id });
	if (row.id !== thisData.id) throw new errs.InternalValidationError(`Redirection Host could not be updated, IDs do not match: ${row.id} !== ${thisData.id}`);
	if (typeof thisData.domain_names !== "undefined") await assertDomainsAvailable(thisData.domain_names, "redirection", thisData.id);
	if (createCertificate) {
		const cert = await certificateService.createQuickCertificate(access, { domain_names: thisData.domain_names || row.domain_names, meta: _.assign({}, row.meta, thisData.meta) });
		thisData.certificate_id = cert.id;
	}
	thisData = _.assign({}, { domain_names: row.domain_names }, thisData);
	thisData = internalHost.cleanSslHstsData(createCertificate, thisData, row);
	await redirectionHostModel.query().patchAndFetchById(thisData.id, thisData).then(utils.omitRow(omissions()));
	await internalAuditLog.add(access, { action: "updated", object_type: "redirection-host", object_id: row.id, meta: thisData });
	row = await get(access, { id: thisData.id, expand: ["owner", "certificate"] });
	if (!options.skip_configure) {
		const newMeta = await nginxService.configure(redirectionHostModel, "redirection_host", row);
		row.meta = newMeta;
	}
	gitOpsService.triggerAutoPush("redirection-host");
	return _.omit(internalHost.cleanRowCertificateMeta(row), omissions());
};

export { create, update };
