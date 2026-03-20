import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const torDataPath = process.env.TOR_DATA_PATH || "/data/tor";

const getEd25519Secret = (token) => {
	const h = crypto.createHash("sha256").update(token).digest();
	const header = Buffer.from([0x3d, 0x3d, 0x00, 0x02, 0x2b, 0x35, 0x04, 0x20]);
	return Buffer.concat([header, h]);
};

const writeTorKeyFiles = async (dir, token) => {
	await fs.promises.mkdir(dir, { recursive: true, mode: 0o700 });
	const hostname = `${token}.onion`;
	await fs.promises.writeFile(path.join(dir, "hostname"), `${hostname}\n`, { mode: 0o600 });
	const secret = getEd25519Secret(token);
	await fs.promises.writeFile(path.join(dir, "hs_ed25519_secret_key"), secret, { mode: 0o600 });
	const pub = Buffer.alloc(32, 0);
	const pubHeader = Buffer.from([0x3d, 0x3d, 0x00, 0x02, 0x2b, 0x35, 0x03, 0x20]);
	await fs.promises.writeFile(path.join(dir, "hs_ed25519_public_key"), Buffer.concat([pubHeader, pub]), { mode: 0o600 });
	return hostname;
};

const buildConfigText = (services) => {
	let cfg = "DataDirectory /var/lib/tor\nLog notice stdout\n";
	for (const svc of services) {
		cfg += `\nHiddenServiceDir ${svc.dir}\nHiddenServiceVersion 3\nHiddenServicePort 80 ${svc.target}\n`;
	}
	return cfg;
};

export { buildConfigText, torDataPath, writeTorKeyFiles };
