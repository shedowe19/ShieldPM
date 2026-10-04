import express from "express";

const listJson = express.json({ limit: "16mb" });
// A valid host can contain 1000 IP and 1000 ASN reasons, each with up to 1000 escaped characters.
const proxyHostJson = express.json({ limit: "16mb" });
const defaultJson = express.json();

/** Parse bounded JSON for list imports and host policies, retaining the default limit elsewhere. */
const jsonBody = (req, res, next) => {
	if (/^\/(?:api\/)?nginx\/firewall-lists(?:\/|$)/.test(req.path)) return listJson(req, res, next);
	if (/^\/(?:api\/)?nginx\/proxy-hosts(?:\/|$)/.test(req.path)) return proxyHostJson(req, res, next);
	return defaultJson(req, res, next);
};

export default jsonBody;
