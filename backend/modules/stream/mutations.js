import _ from "lodash";
import errs from "../../lib/error.js";
import utils from "../../lib/utils.js";
import streamModel from "../../models/stream.js";
import internalAuditLog from "../audit-log/service.js";
import { certificateService } from "../../modules/certificate/index.js";
import { gitOpsService } from "../../modules/gitops/index.js";
import { hostService } from "../../modules/host/index.js";
import { nginxService } from "../../modules/nginx/index.js";
import { omissions } from "./helpers.js";
import { get } from "./reads.js";

const assertNoPortCollision = async (data, excludeId) => {
	const query = streamModel
		.query()
		.where("is_deleted", 0)
		.andWhere("incoming_port", data.incoming_port)
		.andWhere(function () {
			this.where(function () {
				if (data.tcp_forwarding) this.where("tcp_forwarding", 1);
				else this.where("tcp_forwarding", 2);
			}).orWhere(function () {
				if (data.udp_forwarding) this.where("udp_forwarding", 1);
				else this.where("udp_forwarding", 2);
			});
		});
	if (excludeId) query.andWhereNot("id", excludeId);
	const collision = await query.first();
	if (collision) throw new errs.ValidationError(`Incoming port ${data.incoming_port} is already in use by another stream.`);
};

const create = async (access, data) => {
	const createCertificate = data.certificate_id === "new";
	if (createCertificate) delete data.certificate_id;
	await access.can("streams:create", data);
	await assertNoPortCollision(data);
	data.owner_user_id = access.token.getUserId(1);
	if (typeof data.meta === "undefined") data.meta = {};
	const dataNoDomains = structuredClone(data);
	delete dataNoDomains.domain_names;
	let row = await streamModel.query().insertAndFetch(dataNoDomains);
	row = utils.omitRow(omissions())(row);
	if (createCertificate) {
		const cert = await certificateService.createQuickCertificate(access, data);
		await update(access, { id: row.id, certificate_id: cert.id }, { skip_configure: true });
	}
	row = await get(access, { id: row.id, expand: ["certificate", "owner"] });
	await nginxService.configure(streamModel, "stream", row);
	await internalAuditLog.add(access, { action: "created", object_type: "stream", object_id: row.id, meta: data });
	gitOpsService.triggerAutoPush("stream");
	return row;
};

const update = async (access, data, options = {}) => {
	let thisData = data;
	const createCertificate = thisData.certificate_id === "new";
	if (createCertificate) delete thisData.certificate_id;
	await access.can("streams:update", thisData.id);
	if (typeof thisData.incoming_port !== "undefined") await assertNoPortCollision(thisData, thisData.id);
	let row = await get(access, { id: thisData.id });
	if (row.id !== thisData.id) throw new errs.InternalValidationError(`Stream could not be updated, IDs do not match: ${row.id} !== ${thisData.id}`);
	if (createCertificate) {
		const cert = await certificateService.createQuickCertificate(access, { domain_names: thisData.domain_names || row.domain_names, meta: _.assign({}, row.meta, thisData.meta) });
		thisData.certificate_id = cert.id;
	}
	thisData = _.assign({}, { domain_names: row.domain_names }, data);
	let savedRow = await streamModel.query().patchAndFetchById(row.id, thisData);
	savedRow = utils.omitRow(omissions())(savedRow);
	await internalAuditLog.add(access, { action: "updated", object_type: "stream", object_id: row.id, meta: thisData });
	row = await get(access, { id: thisData.id, expand: ["owner", "certificate"] });
	if (!options.skip_configure) {
		const newMeta = await nginxService.configure(streamModel, "stream", row);
		row.meta = newMeta;
	}
	gitOpsService.triggerAutoPush("stream");
	return _.omit(hostService.cleanRowCertificateMeta(row), omissions());
};

export { create, update };
