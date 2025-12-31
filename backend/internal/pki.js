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
 * Uses ECDSA P-384 (secp384r1) for key and 10 year validity
 */
const ensureRootCa = async () => {
	ensureDir();

	if (fs.existsSync(rootCaKey) && fs.existsSync(rootCaCrt)) {
		return;
	}

	debug(logger, "Generating Internal Root CA...");

	// Generate Private Key (ECDSA P-384)
	await utils.execFile("openssl", [
		"genpkey",
		"-algorithm",
		"EC",
		"-pkeyopt",
		"ec_paramgen_curve:secp384r1",
		"-out",
		rootCaKey,
	]);

	// Secure the key
	await utils.execFile("chmod", ["0600", rootCaKey]);

	// Generate Root Certificate (Self-Signed)
	// 3650 days = ~10 years
	await utils.execFile("openssl", [
		"req",
		"-x509",
		"-new",
		"-sha384",
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

	// 1. Generate Leaf Private Key (ECDSA P-384)
	await utils.execFile("openssl", [
		"genpkey",
		"-algorithm",
		"EC",
		"-pkeyopt",
		"ec_paramgen_curve:secp384r1",
		"-out",
		keyPath,
	]);
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

	await utils.execFile("openssl", [
		"req",
		"-new",
		"-sha384",
		"-key",
		keyPath,
		"-out",
		csrPath,
		"-config",
		configPath,
	]);

	// 3. Sign CSR with Root CA
	const days = (data.years || 1) * 365;

	// We verify strict use of -CAcreateserial if srl doesn't exist
	const signArgs = [
		"x509",
		"-req",
		"-sha384",
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
	fs.writeFileSync(certPath, `${leafContent}\n${rootContent}`);

	// Cleanup temp files
	fs.unlinkSync(csrPath);
	fs.unlinkSync(configPath);

	return {
		fullchain: certPath,
		privkey: keyPath,
	};
};

/**
 * Create a Client Certificate (p12) signed by the Root CA
 * @param {Object} data
 * @param {String} data.common_name
 * @param {Number} data.years
 * @param {String} data.password
 * @param {String} outDir
 */
const createClientCert = async (data, outDir) => {
	await ensureRootCa();

	if (!fs.existsSync(outDir)) {
		fs.mkdirSync(outDir, { recursive: true });
	}

	const keyPath = path.join(outDir, "client.key");
	const csrPath = path.join(outDir, "client.csr");
	const certPath = path.join(outDir, "client.crt");
	const p12Path = path.join(outDir, "client.p12");

	// 1. Generate Client Key (ECDSA P-384)
	await utils.execFile("openssl", [
		"genpkey",
		"-algorithm",
		"EC",
		"-pkeyopt",
		"ec_paramgen_curve:secp384r1",
		"-out",
		keyPath,
	]);
	await utils.execFile("chmod", ["0600", keyPath]);

	// 2. Create CSR (Client Auth Extended Usage)
	const configPath = path.join(outDir, "openssl-client.cnf");
	const configContent = `
[req]
distinguished_name = req_distinguished_name
req_extensions = v3_req
prompt = no

[req_distinguished_name]
CN = ${data.common_name}

[v3_req]
keyUsage = critical, digitalSignature, keyEncipherment
extendedKeyUsage = clientAuth
`;
	fs.writeFileSync(configPath, configContent);

	await utils.execFile("openssl", [
		"req",
		"-new",
		"-sha384",
		"-key",
		keyPath,
		"-out",
		csrPath,
		"-config",
		configPath,
	]);

	// 3. Sign CSR with Root CA
	const days = (data.years || 1) * 365;
	const signArgs = [
		"x509",
		"-req",
		"-sha384",
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

	// 4. Export to PKCS#12 (.p12)
	await utils.execFile("openssl", [
		"pkcs12",
		"-export",
		"-out",
		p12Path,
		"-inkey",
		keyPath,
		"-in",
		certPath,
		"-certfile",
		rootCaCrt,
		"-passout",
		`pass:${data.password}`,
	]);

	// Cleanup temp files (keep p12 only? No, maybe keep them for reference if needed,
	// but mostly we just return p12 path and let the caller handle it.
	// The temp dir is usually specific to this request or a tmp folder.)
	// For safety, let's remove the raw key immediately.
	fs.unlinkSync(keyPath);
	fs.unlinkSync(csrPath);
	fs.unlinkSync(configPath);
	// We keep certPath temporarily if needed, but p12 has it.

	return p12Path;
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
	createClientCert,
	getRootCa,
	internalDir,
};
