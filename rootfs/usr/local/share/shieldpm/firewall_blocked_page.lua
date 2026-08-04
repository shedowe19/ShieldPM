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

-- Keep this table aligned with frontend/src/locale/IntlProvider.tsx.
-- The browser's Accept-Language header decides the public error-page language;
-- unsupported or malformed locale preferences intentionally fall back to English.
local translations = {
	bg = {
		title = "Достъпът не е наличен", heading = "Достъпът е блокиран",
		country_message = "Достъпът от тази държава не е разрешен за тази услуга.",
		ip_message = "Този IP адрес няма право на достъп до тази услуга.",
		detail_heading = "Данни за връзката", ip_label = "Вашият IP адрес", country_label = "Разпозната държава",
		country_rule = "GEOIP ПРАВИЛО ЗА ДЪРЖАВА", ip_rule = "ПРАВИЛО ЗА МРЕЖОВ АДРЕС",
		contact = "Ако смятате, че това е грешка, моля, свържете се с оператора на тази услуга.",
	},
	de = {
		title = "Zugriff nicht verfügbar", heading = "Zugriff gesperrt",
		country_message = "Zugriffe aus diesem Land sind für diesen Dienst nicht zugelassen.",
		ip_message = "Diese IP-Adresse ist für diesen Dienst nicht zugelassen.",
		detail_heading = "Verbindungsdetails", ip_label = "Ihre IP-Adresse", country_label = "Erkanntes Land",
		country_rule = "GEOIP-LÄNDERSPERRE", ip_rule = "NETZWERK-ADRESSE GESPERRT",
		contact = "Wenn Sie glauben, dass dies ein Fehler ist, wenden Sie sich bitte an den Betreiber dieses Dienstes.",
	},
	en = {
		title = "Access unavailable", heading = "Access blocked",
		country_message = "Access from this country is not permitted for this service.",
		ip_message = "This IP address is not permitted to access this service.",
		detail_heading = "Connection details", ip_label = "Your IP address", country_label = "Detected country",
		country_rule = "GEOIP COUNTRY RULE", ip_rule = "NETWORK ADDRESS RULE",
		contact = "If you believe this is an error, please contact the operator of this service.",
	},
	es = {
		title = "Acceso no disponible", heading = "Acceso bloqueado",
		country_message = "El acceso desde este país no está permitido para este servicio.",
		ip_message = "Esta dirección IP no tiene permiso para acceder a este servicio.",
		detail_heading = "Detalles de conexión", ip_label = "Su dirección IP", country_label = "País detectado",
		country_rule = "REGLA DE PAÍS GEOIP", ip_rule = "REGLA DE DIRECCIÓN DE RED",
		contact = "Si cree que se trata de un error, póngase en contacto con el operador de este servicio.",
	},
	it = {
		title = "Accesso non disponibile", heading = "Accesso bloccato",
		country_message = "L'accesso da questo Paese non è consentito per questo servizio.",
		ip_message = "Questo indirizzo IP non è autorizzato ad accedere a questo servizio.",
		detail_heading = "Dettagli della connessione", ip_label = "Il tuo indirizzo IP", country_label = "Paese rilevato",
		country_rule = "REGOLA PAESE GEOIP", ip_rule = "REGOLA INDIRIZZO DI RETE",
		contact = "Se ritieni che si tratti di un errore, contatta il gestore di questo servizio.",
	},
	ja = {
		title = "アクセスできません", heading = "アクセスがブロックされました",
		country_message = "この国からのアクセスは、このサービスでは許可されていません。",
		ip_message = "このIPアドレスからのこのサービスへのアクセスは許可されていません。",
		detail_heading = "接続の詳細", ip_label = "あなたのIPアドレス", country_label = "検出された国",
		country_rule = "GeoIP 国ルール", ip_rule = "ネットワークアドレスルール",
		contact = "これが誤りと思われる場合は、このサービスの運営者にお問い合わせください。",
	},
	ko = {
		title = "접속할 수 없습니다", heading = "접속이 차단되었습니다",
		country_message = "이 국가에서의 접속은 이 서비스에 허용되지 않습니다.",
		ip_message = "이 IP 주소는 이 서비스에 접속할 수 없습니다.",
		detail_heading = "연결 정보", ip_label = "귀하의 IP 주소", country_label = "감지된 국가",
		country_rule = "GeoIP 국가 규칙", ip_rule = "네트워크 주소 규칙",
		contact = "오류라고 생각되면 이 서비스의 운영자에게 문의하십시오.",
	},
	nl = {
		title = "Toegang niet beschikbaar", heading = "Toegang geblokkeerd",
		country_message = "Toegang vanuit dit land is niet toegestaan voor deze dienst.",
		ip_message = "Dit IP-adres heeft geen toegang tot deze dienst.",
		detail_heading = "Verbindingsgegevens", ip_label = "Uw IP-adres", country_label = "Gedetecteerd land",
		country_rule = "GEOIP-LANDREGEL", ip_rule = "NETWERKADRESREGEL",
		contact = "Neem contact op met de beheerder van deze dienst als u denkt dat dit een fout is.",
	},
	pl = {
		title = "Dostęp niedostępny", heading = "Dostęp zablokowany",
		country_message = "Dostęp z tego kraju nie jest dozwolony dla tej usługi.",
		ip_message = "Ten adres IP nie ma uprawnień dostępu do tej usługi.",
		detail_heading = "Szczegóły połączenia", ip_label = "Twój adres IP", country_label = "Wykryty kraj",
		country_rule = "REGUŁA KRAJU GEOIP", ip_rule = "REGUŁA ADRESU SIECIOWEGO",
		contact = "Jeśli uważasz, że to błąd, skontaktuj się z operatorem tej usługi.",
	},
	ru = {
		title = "Доступ недоступен", heading = "Доступ заблокирован",
		country_message = "Доступ из этой страны не разрешён для данного сервиса.",
		ip_message = "Этому IP-адресу не разрешён доступ к данному сервису.",
		detail_heading = "Сведения о подключении", ip_label = "Ваш IP-адрес", country_label = "Определённая страна",
		country_rule = "ПРАВИЛО СТРАНЫ GEOIP", ip_rule = "ПРАВИЛО СЕТЕВОГО АДРЕСА",
		contact = "Если вы считаете, что это ошибка, обратитесь к оператору данного сервиса.",
	},
	sk = {
		title = "Prístup nie je k dispozícii", heading = "Prístup zablokovaný",
		country_message = "Prístup z tejto krajiny nie je pre túto službu povolený.",
		ip_message = "Táto IP adresa nemá povolený prístup k tejto službe.",
		detail_heading = "Podrobnosti pripojenia", ip_label = "Vaša IP adresa", country_label = "Zistená krajina",
		country_rule = "PRAVIDLO KRAJINY GEOIP", ip_rule = "PRAVIDLO SIEŤOVEJ ADRESY",
		contact = "Ak sa domnievate, že ide o chybu, kontaktujte prevádzkovateľa tejto služby.",
	},
	vi = {
		title = "Không thể truy cập", heading = "Truy cập bị chặn",
		country_message = "Không cho phép truy cập từ quốc gia này vào dịch vụ này.",
		ip_message = "Địa chỉ IP này không được phép truy cập dịch vụ này.",
		detail_heading = "Chi tiết kết nối", ip_label = "Địa chỉ IP của bạn", country_label = "Quốc gia được phát hiện",
		country_rule = "QUY TẮC QUỐC GIA GEOIP", ip_rule = "QUY TẮC ĐỊA CHỈ MẠNG",
		contact = "Nếu bạn cho rằng đây là lỗi, vui lòng liên hệ với nhà vận hành dịch vụ này.",
	},
	zh = {
		title = "无法访问", heading = "访问已被阻止",
		country_message = "不允许从该国家或地区访问此服务。",
		ip_message = "不允许此 IP 地址访问此服务。",
		detail_heading = "连接详情", ip_label = "您的 IP 地址", country_label = "检测到的国家或地区",
		country_rule = "GeoIP 国家或地区规则", ip_rule = "网络地址规则",
		contact = "如果您认为这是错误，请联系此服务的运营者。",
	},
}

local function resolve_language(header)
	local language = "en"
	local highest_quality = -1
	for item in string.gmatch(header or "", "([^,]+)") do
		local code = string.lower(item:match("^%s*([a-zA-Z][a-zA-Z])") or "")
		local quality = tonumber(item:match(";%s*[qQ]=([0-9.]+)")) or 1
		if translations[code] and quality > 0 and quality > highest_quality then
			language = code
			highest_quality = quality
		end
	end
	return language
end

local language = resolve_language(ngx.var.http_accept_language)
local copy = translations[language]
local policy_id = ngx.var.shieldpm_firewall_policy_id or "0"
local reason = ngx.var["shieldpm_firewall_" .. policy_id .. "_block_reason"] or "ip"
local client_ip = escape_html(ngx.var.remote_addr or "")
local country_code = escape_html(ngx.var.shieldpm_geoip_country_code or "")
local country_name = ngx.var["shieldpm_geoip_country_name_" .. language] or ""
if country_name == "" and language ~= "en" then country_name = ngx.var.shieldpm_geoip_country_name_en or "" end
country_name = escape_html(country_name)
local country = country_name ~= "" and country_name .. " (" .. country_code .. ")" or country_code
local country_detail = country_code ~= "" and "<div class=\"detail country-detail\"><span>" .. copy.country_label .. "</span><strong>" .. country .. "</strong></div>" or ""
local restriction = reason == "country" and copy.country_rule or copy.ip_rule
local message = reason == "country" and copy.country_message or copy.ip_message

ngx.status = ngx.HTTP_FORBIDDEN
ngx.header["Content-Type"] = "text/html; charset=utf-8"
ngx.header["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
ngx.header["Pragma"] = "no-cache"
ngx.header["Referrer-Policy"] = "no-referrer"
ngx.header["X-Content-Type-Options"] = "nosniff"
ngx.header["X-Frame-Options"] = "DENY"
ngx.header["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"

ngx.print([=[<!doctype html>
<html lang="]=], language, [=[">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>]=], copy.title, [=[</title>
<style>
:root{color-scheme:dark light;--background:#09090b;--surface:#18181b;--border:#3f3f46;--title:#fafafa;--text:#d4d4d8;--muted:#a1a1aa;--accent:#f97316}@media(prefers-color-scheme:light){:root{--background:#f8fafc;--surface:#fff;--border:#e4e4e7;--title:#18181b;--text:#3f3f46;--muted:#71717a}}*{box-sizing:border-box}body{min-height:100vh;margin:0;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at top,rgba(249,115,22,.16),transparent 36%),var(--background);color:var(--text);font:16px/1.55 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}main{position:relative;overflow:hidden;width:min(100%,580px);padding:36px;border:1px solid var(--border);border-radius:20px;background:color-mix(in srgb,var(--surface) 92%,transparent);box-shadow:0 24px 60px rgba(0,0,0,.22)}main:before{position:absolute;top:0;right:0;left:0;height:3px;content:" ";background:linear-gradient(90deg,#f97316,#fb7185)}.eyebrow{display:inline-flex;align-items:center;gap:9px;margin-bottom:17px;color:var(--muted);font-size:.72rem;font-weight:700;letter-spacing:.09em;text-transform:uppercase}.badge{display:inline-flex;align-items:center;gap:6px;padding:4px 8px;border:1px solid rgba(249,115,22,.38);border-radius:999px;background:rgba(249,115,22,.12);color:var(--accent)}.badge:before{width:6px;height:6px;border-radius:50%;background:currentColor;content:" ";box-shadow:0 0 0 3px rgba(249,115,22,.12)}.icon{width:48px;height:48px;display:grid;place-items:center;border-radius:14px;background:rgba(249,115,22,.16);color:var(--accent);font-size:25px;font-weight:700}h1{margin:22px 0 8px;color:var(--title);font-size:clamp(1.75rem,5vw,2.25rem);line-height:1.15}p{margin:0}.message{font-size:1.05rem}.contact{margin-top:22px;color:var(--muted);font-size:.94rem}.details{margin-top:28px;padding:16px;border:1px solid var(--border);border-radius:12px}.details h2{margin:0 0 10px;color:var(--muted);font-size:.8rem;letter-spacing:.08em;text-transform:uppercase}.detail{display:flex;justify-content:space-between;gap:20px;padding:7px 0}.detail+.detail{border-top:1px solid var(--border)}.detail span{color:var(--muted)}.detail strong{overflow-wrap:anywhere;color:var(--title);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.9rem}.country-detail strong{color:var(--accent)}
</style>
</head>
<body>
<main>
<div class="eyebrow"><span class="badge">]=], restriction, [=[</span><span>HTTP 403</span></div>
<div class="icon" aria-hidden="true">!</div>
<h1>]=], copy.heading, [=[</h1>
<p class="message">]=], message, [=[</p>
<section class="details" aria-label="]=], copy.detail_heading, [=[">
<h2>]=], copy.detail_heading, [=[</h2>
<div class="detail"><span>]=], copy.ip_label, [=[</span><strong>]=], client_ip, [=[</strong></div>]=], country_detail, [=[
</section>
<p class="contact">]=], copy.contact, [=[</p>
</main>
</body>
</html>]=])
