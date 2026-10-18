/** Keep existing command fixtures while observing the asynchronous execFile boundary. */
export const legacyWireguardExecFile = (run) => (binary, args, options, callback) => {
	let command = [binary, ...args].join(" ");
	if (binary === "wg" && args[0] === "--version") command = "which wg";
	if (binary === "ip") command += " > /dev/null 2>&1";
	if (binary === "wg" && args[0] === "show") command = `/usr/bin/${command}`;
	queueMicrotask(() => {
		try {
			callback(null, run(command, options) || "", "");
		} catch (error) {
			callback(error, "", "");
		}
	});
};
