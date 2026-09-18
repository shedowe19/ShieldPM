const ranges = {
	"1h": { amount: 1, resolution: "minute", unit: "hour" },
	"24h": { amount: 24, resolution: "minute", unit: "hour" },
	"7d": { amount: 7, resolution: "hour", unit: "day" },
	"30d": { amount: 30, resolution: "day", unit: "day" },
};

const resolveAnalyticsRange = (value, now) => {
	const range = Object.hasOwn(ranges, value) ? value : "24h";
	const policy = ranges[range];
	return {
		range,
		resolution: policy.resolution,
		since: now.subtract(policy.amount, policy.unit),
	};
};

export { resolveAnalyticsRange };
