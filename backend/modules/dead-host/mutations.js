import _ from "lodash";
import errs from "../../lib/error.js";
import utils from "../../lib/utils.js";
import deadHostModel from "../../models/dead_host.js";
import internalAuditLog from "../../internal/audit-log.js";
import { certificateService } from "../../modules/certificate/index.js";
import { gitOpsService } from "../../modules/gitops/index.js";
import { hostService } from "../../modules/host/index.js";
import { nginxService } from "../../modules/nginx/index.js";
import { omissions } from "./helpers.js";
import { get } from "./reads.js";

const assertDomainsAvailable = async (domainNames, mode, id) => {
	const checks = [];
	domainNames.map((domainName) => {
		checks.push(hostService.isHostnameTaken(domainName, mode, id));
		return true;
	});
	const results = await Promise.all(checks);
	results.map((result) => {
		if (result.is_taken) throw new errs.ValidationError(`${result.hostname} is already in use`);
		return true;
	});
};

const create = async (access, data) => {
	const createCertificate = data.certificate_id === "new";
	if (createCertificate) delete data.certificate_id;
	await access.can("dead_hosts:create", data);
	await assertDomainsAvailable(data.domain_names);
	data.owner_user_id = access.token.getUserId(1);
	const thisData = hostService.cleanSslHstsData(createCertificate, data);
	if (typeof data.advanced_config === "undefined") thisData.advanced_config = "";
	let row = await deadHostModel.query().insertAndFetch(thisData);
	row = utils.omitRow(omissions())(row);
	await internalAuditLog.add(access, { action: "created", object_type: "dead-host", object_id: row.id, meta: thisData });
	if (createCertificate) {
		const cert = await certificateService.createQuickCertificate(access, data);
		await update(access, { id: row.id, certificate_id: cert.id }, { skip_configure: true });
	}
	const freshRow = await get(access, { id: row.id, expand: ["certificate", "owner"] });
	if (createCertificate && !freshRow.certificate_id) throw new errs.InternalValidationError("The host was created but the Certificate creation failed.");
	await nginxService.configure(deadHostModel, "dead_host", freshRow);
	gitOpsService.triggerAutoPush("dead-host");
	return freshRow;
};

const update = async (access, data, options = {}) => {
	let thisData = data;
	const createCertificate = thisData.certificate_id === "new";
	if (createCertificate) delete thisData.certificate_id;
	await access.can("dead_hosts:update", thisData.id);
	if (typeof thisData.domain_names !== "undefined") await assertDomainsAvailable(thisData.domain_names, "dead", thisData.id);
	const row = await get(access, { id: thisData.id });
	if (row.id !== thisData.id) throw new errs.InternalValidationError(`404 Host could not be updated, IDs do not match: ${row.id} !== ${thisData.id}`);
	if (createCertificate) {
		const cert = await certificateService.createQuickCertificate(access, { domain_names: thisData.domain_names || row.domain_names, meta: _.assign({}, row.meta, thisData.meta) });
		thisData.certificate_id = cert.id;
	}
	thisData = _.assign({}, { domain_names: row.domain_names }, data);
	thisData = hostService.cleanSslHstsData(createCertificate, thisData, row);
	await deadHostModel.query().where({ id: data.id }).patch(data);
	await internalAuditLog.add(access, { action: "updated", object_type: "dead-host", object_id: row.id, meta: thisData });
	const thisRow = await get(access, { id: thisData.id, expand: ["owner", "certificate"] });
	if (!options.skip_configure) {
		const newMeta = await nginxService.configure(deadHostModel, "dead_host", row);
		row.meta = newMeta;
	}
	gitOpsService.triggerAutoPush("dead-host");
	return _.omit(hostService.cleanRowCertificateMeta(thisRow), omissions());
};

export { create, update };
