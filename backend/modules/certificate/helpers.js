import fs from "node:fs";
import path from "path";
import archiver from "archiver";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat.js";
import _ from "lodash";
import tempWrite from "temp-write";
import error from "../../lib/error.js";
import utils from "../../lib/utils.js";
import { debug, ssl as logger } from "../../logger.js";

dayjs.extend(customParseFormat);

const allowedSslFiles = ["certificate", "certificate_key", "intermediate_certificate"];
const omissions = () => ["is_deleted", "owner.is_deleted", "meta.dns_provider_credentials"];

const cleanExpansions = (row) => {
	if (typeof row.proxy_hosts !== "undefined") row.proxy_hosts = utils.omitRows(["is_deleted"])(row.proxy_hosts);
	if (typeof row.redirection_hosts !== "undefined")
		row.redirection_hosts = utils.omitRows(["is_deleted"])(row.redirection_hosts);
	if (typeof row.dead_hosts !== "undefined") row.dead_hosts = utils.omitRows(["is_deleted"])(row.dead_hosts);
	if (typeof row.streams !== "undefined") row.streams = utils.omitRows(["is_deleted"])(row.streams);
	return row;
};

const cleanMeta = (meta, remove) => {
	allowedSslFiles.map((key) => {
		if (typeof meta[key] !== "undefined" && meta[key]) {
			if (remove) delete meta[key];
			else meta[key] = true;
		}
		return true;
	});
	return meta;
};

const zipFiles = async (source, out) => {
	const archive = archiver("zip", { zlib: { level: 9 } });
	const stream = fs.createWriteStream(out);
	return new Promise((resolve, reject) => {
		source.map((fl) => {
			const fileName = path.basename(fl);
			debug(logger, fl, "added to certificate zip");
			archive.file(fl, { name: fileName });
			return true;
		});
		archive.on("error", (err) => reject(err)).pipe(stream);
		stream.on("close", () => resolve());
		archive.finalize();
	});
};

const checkPrivateKey = async (privateKey) => {
	const filepath = await tempWrite(privateKey, "/tmp");
	const failTimeout = setTimeout(() => {
		throw new error.ValidationError(
			"Result Validation Error: Validation timed out. This could be due to the key being passphrase-protected.",
		);
	}, 10000);
	try {
		const result = await utils.execFile("openssl", ["pkey", "-in", filepath, "-check", "-noout"]);
		clearTimeout(failTimeout);
		if (!result.toLowerCase().includes("key is valid"))
			throw new error.ValidationError(`Result Validation Error: ${result}`);
		fs.unlinkSync(filepath);
		return true;
	} catch (err) {
		clearTimeout(failTimeout);
		fs.unlinkSync(filepath);
		throw new error.ValidationError(`Certificate Key is not valid (${err.message})`, err);
	}
};

const getCertificateInfoFromFile = async (certificateFile, throwExpired) => {
	const certData = {};
	try {
		const result = await utils.execFile("openssl", ["x509", "-in", certificateFile, "-subject", "-noout"]);
		const regex = /(?:subject=)?[^=]+=\s*(\S+)/gim;
		const match = regex.exec(result);
		if (match && typeof match[1] !== "undefined") certData.cn = match[1];
		const result2 = await utils.execFile("openssl", ["x509", "-in", certificateFile, "-issuer", "-noout"]);
		const regex2 = /^(?:issuer=)?(.*)$/gim;
		const match2 = regex2.exec(result2);
		if (match2 && typeof match2[1] !== "undefined") certData.issuer = match2[1];
		const result3 = await utils.execFile("openssl", ["x509", "-in", certificateFile, "-dates", "-noout"]);
		let validFrom = null;
		let validTo = null;
		result3.split("\n").map((str) => {
			const lineRegex = /^(\S+)=(.*)$/gim;
			const lineMatch = lineRegex.exec(str.trim());
			if (lineMatch && typeof lineMatch[2] !== "undefined") {
				const dateString = lineMatch[2].replace(/\s+/g, " ");
				const date = dayjs(dateString, "MMM D HH:mm:ss YYYY z").unix();
				if (lineMatch[1].toLowerCase() === "notbefore") validFrom = date;
				else if (lineMatch[1].toLowerCase() === "notafter") validTo = date;
			}
			return true;
		});
		if (!validFrom || !validTo)
			throw new error.ValidationError(`Could not determine dates from certificate: ${result3}`);
		if (throwExpired && validTo < dayjs().unix()) throw new error.ValidationError("Certificate has expired");
		certData.dates = { from: validFrom, to: validTo };
		return certData;
	} catch (err) {
		throw new error.ValidationError(`Certificate is not valid (${err.message})`, err);
	}
};

const getCertificateInfo = async (certificate, throwExpired) => {
	let filepath = null;
	try {
		filepath = await tempWrite(certificate, "/tmp");
		const certData = await getCertificateInfoFromFile(filepath, throwExpired);
		fs.unlinkSync(filepath);
		return certData;
	} catch (err) {
		if (filepath) fs.unlinkSync(filepath);
		throw err;
	}
};

const validate = (data) => {
	const files = {};
	Object.entries(data.files).forEach(([name, file]) => {
		if (allowedSslFiles.indexOf(name) !== -1) files[name] = file.data.toString();
	});
	const promises = [];
	Object.entries(files).forEach(([type, content]) => {
		promises.push(
			Promise.resolve(
				type === "certificate_key" ? checkPrivateKey(content) : getCertificateInfo(content, true),
			).then((res) => ({ [type]: res })),
		);
	});
	return Promise.all(promises).then((fileResults) => {
		let merged = {};
		_.each(fileResults, (file) => {
			merged = _.assign({}, merged, file);
		});
		return merged;
	});
};

export {
	allowedSslFiles,
	checkPrivateKey,
	cleanExpansions,
	cleanMeta,
	getCertificateInfo,
	getCertificateInfoFromFile,
	omissions,
	validate,
	zipFiles,
};
