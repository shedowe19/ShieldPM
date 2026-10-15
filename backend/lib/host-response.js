import _ from "lodash";
import { publicAccessListCredentials } from "./service-credentials.js";

// DNS credentials belong to the certificate, never to host responses or audit history.
export const sanitizeHostMeta = (meta) => _.omit(meta, ["dns_provider_credentials", "dnsProviderCredentials"]);

/** Remove connection credentials from a host returned through APIs or audit metadata. */
export const sanitizeProxyHost = (host) => {
	const row = _.omit(host, [
		"is_deleted",
		"maintenance_pending",
		"owner.is_deleted",
		"git_credentials",
		"terminal_password",
		"terminal_private_key",
	]);
	if (row.meta) row.meta = sanitizeHostMeta(row.meta);
	if (row.forward_host?.startsWith("/data/websites/")) {
		row.forward_host = "(managed)";
	}
	if (row.certificate) {
		row.certificate = { ...row.certificate, meta: {} };
	}
	if (row.access_list) {
		row.access_list = {
			...row.access_list,
			...publicAccessListCredentials(row.access_list.meta),
		};
		if (Array.isArray(row.access_list.items)) {
			row.access_list.items = row.access_list.items.map((item) => _.omit(item, ["password"]));
		}
	}
	return row;
};
