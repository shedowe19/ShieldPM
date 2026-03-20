import fs from "node:fs";
import _ from "lodash";
import dayjs from "dayjs";
import error from "../../lib/error.js";
import utils from "../../lib/utils.js";
import certificateModel from "../../models/certificate.js";
import internalAuditLog from "../audit-log/service.js";
import * as certbot from "../certbot/service.js";
import internalGitOps from "../gitops/service.js";
import { pkiService } from "../../modules/pki/index.js";
import { allowedSslFiles, cleanMeta, getCertificateInfoFromFile, omissions, validate } from "./helpers.js";
import { get } from "./reads.js";

const addCreatedAuditLog = async (access, certificateId, meta) => {
	await internalAuditLog.add(access, {
		action: "created",
		object_type: "certificate",
		object_id: certificateId,
		meta,
	});
};

const getLiveCertPath = (certificateId) => certbot.getLiveCertPath(certificateId);
const requestCertbot = (certificate) => certbot.requestCertbot(certificate);
const requestCertbotWithDnsChallenge = (certificate) => certbot.requestCertbotWithDnsChallenge(certificate);
const revokeCertbot = (certificate, throwErrors) => certbot.revokeCertbot(certificate, throwErrors);

const writeCustomCert = async (certificate) => {
	const dir = `/data/tls/custom/npm-${certificate.id}`;
	if (certificate.provider === "letsencrypt" || certificate.provider === "internal")
		throw new Error("Refusing to write certbot/internal certs here");
	let certData = certificate.meta.certificate;
	if (typeof certificate.meta.intermediate_certificate !== "undefined")
		certData = `${certData}\n${certificate.meta.intermediate_certificate}`;
	if (!fs.existsSync(dir)) await fs.promises.mkdir(dir);
	await fs.promises.writeFile(`${dir}/fullchain.pem`, certData);
	await fs.promises.writeFile(`${dir}/privkey.pem`, certificate.meta.certificate_key);
};

const create = async (access, data) => {
	const thisData = data;
	await access.can("certificates:create", thisData);
	thisData.owner_user_id = access.token.getUserId(1);
	if (thisData.provider === "letsencrypt" || thisData.provider === "internal")
		thisData.nice_name = thisData.domain_names.join(", ");
	const certificate = await certificateModel.query().insertAndFetch(thisData);
	try {
		if (certificate.provider === "letsencrypt") {
			if (certificate.meta?.dns_challenge) await requestCertbotWithDnsChallenge(certificate);
			else await requestCertbot(certificate);
			const certInfo = await getCertificateInfoFromFile(`${getLiveCertPath(certificate.id)}/fullchain.pem`);
			const savedRow = await certificateModel
				.query()
				.patchAndFetchById(certificate.id, {
					expires_on: dayjs.unix(certInfo.dates.to).format("YYYY-MM-DD HH:mm:ss"),
				})
				.then(utils.omitRow(omissions()));
			savedRow.meta = _.assign({}, savedRow.meta, { letsencrypt_certificate: certInfo });
			await addCreatedAuditLog(access, certificate.id, savedRow);
			return savedRow;
		}
		if (certificate.provider === "internal") {
			const outDir = `/data/tls/internal/npm-${certificate.id}`;
			const result = await pkiService.createLeadCert(
				{ domain_names: certificate.domain_names, years: Number.parseInt(certificate.meta.years, 10) || 10 },
				outDir,
			);
			const certInfo = await getCertificateInfoFromFile(result.fullchain);
			const savedRow = await certificateModel
				.query()
				.patchAndFetchById(certificate.id, {
					expires_on: dayjs.unix(certInfo.dates.to).format("YYYY-MM-DD HH:mm:ss"),
					meta: _.assign({}, certificate.meta, {
						certificate: result.fullchain,
						certificate_key: result.privkey,
					}),
				})
				.then(utils.omitRow(omissions()));
			await addCreatedAuditLog(access, certificate.id, savedRow);
			return savedRow;
		}
	} catch (err) {
		await certificateModel.query().deleteById(certificate.id);
		err.public = true;
		throw err;
	}
	data.meta = _.assign({}, data.meta || {}, certificate.meta);
	await addCreatedAuditLog(access, certificate.id, utils.omitRow(omissions())(data));
	internalGitOps.triggerAutoPush("certificate");
	return utils.omitRow(omissions())(certificate);
};

const update = async (access, data) => {
	const thisData = data;
	await access.can("certificates:update", thisData.id);
	const row = await get(access, { id: thisData.id });
	if (row.id !== thisData.id)
		throw new error.InternalValidationError(
			`Certificate could not be updated, IDs do not match: ${row.id} !== ${thisData.id}`,
		);
	const savedRow = await certificateModel
		.query()
		.patchAndFetchById(row.id, thisData)
		.then(utils.omitRow(omissions()));
	savedRow.meta = cleanMeta(savedRow.meta);
	if (thisData.meta) thisData.meta = cleanMeta(thisData.meta);
	if (savedRow.provider === "other") thisData.nice_name = savedRow.nice_name;
	await internalAuditLog.add(access, {
		action: "updated",
		object_type: "certificate",
		object_id: row.id,
		meta: _.omit(thisData, ["expires_on"]),
	});
	internalGitOps.triggerAutoPush("certificate");
	return savedRow;
};

const remove = async (access, data) => {
	await access.can("certificates:delete", data.id);
	const row = await get(access, { id: data.id });
	if (!row || !row.id) throw new error.ItemNotFoundError(data.id);
	await certificateModel.query().where("id", row.id).patch({ is_deleted: 1 });
	row.meta = cleanMeta(row.meta);
	await internalAuditLog.add(access, {
		action: "deleted",
		object_type: "certificate",
		object_id: row.id,
		meta: _.omit(row, omissions()),
	});
	if (row.provider === "letsencrypt") await revokeCertbot(row);
	else {
		await fs.promises.rm(`/data/tls/custom/npm-${row.id}`, { force: true, recursive: true });
		await fs.promises.rm(`/data/tls/custom/npm-${row.id}.der`, { force: true });
	}
	internalGitOps.triggerAutoPush("certificate");
	return true;
};

const createQuickCertificate = async (access, data) =>
	create(access, { provider: "letsencrypt", domain_names: data.domain_names, meta: data.meta });

const upload = async (access, data) => {
	const row = await get(access, { id: data.id });
	if (row.provider !== "other")
		throw new error.ValidationError("Cannot upload certificates for this type of provider");
	const validations = await validate(data);
	if (typeof validations.certificate === "undefined")
		throw new error.ValidationError("Certificate file was not provided");
	_.map(data.files, (file, name) => {
		if (allowedSslFiles.indexOf(name) !== -1) row.meta[name] = file.data.toString();
	});
	const certificate = await update(access, {
		id: data.id,
		expires_on: dayjs.unix(validations.certificate.dates.to).format("YYYY-MM-DD HH:mm:ss"),
		domain_names: [validations.certificate.cn],
		meta: _.clone(row.meta),
	});
	certificate.meta = row.meta;
	await writeCustomCert(certificate);
	return _.pick(row.meta, allowedSslFiles);
};

export {
	addCreatedAuditLog,
	create,
	createQuickCertificate,
	getLiveCertPath,
	remove,
	requestCertbot,
	requestCertbotWithDnsChallenge,
	revokeCertbot,
	update,
	upload,
	writeCustomCert,
};
