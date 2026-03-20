import dayjs from "dayjs";
import utils from "../../lib/utils.js";
import { ssl as logger } from "../../logger.js";
import certificateModel from "../../models/certificate.js";
import internalAuditLog from "../../internal/audit-log.js";
import { nginxService } from "../../modules/nginx/index.js";
import * as certbot from "../../internal/certbot.js";
import { get } from "./reads.js";
import { getCertificateInfoFromFile } from "./helpers.js";

const intervalTimeout = 1000 * 60 * 60 * Number.parseInt(process.env.CRT, 10);
let interval = null;
let intervalProcessing = false;
let processing = false;

const getLiveCertPath = (certificateId) => certbot.getLiveCertPath(certificateId);
const renewCertbot = (certificate) => certbot.renewCertbot(certificate);
const renewCertbotWithDnsChallenge = (certificate) => certbot.renewCertbotWithDnsChallenge(certificate);
const testHttpsChallenge = (access, payload) => certbot.testHttpsChallenge(access, payload);
const performTestForDomain = (domain) => certbot.performTestForDomain(domain);

const processExpiringHosts = async () => {
	if (!intervalProcessing && !processing) {
		intervalProcessing = true;
		processing = true;
		logger.info("Renewing Certbot TLS certs close to expiry...");
		try {
			const result = await utils.execFile("certbot", ["--config", "/etc/certbot.ini", "renew", "--server", process.env.ACME_SERVER, "--quiet"]);
			if (result) logger.info(`Renew Result: ${result}`);
			await nginxService.reload();
			logger.info("Renew Complete");
			const certificates = await certificateModel.query().where("is_deleted", 0).andWhere("provider", "letsencrypt");
			if (certificates && certificates.length > 0) {
				await Promise.all(certificates.map(async (certificate) => {
					try {
						const certInfo = await getCertificateInfoFromFile(`${getLiveCertPath(certificate.id)}/fullchain.pem`);
						await certificateModel.query().where("id", certificate.id).andWhere("provider", "letsencrypt").patch({ expires_on: dayjs.unix(certInfo.dates.to).format("YYYY-MM-DD HH:mm:ss") });
					} catch (err) {
						logger.error(err.message);
					}
				}));
			}
		} catch (err) {
			logger.error(err);
		} finally {
			intervalProcessing = false;
			processing = false;
		}
	}
};

const initTimer = () => {
	logger.info("Certbot Renewal Timer initialized");
	interval = setInterval(processExpiringHosts, intervalTimeout);
	processExpiringHosts();
};

const renew = async (access, data) => {
	await access.can("certificates:update", data);
	const certificate = await get(access, data);
	if (certificate.provider !== "letsencrypt") {
		throw new Error("Only Certbot certificates can be renewed");
	}
	const renewMethod = certificate.meta.dns_challenge ? renewCertbotWithDnsChallenge : renewCertbot;
	await renewMethod(certificate);
	const certInfo = await getCertificateInfoFromFile(`${getLiveCertPath(certificate.id)}/fullchain.pem`);
	const updatedCertificate = await certificateModel.query().patchAndFetchById(certificate.id, { expires_on: dayjs.unix(certInfo.dates.to).format("YYYY-MM-DD HH:mm:ss") });
	await internalAuditLog.add(access, { action: "renewed", object_type: "certificate", object_id: updatedCertificate.id, meta: updatedCertificate });
	return updatedCertificate;
};

export { initTimer, interval, intervalProcessing, performTestForDomain, processExpiringHosts, processing, renew, renewCertbot, renewCertbotWithDnsChallenge, testHttpsChallenge };
