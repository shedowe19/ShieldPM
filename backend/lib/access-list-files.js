/** Only server-generated digests may select an immutable authorization artifact. */
export function accessListFiles(list, base = `/data/access/${list.id}`) {
	const revision = list.meta?.authorization_revision;
	const suffix = typeof revision === "string" && /^[a-f0-9]{64}$/.test(revision) ? `.${revision}` : "";
	return { auth: `${base}${suffix}`, ca: `${base}${suffix}.crt` };
}
