import internalCertificate from "../../certificate.js";
import internalPki from "../../pki.js";
import dnsPlugins from "../../../certbot/dns-plugins.json" with { type: "json" };

export const get_certificates = async (access, args) => {
	const certs = await internalCertificate.getAll(access);
	return JSON.stringify(
		certs.map((c) => ({
			id: c.id,
			nice_name: c.nice_name,
			provider: c.provider,
			domain_names: c.domain_names,
			expires_on: c.expires_on,
		})),
	);
};

export const create_certificate = async (access, args) => {
	const meta = args.meta || {};
	if (args.provider === "letsencrypt") {
		meta.letsencrypt_agree = true; // Force agree via AI
		if (!meta.email) meta.email = "admin@example.com";
	}

	const newCert = await internalCertificate.create(access, {
		provider: args.provider,
		domain_names: args.domain_names,
		meta: meta,
	});
	return `Created Certificate ID: ${newCert.id} (${args.provider})`;
};

export const update_certificate = async (access, args) => {
	await internalCertificate.update(access, { id: args.id, ...args });
	return `Updated Certificate ID: ${args.id}`;
};

export const delete_certificate = async (access, args) => {
	await internalCertificate.delete(access, { id: args.id });
	return `Deleted Certificate ID: ${args.id}`;
};

export const renew_certificate = async (access, args) => {
	const cert = await internalCertificate.get(access, { id: args.id });
	if (cert.provider === "letsencrypt") {
		await internalCertificate.requestCertbot(cert);
		return `Renewed Certificate ID: ${args.id}`;
	}
	return "Error: Only LetsEncrypt certificates can be renewed.";
};

export const get_certificate_details = async (access, args) => {
	const cert = await internalCertificate.get(access, { id: args.id });
	return JSON.stringify(cert, null, 2);
};

export const validate_certificate = async (access, args) => {
	const files = {
		certificate: { data: Buffer.from(args.certificate) },
		certificate_key: { data: Buffer.from(args.certificate_key) },
	};
	if (args.intermediate_certificate) {
		files.intermediate_certificate = {
			data: Buffer.from(args.intermediate_certificate),
		};
	}
	const valid = await internalCertificate.validate({ files: files });
	return JSON.stringify(valid, null, 2);
};

export const upload_certificate = async (access, args) => {
	const files = {
		certificate: { data: Buffer.from(args.certificate) },
		certificate_key: { data: Buffer.from(args.certificate_key) },
	};
	if (args.intermediate_certificate) {
		files.intermediate_certificate = {
			data: Buffer.from(args.intermediate_certificate),
		};
	}
	await internalCertificate.upload(access, { id: args.id, files: files });
	return `Uploaded certificate content for ID: ${args.id}`;
};

export const create_client_certificate = async (access, args) => {
	const tmpDir = `/tmp/client-cert-${Date.now()}`;
	const p12Path = await internalPki.createClientCert(
		{
			common_name: args.common_name,
			password: args.password,
			years: args.years || 1,
		},
		tmpDir,
	);
	return `Client Certificate Created at: ${p12Path}. You can retrieve it from the server filesystem.`;
};

export const test_http_challenge = async (access, args) => {
	const testResult = await internalCertificate.testHttpsChallenge(access, {
		domains: args.domains,
	});
	return JSON.stringify(testResult);
};

export const get_dns_plugins = async (access, args) => {
	const plugins = dnsPlugins;
	return JSON.stringify(Object.keys(plugins).map((k) => ({ id: k, name: plugins[k].name })));
};
