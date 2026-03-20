import fs from "node:fs";
import path from "node:path";
import util from "node:util";
import { execFile } from "node:child_process";
import { ensureCa } from "./ca.js";

const execFileAsync = util.promisify(execFile);

const createSanConfig = async (dir, domains) => {
	const configPath = path.join(dir, "openssl.cnf");
	const sanEntries = domains.map((d, i) => `DNS.${i + 1} = ${d}`).join("\n");
	const content = `[ req ]
default_bits = 2048
prompt = no
default_md = sha256
req_extensions = req_ext
distinguished_name = dn

[ dn ]
CN = ${domains[0]}

[ req_ext ]
subjectAltName = @alt_names

[ alt_names ]
${sanEntries}
`;
	await fs.promises.writeFile(configPath, content, "utf8");
	return configPath;
};

const createLeafCert = async ({ domain_names, years = 10 }, outDir) => {
	const ca = await ensureCa();
	await fs.promises.mkdir(outDir, { recursive: true });
	const keyPath = path.join(outDir, "privkey.pem");
	const csrPath = path.join(outDir, "leaf.csr");
	const certPath = path.join(outDir, "cert.pem");
	const fullchainPath = path.join(outDir, "fullchain.pem");
	const sanConfig = await createSanConfig(outDir, domain_names);
	await execFileAsync("openssl", ["genrsa", "-out", keyPath, "2048"]);
	await execFileAsync("openssl", ["req", "-new", "-key", keyPath, "-out", csrPath, "-config", sanConfig]);
	await execFileAsync("openssl", [
		"x509",
		"-req",
		"-in",
		csrPath,
		"-CA",
		ca.cert,
		"-CAkey",
		ca.key,
		"-CAcreateserial",
		"-out",
		certPath,
		"-days",
		String(365 * years),
		"-sha256",
		"-extensions",
		"req_ext",
		"-extfile",
		sanConfig,
	]);
	const certPem = await fs.promises.readFile(certPath, "utf8");
	const caPem = await fs.promises.readFile(ca.cert, "utf8");
	await fs.promises.writeFile(fullchainPath, `${certPem}\n${caPem}`);
	return {
		privkey: keyPath,
		cert: certPath,
		fullchain: fullchainPath,
		ca: ca.cert,
	};
};

export { createLeafCert };
