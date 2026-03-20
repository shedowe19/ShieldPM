import fs from "node:fs";
import path from "node:path";
import util from "node:util";
import { execFile } from "node:child_process";

const execFileAsync = util.promisify(execFile);
const PKI_DIR = "/data/tls/internal";
const ROOT_KEY = path.join(PKI_DIR, "root_ca.key");
const ROOT_CERT = path.join(PKI_DIR, "root_ca.crt");
const ROOT_SERIAL = path.join(PKI_DIR, "root_ca.srl");

const ensureCa = async () => {
	await fs.promises.mkdir(PKI_DIR, { recursive: true });
	const hasRoot = fs.existsSync(ROOT_KEY) && fs.existsSync(ROOT_CERT);
	if (hasRoot) {
		return { key: ROOT_KEY, cert: ROOT_CERT, serial: ROOT_SERIAL };
	}
	await execFileAsync("openssl", ["genrsa", "-out", ROOT_KEY, "4096"]);
	await execFileAsync("openssl", [
		"req",
		"-x509",
		"-new",
		"-nodes",
		"-key",
		ROOT_KEY,
		"-sha256",
		"-days",
		"3650",
		"-out",
		ROOT_CERT,
		"-subj",
		"/CN=ShieldPM Internal Root CA",
	]);
	return { key: ROOT_KEY, cert: ROOT_CERT, serial: ROOT_SERIAL };
};

export { PKI_DIR, ROOT_CERT, ROOT_KEY, ROOT_SERIAL, ensureCa };
