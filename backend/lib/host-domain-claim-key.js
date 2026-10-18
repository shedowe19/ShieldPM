import { createHash } from "node:crypto";

/** Fixed ASCII registry keys preserve long names and avoid database text-collation aliases. */
export const domainClaimKey = (domain) => createHash("sha256").update(domain.toLowerCase()).digest("hex");
