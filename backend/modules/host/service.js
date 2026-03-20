import { cleanAllRowsCertificateMeta, cleanRowCertificateMeta, cleanSslHstsData } from "./certificate.js";
import {
	checkHostnameRecordsTaken,
	getHostsWithDomains,
	getHostsWithDomainsFromList,
	isHostnameTaken,
} from "./domains.js";

export default {
	cleanSslHstsData,
	cleanAllRowsCertificateMeta,
	cleanRowCertificateMeta,
	getHostsWithDomains,
	isHostnameTaken,
	_checkHostnameRecordsTaken: checkHostnameRecordsTaken,
	_getHostsWithDomains: getHostsWithDomainsFromList,
};
