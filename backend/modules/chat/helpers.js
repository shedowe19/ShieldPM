import jwt from "jsonwebtoken";
import access from "../../lib/access.js";
import { getPrivateKey } from "../../lib/config.js";

const smartEscape = (text) => {
	const parts = text.split(/(`[^`]+`|```[\s\S]+?```)/g);
	return parts
		.map((part) => {
			if (part.startsWith("`")) return part;
			return part.replace(/([_*[\]()~>#+\-=|{}.!\\`])/g, "\\$1");
		})
		.join("");
};

const createShieldAccess = (integrationUserId) => {
	const secret = /** @type {string} */ (getPrivateKey());
	const generatedToken = jwt.sign(
		{ scope: ["user"], attrs: { id: integrationUserId } },
		secret,
		{ algorithm: "RS256", expiresIn: "5m" },
	);
	return new access(generatedToken);
};

export { createShieldAccess, smartEscape };
