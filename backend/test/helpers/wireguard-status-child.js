// Real delayed process boundary for WireGuard status tests; arguments remain data.
const [output = "", result] = process.argv.slice(2);
setTimeout(() => {
	if (result === "fail") process.exitCode = 1;
	else process.stdout.write(output);
}, 20);
