const getLiveCertPath = (certificateId) => `/etc/letsencrypt/live/npm-${certificateId}`;
const getArchiveCertPath = (certificateId) => `/etc/letsencrypt/archive/npm-${certificateId}`;
const getRenewalConfigPath = (certificateId) => `/etc/letsencrypt/renewal/npm-${certificateId}.conf`;

export { getArchiveCertPath, getLiveCertPath, getRenewalConfigPath };
