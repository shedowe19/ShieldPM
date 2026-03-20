import { castJsonIfNeed } from "../../lib/helpers.js";
import deadHostModel from "../../models/dead_host.js";
import proxyHostModel from "../../models/proxy_host.js";
import redirectionHostModel from "../../models/redirection_host.js";

const checkHostnameRecordsTaken = (hostname, existingRows, ignoreId) => {
	let isTaken = false;
	if (existingRows?.length) {
		existingRows.map((existingRow) => {
			existingRow.domain_names.map((existingHostname) => {
				if (existingHostname.toLowerCase() === hostname.toLowerCase()) {
					if (!ignoreId || ignoreId !== existingRow.id) isTaken = true;
				}
				return true;
			});
			return true;
		});
	}
	return isTaken;
};

const getHostsWithDomainsFromList = (hosts, domainNames) => {
	const response = [];
	if (hosts?.length) {
		hosts.map((host) => {
			let hostMatches = false;
			domainNames.map((domainName) => {
				host.domain_names.map((hostDomainName) => {
					if (domainName.toLowerCase() === hostDomainName.toLowerCase()) hostMatches = true;
					return true;
				});
				return true;
			});
			if (hostMatches) response.push(host);
			return true;
		});
	}
	return response;
};

const getHostsWithDomains = async (domainNames) => {
	const responseObject = { total_count: 0, dead_hosts: [], proxy_hosts: [], redirection_hosts: [] };
	const [proxyRes, redirRes, deadRes] = await Promise.all([
		proxyHostModel.query().where("is_deleted", 0),
		redirectionHostModel.query().where("is_deleted", 0),
		deadHostModel.query().where("is_deleted", 0),
	]);
	responseObject.proxy_hosts = getHostsWithDomainsFromList(proxyRes, domainNames);
	responseObject.total_count += responseObject.proxy_hosts.length;
	responseObject.redirection_hosts = getHostsWithDomainsFromList(redirRes, domainNames);
	responseObject.total_count += responseObject.redirection_hosts.length;
	responseObject.dead_hosts = getHostsWithDomainsFromList(deadRes, domainNames);
	responseObject.total_count += responseObject.dead_hosts.length;
	return responseObject;
};

const isHostnameTaken = async (hostname, ignore_type, ignore_id) => {
	const promises = [
		proxyHostModel.query().where("is_deleted", 0).whereExists(proxyHostModel.relatedQuery("host_domains").where("domain_name", hostname)),
		redirectionHostModel.query().where("is_deleted", 0).andWhere(castJsonIfNeed("domain_names"), "like", `%${hostname}%`),
		deadHostModel.query().where("is_deleted", 0).andWhere(castJsonIfNeed("domain_names"), "like", `%${hostname}%`),
	];
	const promisesResults = await Promise.all(promises);
	let is_taken = false;
	if (promisesResults[0]) {
		if (checkHostnameRecordsTaken(hostname, promisesResults[0], ignore_type === "proxy" && ignore_id ? ignore_id : 0)) is_taken = true;
	}
	if (promisesResults[1]) {
		if (checkHostnameRecordsTaken(hostname, promisesResults[1], ignore_type === "redirection" && ignore_id ? ignore_id : 0)) is_taken = true;
	}
	if (promisesResults[2]) {
		if (checkHostnameRecordsTaken(hostname, promisesResults[2], ignore_type === "dead" && ignore_id ? ignore_id : 0)) is_taken = true;
	}
	return { hostname, is_taken };
};

export { checkHostnameRecordsTaken, getHostsWithDomains, getHostsWithDomainsFromList, isHostnameTaken };
