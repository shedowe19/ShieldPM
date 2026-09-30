import errs from "../lib/error.js";
import utils from "../lib/utils.js";
import certificateModel from "../models/certificate.js";
import settingModel from "../models/setting.js";
import internalAuditLog from "./audit-log.js";

const settingId = "acme-profile";

const internalAcmeProfile = {
	/** @returns {Promise<"standard"|"shortlived">} Stored renewal/issuance policy. */
	getPolicy: async () => {
		const row = await settingModel.query().where("id", settingId).first();
		const policy = row?.value ?? "standard";
		if (!["standard", "shortlived"].includes(policy)) {
			throw new errs.ConfigurationError("The saved ACME profile is invalid");
		}
		return policy;
	},

	/** @param {import("../lib/types.js").Access} access @returns {Promise<Object>} */
	get: async (access) => {
		await access.can("certificates:list");
		return { profile: await internalAcmeProfile.getPolicy() };
	},

	/**
	 * Persist the global default after validating local client and selected CA support.
	 * @param {import("../lib/types.js").Access} access
	 * @param {{profile: "standard"|"shortlived"}} data
	 * @returns {Promise<Object>}
	 */
	update: async (access, data) => {
		await access.can("settings:update", settingId);
		if (data.profile !== "standard" && data.profile !== "shortlived") {
			throw new errs.ValidationError("ACME profile must be 'standard' or 'shortlived'");
		}
		const help = await utils.execFile("certbot", ["--help", "all"]);
		if (!help.includes("--required-profile") || !help.includes("--preferred-profile")) {
			throw new errs.ValidationError("ACME profile settings require Certbot 4.0 or newer");
		}
		if (data.profile === "shortlived") {
			const certificates = await certificateModel
				.query()
				.select("id", "domain_names", "meta")
				.where("is_deleted", 0)
				.andWhere("provider", "letsencrypt");
			const incompatibleCertificate = certificates.find(
				(certificate) =>
					certificate.meta?.letsencrypt_profile === undefined && certificate.domain_names?.length > 25,
			);
			if (incompatibleCertificate) {
				throw new errs.ValidationError(
					`Certificate ${incompatibleCertificate.id} has more than 25 domain names and no explicit profile. Keep Standard or replace this certificate with certificates containing at most 25 domain names before selecting the global Short-lived default.`,
				);
			}
			try {
				const directory = JSON.parse(
					await utils.execFile("curl", [
						"--fail",
						"--silent",
						"--show-error",
						"--location",
						"--connect-timeout",
						"5",
						"--max-time",
						"10",
						...(process.env.ACME_SERVER_TLS_VERIFY === "false" ? ["--insecure"] : []),
						"--",
						process.env.ACME_SERVER || "https://acme-v02.api.letsencrypt.org/directory",
					]),
				);
				if (!directory.meta?.profiles || !Object.hasOwn(directory.meta.profiles, "shortlived")) {
					throw new errs.ValidationError("The configured ACME server does not offer the shortlived profile");
				}
			} catch (err) {
				if (err instanceof errs.ValidationError) throw err;
				throw new errs.ValidationError(
					"Could not verify the ACME server's shortlived profile. Please try again.",
				);
			}
		}
		const affected = await settingModel.query().where("id", settingId).patch({ value: data.profile });
		if (!affected) throw new errs.ItemNotFoundError(settingId);
		await internalAuditLog.add(access, {
			action: "updated",
			object_type: "setting",
			object_id: 0,
			meta: { setting_id: settingId, name: "ACME Certificate Profile", value: data.profile },
		});
		return { profile: data.profile };
	},
};

export default internalAcmeProfile;
