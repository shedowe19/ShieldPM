import fs from "node:fs";
import path from "path";
import error from "../../lib/error.js";
import { debug, ssl as logger } from "../../logger.js";
import { get } from "./reads.js";
import { getLiveCertPath } from "./mutations.js";
import { zipFiles } from "./helpers.js";

const download = async (access, data) => {
	await access.can("certificates:get", data);
	const certificate = await get(access, data);
	let zipDirectory;
	if (certificate.provider === "letsencrypt") zipDirectory = getLiveCertPath(data.id);
	else if (certificate.provider === "internal") zipDirectory = `/data/tls/internal/npm-${data.id}`;
	else if (certificate.provider === "other") zipDirectory = `/data/tls/custom/npm-${data.id}`;
	else throw new error.ValidationError("This certificate type cannot be downloaded");
	if (!fs.existsSync(zipDirectory)) throw new error.ItemNotFoundError(`Certificate ${certificate.nice_name} does not exist on disk`);
	const certFiles = (await fs.promises.readdir(zipDirectory)).filter((fn) => fn.endsWith(".pem") || fn.endsWith(".crt") || fn.endsWith(".key"));
	const certFilesWithRealPaths = await Promise.all(certFiles.map((fn) => fs.promises.realpath(path.join(zipDirectory, fn))));
	if (certFilesWithRealPaths.length === 0) throw new error.ItemNotFoundError(`No certificate files found for ${certificate.nice_name}`);
	const downloadName = `npm-${data.id}-${Date.now()}.zip`;
	const opName = `/tmp/${downloadName}`;
	await zipFiles(certFilesWithRealPaths, opName);
	debug(logger, "zip completed : ", opName);
	return { fileName: opName };
};

export { download };
