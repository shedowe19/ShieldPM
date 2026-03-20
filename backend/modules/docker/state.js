import Docker from "dockerode";

const clients = [];
const reloadState = { timer: null };
const clearClients = () => {
	clients.length = 0;
};
const pushClient = (client) => clients.push(client);
const getClients = () => clients;

const createDockerClient = (hostString) => {
	let docker;
	let hostIp = "127.0.0.1";
	let isRemote = false;
	let name = hostString;
	if (hostString.startsWith("tcp://") || hostString.startsWith("http://") || hostString.startsWith("https://")) {
		const url = new URL(hostString);
		hostIp = url.hostname;
		isRemote = true;
		const dockerConfig = {
			host: url.hostname,
			port: url.port || 2375,
			protocol: url.protocol.replace(":", ""),
		};
		if (url.protocol === "tcp:") dockerConfig.protocol = "http";
		docker = new Docker(dockerConfig);
	} else {
		docker = new Docker({ socketPath: hostString });
		name = "Local Socket";
	}
	return { docker, hostIp, isRemote, name, isConnected: false };
};

export { clearClients, createDockerClient, getClients, pushClient, reloadState };
