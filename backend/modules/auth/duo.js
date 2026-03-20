import crypto from "node:crypto";
import { Client as DuoClient } from "@duosecurity/duo_universal";
import errs from "../../lib/error.js";
import UserTwoFa from "../../models/user-2fa.js";
import { ensureBackupCodesExist } from "./backup-codes.js";

const createDuoClient = (duoConfig) => {
	try {
		return new DuoClient({
			clientId: duoConfig.clientId,
			clientSecret: duoConfig.clientSecret,
			apiHost: duoConfig.apiHost,
			redirectUrl: duoConfig.redirectUrl,
		});
	} catch (err) {
		throw new errs.ValidationError(`Invalid Duo configuration: ${err.message}`);
	}
};

const setupDuo = async (userId, config) => {
	const { clientId, clientSecret, apiHost, redirectUrl } = config;
	if (!clientId || !clientSecret || !apiHost || !redirectUrl) {
		throw new errs.ValidationError("All Duo configuration fields are required");
	}

	const client = createDuoClient({ clientId, clientSecret, apiHost, redirectUrl });
	await client.healthCheck();
	await UserTwoFa.query().patch({ is_deleted: 1 }).where({ user_id: userId, type: "duo", is_deleted: 0 });

	const record = await UserTwoFa.query().insertAndFetch({
		user_id: userId,
		type: "duo",
		label: "Duo Security",
		meta: { clientId, clientSecret, apiHost, redirectUrl },
		is_verified: 1,
	});

	await ensureBackupCodesExist(userId);
	return record;
};

const beginDuoAuthentication = async (userId, userEmail) => {
	const duoRecord = await UserTwoFa.query().findOne({ user_id: userId, type: "duo", is_verified: 1, is_deleted: 0 });
	if (!duoRecord) {
		throw new errs.ValidationError("Duo Security is not configured for this user");
	}

	const client = createDuoClient(duoRecord.meta);
	const state = crypto.randomBytes(32).toString("base64url");
	const authUrl = await client.createAuthUrl(userEmail, state);
	return { authUrl, state };
};

const completeDuoAuthentication = async (userId, userEmail, duoCode) => {
	const duoRecord = await UserTwoFa.query().findOne({ user_id: userId, type: "duo", is_verified: 1, is_deleted: 0 });
	if (!duoRecord) {
		throw new errs.ValidationError("Duo Security is not configured for this user");
	}

	const client = createDuoClient(duoRecord.meta);
	const tokenResult = await client.exchangeAuthorizationCodeFor2FAResult(duoCode, userEmail);
	return !!tokenResult;
};

export { beginDuoAuthentication, completeDuoAuthentication, createDuoClient, setupDuo };
