import fs from "node:fs";
import path from "node:path";
import utils from "../lib/utils.js";
import { debug, global as logger } from "../logger.js";

const internalDir = "/data/tls/internal";
const rootCaKey = path.join(internalDir, "root_ca.key");
const rootCaCrt = path.join(internalDir, "root_ca.crt");
const rootCaSrl = path.join(internalDir, "root_ca.srl");

/**
 * Ensure the Internal Directory exists
 */
const ensureDir = () => {
	if (!fs.existsSync(internalDir)) {
		fs.mkdirSync(internalDir, { recursive: true });
	}
};

/**
 * Generate Root CA if it doesn't exist
 * Uses Ed25519 for key and 10 year validity
 */
const ensureRootCa = async () => {
	ensureDir();

	if (fs.existsSync(rootCaKey) && fs.existsSync(rootCaCrt)) {
		return;
	}

	debug(logger, "Generating Internal Root CA...");

	// Generate Private Key
	await utils.execFile("openssl", ["genpkey", "-algorithm", "Ed25519", "-out", rootCaKey]);

	// Secure the key
	await utils.execFile("chmod", ["0600", rootCaKey]);

	// Generate Root Certificate (Self-Signed)
	// 3650 days = ~10 years
	await utils.execFile("openssl", [
		"req",
		"-x509",
		"-new",
		"-key",
		rootCaKey,
		"-days",
		"3650",
		"-out",
		rootCaCrt,
		"-subj",
		"/CN=NPMplus Internal CA/O=NPMplus/C=US",
	]);
};

/**
 * Create a Leaf Certificate signed by the Root CA
 * @param {Object} data
 * @param {Array}  data.domain_names
 * @param {Number} data.years
 * @param {String} outDir
 */
const createLeadCert = async (data, outDir) => {
	await ensureRootCa();

	if (!fs.existsSync(outDir)) {
		fs.mkdirSync(outDir, { recursive: true });
	}

	const keyPath = path.join(outDir, "privkey.pem");
	const csrPath = path.join(outDir, "request.csr");
	const certPath = path.join(outDir, "fullchain.pem"); // Nginx expects fullchain usually, but here it's just the leaf + root maybe?
	// Actually standard is cert + chain.
	// For internal, we can put Leaf + Root in fullchain.

	// 1. Generate Leaf Private Key (Ed25519)
	await utils.execFile("openssl", ["genpkey", "-algorithm", "Ed25519", "-out", keyPath]);
	await utils.execFile("chmod", ["0600", keyPath]);

	// 2. Create CSR
	// We need a config file for SANs (Subject Alternative Names)
	const sanList = data.domain_names.map((d) => `DNS:${d}`).join(",");
	const configPath = path.join(outDir, "openssl.cnf");

	// Minimal OpenSSL config for SAN
	const configContent = `
[req]
distinguished_name = req_distinguished_name
req_extensions = v3_req
prompt = no

[req_distinguished_name]
CN = ${data.domain_names[0]}

[v3_req]
keyUsage = critical, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = ${sanList}
`;
	fs.writeFileSync(configPath, configContent);

	await utils.execFile("openssl", ["req", "-new", "-key", keyPath, "-out", csrPath, "-config", configPath]);

	// 3. Sign CSR with Root CA
	const days = (data.years || 1) * 365;

	// We verify strict use of -CAcreateserial if srl doesn't exist
	const signArgs = [
		"x509",
		"-req",
		"-in",
		csrPath,
		"-CA",
		rootCaCrt,
		"-CAkey",
		rootCaKey,
		"-out",
		certPath,
		"-days",
		String(days),
		"-extfile",
		configPath,
		"-extensions",
		"v3_req",
	];

	if (!fs.existsSync(rootCaSrl)) {
		signArgs.push("-CAcreateserial");
		signArgs.push("-CAserial", rootCaSrl);
	} else {
		signArgs.push("-CAserial", rootCaSrl);
	}

	await utils.execFile("openssl", signArgs);

	// 4. Create Fullchain (Leaf + Root)
	// This allows clients that trust the Root to trust the Leaf.
	const leafContent = fs.readFileSync(certPath, "utf8");
	const rootContent = fs.readFileSync(rootCaCrt, "utf8");
	fs.writeFileSync(certPath, leafContent + "\n" + rootContent);

	// Cleanup temp files
	fs.unlinkSync(csrPath);
	fs.unlinkSync(configPath);

	return {
		fullchain: certPath,
		privkey: keyPath,
	};
};

/**
 * Get Root CA Content
 */
const getRootCa = async () => {
	await ensureRootCa();
	return fs.readFileSync(rootCaCrt, "utf8");
};

export default {
	ensureRootCa,
	createLeadCert,
	getRootCa,
	internalDir,
};
