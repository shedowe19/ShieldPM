import _ from "lodash";

const cleanSslHstsData = (newCert, data, existingData) => {
	const combinedData = _.assign({}, existingData || {}, data);
	if (!combinedData.certificate_id && !newCert) {
		combinedData.hsts_subdomains = false;
		combinedData.ssl_forced = false;
	}
	if (!combinedData.ssl_forced) {
		combinedData.hsts_enabled = false;
	}
	return combinedData;
};

const cleanAllRowsCertificateMeta = (rows) => {
	rows.map((_, idx) => {
		if (typeof rows[idx].certificate !== "undefined" && rows[idx].certificate) {
			rows[idx].certificate.meta = {};
		}
		return true;
	});
	return rows;
};

const cleanRowCertificateMeta = (row) => {
	if (typeof row.certificate !== "undefined" && row.certificate) {
		row.certificate.meta = {};
	}
	return row;
};

export { cleanAllRowsCertificateMeta, cleanRowCertificateMeta, cleanSslHstsData };
