import { ensureCa, PKI_DIR, ROOT_CERT, ROOT_KEY, ROOT_SERIAL } from "./ca.js";
import { createLeafCert } from "./leaf.js";

const createLeadCert = async (options, outDir) => createLeafCert(options, outDir);

export default {
	PKI_DIR,
	ROOT_KEY,
	ROOT_CERT,
	ROOT_SERIAL,
	ensureCa,
	createLeafCert,
	createLeadCert,
};
