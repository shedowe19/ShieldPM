export const acmeOptionFields = [
	"server",
	"email",
	"account_id",
	"eab_kid",
	"agree_tos",
	"must_staple",
	"ocsp_stapling",
	"server_tls_verify",
	"custom_ocsp_stapling",
	"default_certificate_id",
];

/** Return an allowlisted settings representation, including for malformed imported credentials.
 * @param {Record<string, any>} meta
 * @returns {Record<string, any>}
 */
export const publicAcmeOptions = (meta) => ({
	...Object.fromEntries(acmeOptionFields.map((field) => [field, meta?.[field]])),
	eab_hmac_key_set: Boolean(meta?.encrypted_eab_hmac_key),
});

/** Redact every settings API/export path without exposing ciphertext or unexpected private fields.
 * @template {{id: string, meta?: any}} T
 * @param {T} row
 * @returns {T}
 */
export const redactAcmeSetting = (row) =>
	row.id === "acme-options" ? { ...row, meta: publicAcmeOptions(row.meta) } : row;
