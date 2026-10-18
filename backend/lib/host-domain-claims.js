import db from "../db.js";
import { HostDomainClaim, HostDomainClaimLock, HostDomainClaimOwner } from "../models/host_domain_claim.js";
import errs from "./error.js";
import { domainClaimKey } from "./host-domain-claim-key.js";

const hostTypes = new Set(["proxy", "redirection", "dead"]);

/** Nginx server names use case-insensitive claims; duplicates on one host are one claim. */
export const normalizeDomainClaims = (domains) => {
	if (!Array.isArray(domains) || domains.some((domain) => typeof domain !== "string" || !domain.length)) {
		throw new errs.ValidationError("Domain claims require an array of nonempty domain names");
	}
	return [...new Set(domains.map((domain) => domain.toLowerCase()))];
};

/**
 * Atomically claim names and perform the host write. Every writer must use the
 * supplied transaction; an empty list releases a deleted host's claims.
 * Existing collisions are preserved, while assigning a name to a new owner is rejected.
 * @template T
 * @param {{hostType: string, hostId?: number, domainNames: string[], retainedDomainNames?: string[]}} options
 * @param {(trx: import("objection").Transaction) => PromiseLike<T>} write
 * @returns {Promise<T>}
 */
export const withHostDomainClaims = async ({ hostType, hostId, domainNames, retainedDomainNames = [] }, write) => {
	if (!hostTypes.has(hostType) || (hostId !== undefined && (!Number.isSafeInteger(hostId) || hostId <= 0))) {
		throw new errs.InternalValidationError("Invalid host domain claim owner");
	}
	const names = normalizeDomainClaims([
		...normalizeDomainClaims(domainNames),
		...normalizeDomainClaims(retainedDomainNames),
	]);
	const database = db();
	return database.transaction(
		async (trx) => {
			// A write before any claim read also avoids deferred SQLite snapshots.
			// PostgreSQL/MySQL retain this row lock until host and registry commit.
			const locked = Number(await HostDomainClaimLock.query(trx).where("id", 1).increment("sequence", 1));
			if (locked !== 1) throw new errs.ConfigurationError("The host domain claim registry is not initialized");
			const existing = hostId
				? await HostDomainClaimOwner.query(trx).where({ host_type: hostType, host_id: hostId })
				: [];
			const existingNames = new Set(existing.map((claim) => claim.domain_name));
			if (names.length) {
				const claims = await HostDomainClaimOwner.query(trx).whereIn("domain_key", names.map(domainClaimKey));
				for (const claim of claims) {
					if (claim.host_type === hostType && claim.host_id === hostId) continue;
					// An upgrade never deletes working legacy hosts or silently picks a winner.
					if (existingNames.has(claim.domain_name)) continue;
					throw new errs.ValidationError(`${claim.domain_name} is already in use`);
				}
			}
			const result = await write(trx);
			const ownerId = hostId || Number(/** @type {any} */ (result)?.id);
			if (!Number.isSafeInteger(ownerId) || ownerId <= 0) {
				throw new errs.InternalValidationError("A host domain claim write must return its new host ID");
			}
			await HostDomainClaimOwner.query(trx).where({ host_type: hostType, host_id: ownerId }).delete();
			for (const domain of names) {
				const key = domainClaimKey(domain);
				await HostDomainClaim.query(trx)
					.insert({ domain_key: key, domain_name: domain })
					.onConflict("domain_key")
					.ignore();
				await HostDomainClaimOwner.query(trx).insert({
					domain_key: key,
					domain_name: domain,
					host_type: hostType,
					host_id: ownerId,
				});
			}
			const affected = [...new Set([...existingNames, ...names])];
			if (affected.length) {
				await HostDomainClaim.query(trx)
					.whereIn("domain_key", affected.map(domainClaimKey))
					.whereNotExists(
						HostDomainClaimOwner.query(trx)
							.select(1)
							.whereColumn("host_domain_claim_owner.domain_key", "host_domain_claim.domain_key"),
					)
					.delete();
			}
			return result;
		},
		database.client.dialect === "postgresql" ? { isolationLevel: "read committed" } : undefined,
	);
};
