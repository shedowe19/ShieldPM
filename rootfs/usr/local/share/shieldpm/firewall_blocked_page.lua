-- Rendered for denied host-firewall requests by the internal Nginx location.
-- It intentionally contains no policy, feed, CIDR, upstream or operator metadata.
local function escape_html(value)
	return tostring(value or "")
		:gsub("&", "&amp;")
		:gsub("<", "&lt;")
		:gsub(">", "&gt;")
		:gsub('"', "&quot;")
		:gsub("'", "&#39;")
end

local german = string.sub(string.lower(ngx.var.http_accept_language or ""), 1, 2) == "de"
local policy_id = ngx.var.shieldpm_firewall_policy_id or "0"
local reason = ngx.var["shieldpm_firewall_" .. policy_id .. "_block_reason"] or "ip"
local client_ip = escape_html(ngx.var.remote_addr or "")
local country_code = escape_html(ngx.var.shieldpm_geoip_country_code or "")
local country_name = escape_html(german and ngx.var.shieldpm_geoip_country_name_de or ngx.var.shieldpm_geoip_country_name_en or "")
local country = country_name ~= "" and country_name .. " (" .. country_code .. ")" or country_code

local title = german and "Zugriff nicht verfügbar" or "Access unavailable"
local heading = german and "Zugriff gesperrt" or "Access blocked"
local message = reason == "country"
	and (german and "Zugriffe aus diesem Land sind für diesen Dienst nicht zugelassen." or "Access from this country is not permitted for this service.")
	or (german and "Diese IP-Adresse ist für diesen Dienst nicht zugelassen." or "This IP address is not permitted to access this service.")
local detail_heading = german and "Verbindungsdetails" or "Connection details"
local ip_label = german and "Ihre IP-Adresse" or "Your IP address"
local country_label = german and "Erkanntes Land" or "Detected country"
local restriction = reason == "country"
	and (german and "GEOIP-LÄNDERSPERRE" or "GEOIP COUNTRY RULE")
	or (german and "NETZWERK-ADRESSE GESPERRT" or "NETWORK ADDRESS RULE")
local contact = german
	and "Wenn Sie glauben, dass dies ein Fehler ist, wenden Sie sich bitte an den Betreiber dieses Dienstes."
	or "If you believe this is an error, please contact the operator of this service."
local country_detail = country_code ~= "" and "<div class=\"detail country-detail\"><span>" .. country_label .. "</span><strong>" .. country .. "</strong></div>" or ""

ngx.status = ngx.HTTP_FORBIDDEN
ngx.header["Content-Type"] = "text/html; charset=utf-8"
ngx.header["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
ngx.header["Pragma"] = "no-cache"
ngx.header["Referrer-Policy"] = "no-referrer"
ngx.header["X-Content-Type-Options"] = "nosniff"
ngx.header["X-Frame-Options"] = "DENY"
ngx.header["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"

ngx.print([=[<!doctype html>
<html lang="]=], german and "de" or "en", [=[">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>]=], title, [=[</title>
<style>
:root{color-scheme:dark light;--background:#09090b;--surface:#18181b;--border:#3f3f46;--title:#fafafa;--text:#d4d4d8;--muted:#a1a1aa;--accent:#f97316}@media(prefers-color-scheme:light){:root{--background:#f8fafc;--surface:#fff;--border:#e4e4e7;--title:#18181b;--text:#3f3f46;--muted:#71717a}}*{box-sizing:border-box}body{min-height:100vh;margin:0;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at top,rgba(249,115,22,.16),transparent 36%),var(--background);color:var(--text);font:16px/1.55 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}main{position:relative;overflow:hidden;width:min(100%,580px);padding:36px;border:1px solid var(--border);border-radius:20px;background:color-mix(in srgb,var(--surface) 92%,transparent);box-shadow:0 24px 60px rgba(0,0,0,.22)}main:before{position:absolute;top:0;right:0;left:0;height:3px;content:" ";background:linear-gradient(90deg,#f97316,#fb7185)}.eyebrow{display:inline-flex;align-items:center;gap:9px;margin-bottom:17px;color:var(--muted);font-size:.72rem;font-weight:700;letter-spacing:.09em;text-transform:uppercase}.badge{display:inline-flex;align-items:center;gap:6px;padding:4px 8px;border:1px solid rgba(249,115,22,.38);border-radius:999px;background:rgba(249,115,22,.12);color:var(--accent)}.badge:before{width:6px;height:6px;border-radius:50%;background:currentColor;content:" ";box-shadow:0 0 0 3px rgba(249,115,22,.12)}.icon{width:48px;height:48px;display:grid;place-items:center;border-radius:14px;background:rgba(249,115,22,.16);color:var(--accent);font-size:25px;font-weight:700}h1{margin:22px 0 8px;color:var(--title);font-size:clamp(1.75rem,5vw,2.25rem);line-height:1.15}p{margin:0}.message{font-size:1.05rem}.contact{margin-top:22px;color:var(--muted);font-size:.94rem}.details{margin-top:28px;padding:16px;border:1px solid var(--border);border-radius:12px}.details h2{margin:0 0 10px;color:var(--muted);font-size:.8rem;letter-spacing:.08em;text-transform:uppercase}.detail{display:flex;justify-content:space-between;gap:20px;padding:7px 0}.detail+.detail{border-top:1px solid var(--border)}.detail span{color:var(--muted)}.detail strong{overflow-wrap:anywhere;color:var(--title);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.9rem}.country-detail strong{color:var(--accent)}
</style>
</head>
<body>
<main>
<div class="eyebrow"><span class="badge">]=], restriction, [=[</span><span>HTTP 403</span></div>
<div class="icon" aria-hidden="true">!</div>
<h1>]=], heading, [=[</h1>
<p class="message">]=], message, [=[</p>
<section class="details" aria-label="]=], detail_heading, [=[">
<h2>]=], detail_heading, [=[</h2>
<div class="detail"><span>]=], ip_label, [=[</span><strong>]=], client_ip, [=[</strong></div>]=], country_detail, [=[
</section>
<p class="contact">]=], contact, [=[</p>
</main>
</body>
</html>]=])
