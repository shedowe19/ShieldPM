/**
 * Debug script: tests requireSelfOrAdmin comparison logic
 *
 * Run with: node backend/test/debug-2fa-permission.mjs
 *
 * Tests different combinations of req.params.user_id and getUserId() return values
 * to reveal when the comparison fails.
 */

// Reproduce the exact comparison used in requireSelfOrAdmin
function checkPermission(reqParamUserId, getAttrsId) {
	// Simulate userIdFromMe middleware (the "me" branch sets it to attrs.id raw,
	// the else branch uses parseInt)
	const simulateUserIdFromMe = (paramValue, attrsId) => {
		if (paramValue === "me") {
			// "me" branch: sets to raw attrs.id without any conversion
			return attrsId;
		} else {
			// else branch: parseInt
			return Number.parseInt(paramValue, 10);
		}
	};

	const resolvedParam = simulateUserIdFromMe(reqParamUserId, getAttrsId);

	// Simulate requireSelfOrAdmin
	const targetUserId = Number(resolvedParam);
	const requesterId = Number(getAttrsId); // getUserId() returns attrs.id

	const match = requesterId === targetUserId;
	const requesterIdFalsy = !requesterId;

	return {
		reqParamUserId,
		attrsId: getAttrsId,
		attrsIdType: typeof getAttrsId,
		resolvedParam,
		resolvedParamType: typeof resolvedParam,
		targetUserId,
		targetUserIdType: typeof targetUserId,
		requesterId,
		requesterIdType: typeof requesterId,
		requesterIdFalsy,
		match,
		result: requesterIdFalsy ? "UnauthorizedError" : match ? "OK" : "PermissionError ← BUG",
	};
}

console.log("=== Testing requireSelfOrAdmin comparison scenarios ===\n");

const scenarios = [
	// URL "me" with numeric attrs.id
	{ urlParam: "me", attrsId: 5 },
	// URL "me" with string attrs.id
	{ urlParam: "me", attrsId: "5" },
	// URL numeric string matching numeric attrs.id
	{ urlParam: "5", attrsId: 5 },
	// URL numeric string with string attrs.id  ← PRE-FIX BUG SCENARIO
	{ urlParam: "5", attrsId: "5" },
	// URL "me" with attrs.id = 0 (edge case)
	{ urlParam: "me", attrsId: 0 },
	// URL "me" with attrs.id = "0" (edge case)
	{ urlParam: "me", attrsId: "0" },
	// URL "me" but access is null (simulated by passing null as attrs.id)
	// This tests what happens when userIdFromMe falls to else branch with "me"
	{ urlParam: "me", attrsId: null, description: "attrs.id is null" },
	// URL different from token (different user - should fail)
	{ urlParam: "3", attrsId: 5 },
];

for (const scenario of scenarios) {
	const result = checkPermission(scenario.urlParam, scenario.attrsId);
	const label = scenario.description || `url="${scenario.urlParam}", attrs.id=${JSON.stringify(scenario.attrsId)} (${typeof scenario.attrsId})`;
	const status = result.result.includes("BUG") ? "❌ FAIL" : result.result.includes("Unauthorized") ? "⚠️  AUTH" : result.result === "OK" && scenario.urlParam !== "3" ? "✅ OK" : result.result === "PermissionError ← BUG" && scenario.urlParam === "3" ? "✅ OK (expected deny)" : "✅ OK";
	console.log(`${status} | ${label}`);
	if (result.result.includes("BUG") || result.result.includes("Unauthorized")) {
		console.log(`       targetUserId=${result.targetUserId} (from resolved param: ${JSON.stringify(result.resolvedParam)}, type: ${result.resolvedParamType})`);
		console.log(`       requesterId=${result.requesterId} (from attrs.id: ${JSON.stringify(result.attrsId)}, type: ${result.attrsIdType})`);
		console.log(`       match: ${result.match}`);
	}
}

console.log("\n=== Key insight ===");
console.log("The bug occurs when req.params.user_id is 'me' but res.locals.access is falsy,");
console.log("causing userIdFromMe to fall into the else branch and parseInt('me') = NaN.");
console.log("However, with a valid token, attrs.id provides consistent values for both sides.");
console.log("\nThe pre-fix issue was: getUserId() returned a string but targetUserId was a number,");
console.log("so 'string !== number' was always true (strict inequality ===).");
console.log("\nThe current fix (Number() wrapping) correctly handles string/number type differences.");
console.log("\nIf the error persists after the fix, it means the token attrs.id and the URL");
console.log("user_id are genuinely different values - likely a frontend or session issue.");
