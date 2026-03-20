import fs from "node:fs";
import bcrypt from "bcryptjs";
import _ from "lodash";
import { access as logger } from "../../logger.js";

const omissions = () => ["is_deleted"];

const maskItems = (list) => {
	if (list && typeof list.items !== "undefined") {
		list.items.map((val, idx) => {
			let repeatFor = 8;
			let firstChar = "*";
			if (typeof val.password !== "undefined" && val.password) {
				repeatFor = val.password.length - 1;
				firstChar = val.password.charAt(0);
			}
			list.items[idx].hint = firstChar + "*".repeat(repeatFor);
			list.items[idx].password = "";
			return true;
		});
	}
	return list;
};

const getFilename = (list) => `/data/access/${list.id}`;

const build = async (list) => {
	logger.info(`Building Access file #${list.id} for: ${list.name}`);
	const htpasswdFile = getFilename(list);
	try {
		await fs.promises.unlink(htpasswdFile);
	} catch {}
	await fs.promises.writeFile(htpasswdFile, "", { encoding: "utf8" });
	if (list.items.length) {
		for (const item of list.items) {
			if (item.password?.length) {
				try {
					let finalPass = item.password;
					if (!finalPass.startsWith("$2") && !finalPass.startsWith("$apr1$")) {
						finalPass = await bcrypt.hash(item.password, 13);
					}
					await fs.promises.appendFile(htpasswdFile, `${item.username}:${finalPass}\n`, { encoding: "utf8" });
				} catch (err) {
					logger.error(err);
					throw err;
				}
			}
		}
	}
	const crtFile = `${htpasswdFile}.crt`;
	if (list.mtls_enabled && !list.mtls_use_internal && list.mtls_certificate) {
		try {
			await fs.promises.writeFile(crtFile, list.mtls_certificate, { encoding: "utf8" });
		} catch (err) {
			logger.error(`Failed to write mTLS certificate for Access List #${list.id}`, err);
		}
	} else {
		try {
			await fs.promises.unlink(crtFile);
		} catch {}
	}
	logger.success(`Built Access file #${list.id} for: ${list.name}`);
};

export { build, getFilename, maskItems, omissions };
