import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { domainToASCII } from "node:url";
import errs from "../lib/error.js";
import utils from "../lib/utils.js";
import { debug, global as logger } from "../logger.js";

const internalDir = "/data/tls/internal";
const rootCaKey = path.join(internalDir, "root_ca.key");
const rootCaCrt = path.join(internalDir, "root_ca.crt");
let rootCaPromise = null;

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
const generateRootCa = async () => {
	ensureDir();

	if (fs.existsSync(rootCaKey) && fs.existsSync(rootCaCrt)) {
		return;
	}
	if (fs.existsSync(rootCaCrt) && !fs.existsSync(rootCaKey)) {
		throw new errs.ConfigurationError(
			"The Internal CA private key is missing. Restore the original CA key from backup.",
		);
	}

	debug(logger, "Generating Internal Root CA...");
	const stagingDir = await fs.promises.mkdtemp(path.join(internalDir, ".root-ca-"));
	const stagingKey = path.join(stagingDir, "root_ca.key");
	const stagingCertificate = path.join(stagingDir, "root_ca.crt");
	try {
		// Preserve an existing key if certificate creation is being retried.
		if (!fs.existsSync(rootCaKey)) {
			await utils.execFile("openssl", [
				"genpkey",
				"-algorithm",
				"EC",
				"-pkeyopt",
				"ec_paramgen_curve:secp384r1",
				"-out",
				stagingKey,
			]);
			await fs.promises.chmod(stagingKey, 0o600);
			await fs.promises.rename(stagingKey, rootCaKey);
		}

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
			stagingCertificate,
			"-subj",
			"/CN=ShieldPM Internal CA/O=ShieldPM/C=US",
			"-addext",
			"basicConstraints=critical,CA:TRUE",
			"-addext",
			"keyUsage=critical,keyCertSign,cRLSign",
		]);
		await fs.promises.rename(stagingCertificate, rootCaCrt);
	} finally {
		await fs.promises.rm(stagingDir, { recursive: true, force: true });
	}
};

const ensureRootCa = async () => {
	if (!rootCaPromise) {
		rootCaPromise = generateRootCa().finally(() => {
			rootCaPromise = null;
		});
	}
	return rootCaPromise;
};

const validityDays = (years = 1) => {
	const value = Number(years);
	if (!Number.isInteger(value) || value < 1 || value > 10) {
		throw new errs.ValidationError("Certificate validity must be between 1 and 10 years");
	}
	return value * 365;
};

const serialArgs = () => ["-set_serial", `0x${crypto.randomBytes(19).toString("hex")}`];

/**
 * Create a Leaf Certificate signed by the Root CA
 * @param {Object} data
 * @param {Array}  data.domain_names
 * @param {Number} data.years
 * @param {String} outDir
 */
const createLeadCert = async (data, outDir) => {
	const days = validityDays(data.years);
	if (!Array.isArray(data.domain_names) || data.domain_names.length === 0) {
		throw new errs.ValidationError("At least one domain name is required for certificate creation");
	}
	const validDomain = /^(?:\*\.)?[\p{L}\p{N}.-]+$/u;
	for (const domain of data.domain_names) {
		if (typeof domain !== "string" || !validDomain.test(domain)) {
			throw new errs.ValidationError("Invalid domain name for certificate creation");
		}
	}
	const domains = data.domain_names.map((domain) => domainToASCII(domain));
	if (domains.some((domain) => !domain)) {
		throw new errs.ValidationError("Invalid domain name for certificate creation");
	}
	await ensureRootCa();
	await fs.promises.mkdir(outDir, { recursive: true });

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
	const sanList = domains.map((d) => `DNS:${d}`).join(",");
	const configPath = path.join(outDir, "openssl.cnf");

	// Minimal OpenSSL config for SAN
	const configContent = `
[req]
distinguished_name = req_distinguished_name
req_extensions = v3_req
prompt = no

[req_distinguished_name]
CN = ${domains[0]}

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

	// Independent serials avoid a shared mutable serial-number file.
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

	signArgs.push(...serialArgs());

	await utils.execFile("openssl", signArgs);

	// 4. Create Fullchain (Leaf + Root)
	// This allows clients that trust the Root to trust the Leaf.
	const [leafContent, rootContent] = await Promise.all([
		fs.promises.readFile(certPath, "utf8"),
		fs.promises.readFile(rootCaCrt, "utf8"),
	]);
	await fs.promises.writeFile(certPath, `${leafContent}\n${rootContent}`);

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
	const days = validityDays(data.years);
	if (typeof data.common_name !== "string" || !/^[a-zA-Z0-9.\-@]+$/.test(data.common_name)) {
		throw new errs.ValidationError(
			"Invalid Common Name: Only alphanumeric characters, dots, dashes, and @ are allowed.",
		);
	}
	if (typeof data.password !== "string" || data.password.includes("\0")) {
		throw new errs.ValidationError("A valid PKCS#12 password string is required");
	}
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

	signArgs.push(...serialArgs());

	await utils.execFile("openssl", signArgs);

	// 4. Export to PKCS#12 (.p12)
	await utils.execFile(
		"openssl",
		[
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
			"env:SHIELDPM_P12_PASSWORD",
		],
		{ env: { ...process.env, SHIELDPM_P12_PASSWORD: data.password } },
	);

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
	return await fs.promises.readFile(rootCaCrt, "utf8");
};

export default {
	ensureRootCa,
	createLeadCert,
	createClientCert,
	getRootCa,
	internalDir,
};
