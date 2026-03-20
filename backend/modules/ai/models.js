const getModels = async (access, config) => {
	await access.can("settings:list");
	if (config.provider === "gemini") {
		if (!config.api_key) throw new Error("API Key is required");
		const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${config.api_key}`;
		const res = await fetch(url);
		if (!res.ok) throw new Error(`Gemini Error: ${res.status} ${res.statusText}`);
		const data = await res.json();
		return (data.models || [])
			.filter((m) => m.name.includes("gemini"))
			.map((m) => ({ id: m.name.replace("models/", ""), name: m.displayName || m.name }))
			.sort((a, b) => b.id.localeCompare(a.id));
	}
	const baseUrl = config.base_url || "http://localhost:11434";
	let targetUrl;
	try {
		const parsedBase = new URL(baseUrl);
		if (!["http:", "https:"].includes(parsedBase.protocol))
			throw new Error("Only HTTP/HTTPS protocols are allowed for base_url");
		targetUrl = new URL("v1/models", parsedBase);
	} catch (err) {
		throw new Error(`Invalid base_url: ${err.message}`);
	}
	const headers = {};
	if (config.api_key) headers.Authorization = `Bearer ${config.api_key}`;
	const res = await fetch(targetUrl.toString(), { headers });
	if (!res.ok) throw new Error(`Local Provider Error: ${res.status} ${res.statusText}`);
	const data = await res.json();
	return (data.data || []).map((m) => ({ id: m.id, name: m.id })).sort((a, b) => a.id.localeCompare(b.id));
};

export { getModels };
