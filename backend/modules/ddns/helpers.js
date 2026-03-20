const INTERVAL = 1000 * 60;
let timer = null;
let lastKnownIps = { ipv4: null, ipv6: null };

const getLastKnownIps = () => lastKnownIps;
const setLastKnownIps = (ips) => {
	lastKnownIps = { ...ips };
};
const setTimer = (value) => {
	timer = value;
};
const getTimer = () => timer;

export { INTERVAL, getLastKnownIps, getTimer, setLastKnownIps, setTimer };
