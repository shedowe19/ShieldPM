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
		country_message = "Достъпът от тази държава не е разрешен за тази услуга.", ip_message = "Този IP адрес няма право на достъп до тази услуга.",
		why_heading = "Защо виждам тази страница?", country_explanation = "Тази услуга използва географско ограничение на достъпа. Разпознатата държава в момента не е разрешена за тази услуга.", ip_explanation = "Тази услуга в момента не приема връзки от този мрежов адрес.",
		detail_heading = "Данни за връзката", ip_label = "Вашият IP адрес", country_label = "Разпозната държава", status_label = "Статус на отговора", status_value = "Достъпът е отказан", protection_label = "Защита", country_protection = "Ограничение по държава", ip_protection = "Правило за мрежов адрес",
		next_heading = "Какво можете да направите?", review_title = "Проверете връзката", review_text = "Този отговор се показва преди влизане и преди да бъде достигнато поисканото приложение.", contact_title = "Поискайте легитимен достъп", contact_text = "Ако смятате, че това е грешка, свържете се с оператора и посочете показаните IP адрес и държава.",
		country_rule = "GEOIP ПРАВИЛО ЗА ДЪРЖАВА", ip_rule = "ПРАВИЛО ЗА МРЕЖОВ АДРЕС", footer = "Заявката беше спряна на границата на услугата и не беше препратена към приложението.",
	},
	de = {
		title = "Zugriff nicht verfügbar", heading = "Zugriff gesperrt",
		country_message = "Zugriffe aus diesem Land sind für diesen Dienst nicht zugelassen.", ip_message = "Diese IP-Adresse ist für diesen Dienst nicht zugelassen.",
		why_heading = "Warum wird diese Seite angezeigt?", country_explanation = "Dieser Dienst nutzt eine geografische Zugangsbeschränkung. Das erkannte Land ist für diesen Dienst derzeit nicht freigegeben.", ip_explanation = "Dieser Dienst akzeptiert derzeit keine Verbindungen von dieser Netzwerkadresse.",
		detail_heading = "Verbindungsdetails", ip_label = "Ihre IP-Adresse", country_label = "Erkanntes Land", status_label = "Antwortstatus", status_value = "Zugriff abgelehnt", protection_label = "Schutz", country_protection = "Länderbeschränkung", ip_protection = "Netzwerkadressregel",
		next_heading = "Was können Sie jetzt tun?", review_title = "Verbindung einordnen", review_text = "Diese Antwort wird vor einer Anmeldung und bevor die angeforderte Anwendung erreicht wird angezeigt.", contact_title = "Legitimen Zugriff anfragen", contact_text = "Wenn Sie glauben, dass dies ein Fehler ist, kontaktieren Sie den Betreiber und nennen Sie die angezeigte IP-Adresse sowie das Land.",
		country_rule = "GEOIP-LÄNDERSPERRE", ip_rule = "NETZWERK-ADRESSE GESPERRT", footer = "Die Anfrage wurde am Dienstzugang gestoppt und nicht an die Anwendung weitergeleitet.",
	},
	en = {
		title = "Access unavailable", heading = "Access blocked",
		country_message = "Access from this country is not permitted for this service.", ip_message = "This IP address is not permitted to access this service.",
		why_heading = "Why am I seeing this?", country_explanation = "This service uses a geographic access restriction. The detected country is not currently approved for this service.", ip_explanation = "This service does not currently accept connections from this network address.",
		detail_heading = "Connection details", ip_label = "Your IP address", country_label = "Detected country", status_label = "Response status", status_value = "Access denied", protection_label = "Protection", country_protection = "Country restriction", ip_protection = "Network address rule",
		next_heading = "What can I do next?", review_title = "Review the connection", review_text = "This response is shown before sign-in and before the requested application is reached.", contact_title = "Request legitimate access", contact_text = "If you believe this is incorrect, contact the operator and include the displayed IP address and country.",
		country_rule = "GEOIP COUNTRY RULE", ip_rule = "NETWORK ADDRESS RULE", footer = "The request was stopped at the service edge and was not forwarded to the application.",
	},
	es = {
		title = "Acceso no disponible", heading = "Acceso bloqueado",
		country_message = "El acceso desde este país no está permitido para este servicio.", ip_message = "Esta dirección IP no tiene permiso para acceder a este servicio.",
		why_heading = "¿Por qué veo esta página?", country_explanation = "Este servicio utiliza una restricción geográfica de acceso. El país detectado no está autorizado actualmente para este servicio.", ip_explanation = "Este servicio no acepta actualmente conexiones desde esta dirección de red.",
		detail_heading = "Detalles de conexión", ip_label = "Su dirección IP", country_label = "País detectado", status_label = "Estado de respuesta", status_value = "Acceso denegado", protection_label = "Protección", country_protection = "Restricción por país", ip_protection = "Regla de dirección de red",
		next_heading = "¿Qué puede hacer ahora?", review_title = "Revise la conexión", review_text = "Esta respuesta se muestra antes de iniciar sesión y antes de que se alcance la aplicación solicitada.", contact_title = "Solicite acceso legítimo", contact_text = "Si cree que se trata de un error, contacte con el operador e incluya la dirección IP y el país mostrados.",
		country_rule = "REGLA DE PAÍS GEOIP", ip_rule = "REGLA DE DIRECCIÓN DE RED", footer = "La solicitud se detuvo en el borde del servicio y no se reenvió a la aplicación.",
	},
	it = {
		title = "Accesso non disponibile", heading = "Accesso bloccato",
		country_message = "L'accesso da questo Paese non è consentito per questo servizio.", ip_message = "Questo indirizzo IP non è autorizzato ad accedere a questo servizio.",
		why_heading = "Perché visualizzo questa pagina?", country_explanation = "Questo servizio utilizza una restrizione geografica dell'accesso. Il Paese rilevato non è attualmente autorizzato per questo servizio.", ip_explanation = "Questo servizio al momento non accetta connessioni da questo indirizzo di rete.",
		detail_heading = "Dettagli della connessione", ip_label = "Il tuo indirizzo IP", country_label = "Paese rilevato", status_label = "Stato della risposta", status_value = "Accesso negato", protection_label = "Protezione", country_protection = "Restrizione per Paese", ip_protection = "Regola indirizzo di rete",
		next_heading = "Cosa puoi fare ora?", review_title = "Verifica la connessione", review_text = "Questa risposta viene mostrata prima dell'accesso e prima di raggiungere l'applicazione richiesta.", contact_title = "Richiedi un accesso legittimo", contact_text = "Se ritieni che si tratti di un errore, contatta il gestore e indica l'indirizzo IP e il Paese visualizzati.",
		country_rule = "REGOLA PAESE GEOIP", ip_rule = "REGOLA INDIRIZZO DI RETE", footer = "La richiesta è stata bloccata al confine del servizio e non è stata inoltrata all'applicazione.",
	},
	ja = {
		title = "アクセスできません", heading = "アクセスがブロックされました",
		country_message = "この国からのアクセスは、このサービスでは許可されていません。", ip_message = "このIPアドレスからのこのサービスへのアクセスは許可されていません。",
		why_heading = "このページが表示される理由", country_explanation = "このサービスでは地理的なアクセス制限を使用しています。検出された国は現在、このサービスで許可されていません。", ip_explanation = "このサービスは現在、このネットワークアドレスからの接続を受け付けていません。",
		detail_heading = "接続の詳細", ip_label = "あなたのIPアドレス", country_label = "検出された国", status_label = "応答ステータス", status_value = "アクセス拒否", protection_label = "保護", country_protection = "国別の制限", ip_protection = "ネットワークアドレスルール",
		next_heading = "次にできること", review_title = "接続を確認する", review_text = "この応答は、サインイン前かつ要求されたアプリケーションに到達する前に表示されます。", contact_title = "正当なアクセスを依頼する", contact_text = "誤りと思われる場合は、表示されたIPアドレスと国を添えてサービスの運営者にお問い合わせください。",
		country_rule = "GeoIP 国ルール", ip_rule = "ネットワークアドレスルール", footer = "リクエストはサービスの境界で停止され、アプリケーションには転送されませんでした。",
	},
	ko = {
		title = "접속할 수 없습니다", heading = "접속이 차단되었습니다",
		country_message = "이 국가에서의 접속은 이 서비스에 허용되지 않습니다.", ip_message = "이 IP 주소는 이 서비스에 접속할 수 없습니다.",
		why_heading = "이 페이지가 표시되는 이유", country_explanation = "이 서비스는 지리적 접속 제한을 사용합니다. 감지된 국가는 현재 이 서비스에 허용되지 않습니다.", ip_explanation = "이 서비스는 현재 이 네트워크 주소에서의 연결을 허용하지 않습니다.",
		detail_heading = "연결 정보", ip_label = "귀하의 IP 주소", country_label = "감지된 국가", status_label = "응답 상태", status_value = "접속 거부", protection_label = "보호", country_protection = "국가 제한", ip_protection = "네트워크 주소 규칙",
		next_heading = "다음에 할 수 있는 일", review_title = "연결 확인", review_text = "이 응답은 로그인 전과 요청한 애플리케이션에 도달하기 전에 표시됩니다.", contact_title = "정당한 접속 요청", contact_text = "오류라고 생각되면 표시된 IP 주소와 국가를 포함하여 서비스 운영자에게 문의하십시오.",
		country_rule = "GeoIP 국가 규칙", ip_rule = "네트워크 주소 규칙", footer = "요청은 서비스 경계에서 중단되었으며 애플리케이션으로 전달되지 않았습니다.",
	},
	nl = {
		title = "Toegang niet beschikbaar", heading = "Toegang geblokkeerd",
		country_message = "Toegang vanuit dit land is niet toegestaan voor deze dienst.", ip_message = "Dit IP-adres heeft geen toegang tot deze dienst.",
		why_heading = "Waarom zie ik deze pagina?", country_explanation = "Deze dienst gebruikt een geografische toegangsbeperking. Het gedetecteerde land is momenteel niet toegestaan voor deze dienst.", ip_explanation = "Deze dienst accepteert momenteel geen verbindingen vanaf dit netwerkadres.",
		detail_heading = "Verbindingsgegevens", ip_label = "Uw IP-adres", country_label = "Gedetecteerd land", status_label = "Reactiestatus", status_value = "Toegang geweigerd", protection_label = "Bescherming", country_protection = "Landbeperking", ip_protection = "Netwerkadresregel",
		next_heading = "Wat kunt u nu doen?", review_title = "Controleer de verbinding", review_text = "Deze reactie wordt getoond vóór het aanmelden en voordat de gevraagde toepassing wordt bereikt.", contact_title = "Vraag legitieme toegang aan", contact_text = "Als u denkt dat dit onjuist is, neem dan contact op met de beheerder en vermeld het getoonde IP-adres en land.",
		country_rule = "GEOIP-LANDREGEL", ip_rule = "NETWERKADRESREGEL", footer = "Het verzoek is aan de rand van de dienst gestopt en niet doorgestuurd naar de toepassing.",
	},
	pl = {
		title = "Dostęp niedostępny", heading = "Dostęp zablokowany",
		country_message = "Dostęp z tego kraju nie jest dozwolony dla tej usługi.", ip_message = "Ten adres IP nie ma uprawnień dostępu do tej usługi.",
		why_heading = "Dlaczego widzę tę stronę?", country_explanation = "Ta usługa korzysta z geograficznego ograniczenia dostępu. Wykryty kraj nie jest obecnie dozwolony dla tej usługi.", ip_explanation = "Ta usługa obecnie nie akceptuje połączeń z tego adresu sieciowego.",
		detail_heading = "Szczegóły połączenia", ip_label = "Twój adres IP", country_label = "Wykryty kraj", status_label = "Stan odpowiedzi", status_value = "Odmowa dostępu", protection_label = "Ochrona", country_protection = "Ograniczenie kraju", ip_protection = "Reguła adresu sieciowego",
		next_heading = "Co możesz zrobić teraz?", review_title = "Sprawdź połączenie", review_text = "Ta odpowiedź jest wyświetlana przed logowaniem i przed dotarciem do żądanej aplikacji.", contact_title = "Poproś o uprawniony dostęp", contact_text = "Jeśli uważasz, że to błąd, skontaktuj się z operatorem i podaj wyświetlony adres IP oraz kraj.",
		country_rule = "REGUŁA KRAJU GEOIP", ip_rule = "REGUŁA ADRESU SIECIOWEGO", footer = "Żądanie zostało zatrzymane na granicy usługi i nie zostało przekazane do aplikacji.",
	},
	ru = {
		title = "Доступ недоступен", heading = "Доступ заблокирован",
		country_message = "Доступ из этой страны не разрешён для данного сервиса.", ip_message = "Этому IP-адресу не разрешён доступ к данному сервису.",
		why_heading = "Почему отображается эта страница?", country_explanation = "Этот сервис использует географическое ограничение доступа. Определённая страна в настоящее время не разрешена для данного сервиса.", ip_explanation = "Этот сервис в настоящее время не принимает подключения с этого сетевого адреса.",
		detail_heading = "Сведения о подключении", ip_label = "Ваш IP-адрес", country_label = "Определённая страна", status_label = "Статус ответа", status_value = "Доступ запрещён", protection_label = "Защита", country_protection = "Ограничение по стране", ip_protection = "Правило сетевого адреса",
		next_heading = "Что можно сделать дальше?", review_title = "Проверьте подключение", review_text = "Этот ответ отображается до входа в систему и до достижения запрошенного приложения.", contact_title = "Запросите законный доступ", contact_text = "Если вы считаете, что это ошибка, обратитесь к оператору и укажите показанные IP-адрес и страну.",
		country_rule = "ПРАВИЛО СТРАНЫ GEOIP", ip_rule = "ПРАВИЛО СЕТЕВОГО АДРЕСА", footer = "Запрос был остановлен на границе сервиса и не был передан приложению.",
	},
	sk = {
		title = "Prístup nie je k dispozícii", heading = "Prístup zablokovaný",
		country_message = "Prístup z tejto krajiny nie je pre túto službu povolený.", ip_message = "Táto IP adresa nemá povolený prístup k tejto službe.",
		why_heading = "Prečo sa zobrazuje táto stránka?", country_explanation = "Táto služba používa geografické obmedzenie prístupu. Zistená krajina momentálne nie je pre túto službu povolená.", ip_explanation = "Táto služba momentálne neprijíma pripojenia z tejto sieťovej adresy.",
		detail_heading = "Podrobnosti pripojenia", ip_label = "Vaša IP adresa", country_label = "Zistená krajina", status_label = "Stav odpovede", status_value = "Prístup zamietnutý", protection_label = "Ochrana", country_protection = "Obmedzenie krajiny", ip_protection = "Pravidlo sieťovej adresy",
		next_heading = "Čo môžete urobiť teraz?", review_title = "Skontrolujte pripojenie", review_text = "Táto odpoveď sa zobrazí pred prihlásením a pred dosiahnutím požadovanej aplikácie.", contact_title = "Požiadajte o oprávnený prístup", contact_text = "Ak si myslíte, že ide o chybu, kontaktujte prevádzkovateľa a uveďte zobrazenú IP adresu a krajinu.",
		country_rule = "PRAVIDLO KRAJINY GEOIP", ip_rule = "PRAVIDLO SIEŤOVEJ ADRESY", footer = "Požiadavka bola zastavená na hranici služby a nebola odoslaná do aplikácie.",
	},
	vi = {
		title = "Không thể truy cập", heading = "Truy cập bị chặn",
		country_message = "Không cho phép truy cập từ quốc gia này vào dịch vụ này.", ip_message = "Địa chỉ IP này không được phép truy cập dịch vụ này.",
		why_heading = "Tại sao tôi thấy trang này?", country_explanation = "Dịch vụ này sử dụng giới hạn truy cập theo khu vực địa lý. Quốc gia được phát hiện hiện không được phép sử dụng dịch vụ này.", ip_explanation = "Dịch vụ này hiện không chấp nhận kết nối từ địa chỉ mạng này.",
		detail_heading = "Chi tiết kết nối", ip_label = "Địa chỉ IP của bạn", country_label = "Quốc gia được phát hiện", status_label = "Trạng thái phản hồi", status_value = "Truy cập bị từ chối", protection_label = "Bảo vệ", country_protection = "Hạn chế theo quốc gia", ip_protection = "Quy tắc địa chỉ mạng",
		next_heading = "Bạn có thể làm gì tiếp theo?", review_title = "Kiểm tra kết nối", review_text = "Phản hồi này được hiển thị trước khi đăng nhập và trước khi ứng dụng được yêu cầu được truy cập.", contact_title = "Yêu cầu quyền truy cập hợp lệ", contact_text = "Nếu bạn cho rằng đây là lỗi, vui lòng liên hệ với nhà vận hành và cung cấp địa chỉ IP cùng quốc gia được hiển thị.",
		country_rule = "QUY TẮC QUỐC GIA GEOIP", ip_rule = "QUY TẮC ĐỊA CHỈ MẠNG", footer = "Yêu cầu đã bị dừng tại biên của dịch vụ và không được chuyển tiếp đến ứng dụng.",
	},
	zh = {
		title = "无法访问", heading = "访问已被阻止",
		country_message = "不允许从该国家或地区访问此服务。", ip_message = "不允许此 IP 地址访问此服务。",
		why_heading = "为什么会显示此页面？", country_explanation = "此服务使用地理位置访问限制。当前不允许检测到的国家或地区访问此服务。", ip_explanation = "此服务当前不接受来自此网络地址的连接。",
		detail_heading = "连接详情", ip_label = "您的 IP 地址", country_label = "检测到的国家或地区", status_label = "响应状态", status_value = "访问被拒绝", protection_label = "保护", country_protection = "国家或地区限制", ip_protection = "网络地址规则",
		next_heading = "接下来可以做什么？", review_title = "检查连接", review_text = "此响应会在登录之前以及到达请求的应用程序之前显示。", contact_title = "请求合法访问权限", contact_text = "如果您认为这是错误，请联系运营者，并提供显示的 IP 地址和国家或地区。",
		country_rule = "GeoIP 国家或地区规则", ip_rule = "网络地址规则", footer = "请求已在服务边缘停止，未转发到应用程序。",
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
local country_reason = reason == "country"
local restriction = country_reason and copy.country_rule or copy.ip_rule
local message = country_reason and copy.country_message or copy.ip_message
local explanation = country_reason and copy.country_explanation or copy.ip_explanation
local protection = country_reason and copy.country_protection or copy.ip_protection

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
:root{color-scheme:dark light;--background:#08090d;--surface:#15171d;--surface-strong:#20232c;--border:#343944;--title:#f7f8fb;--text:#d7dbe4;--muted:#9aa2b1;--accent:#ff8b33;--accent-soft:rgba(255,139,51,.14);--danger:#fb7185;--shadow:rgba(0,0,0,.32)}@media(prefers-color-scheme:light){:root{--background:#f4f6fa;--surface:#fff;--surface-strong:#f8fafc;--border:#d9dee8;--title:#172033;--text:#3d485d;--muted:#6d7788;--accent:#d85f0a;--accent-soft:rgba(216,95,10,.1);--danger:#e11d48;--shadow:rgba(30,41,59,.12)}}*{box-sizing:border-box}body{min-height:100vh;margin:0;padding:34px 20px;display:grid;place-items:center;background:radial-gradient(circle at 15% 0,rgba(255,139,51,.2),transparent 30%),radial-gradient(circle at 90% 100%,rgba(251,113,133,.14),transparent 28%),var(--background);color:var(--text);font:16px/1.55 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.page{width:min(100%,760px);position:relative;padding:1px;border-radius:25px;background:linear-gradient(135deg,rgba(255,139,51,.72),rgba(251,113,133,.45),rgba(255,255,255,.08));box-shadow:0 30px 80px var(--shadow)}main{overflow:hidden;border-radius:24px;background:color-mix(in srgb,var(--surface) 95%,transparent)}.hero{padding:30px 34px 26px;background:linear-gradient(130deg,var(--accent-soft),transparent 62%);border-bottom:1px solid var(--border)}.eyebrow{display:flex;align-items:center;justify-content:space-between;gap:14px;color:var(--muted);font-size:.75rem;font-weight:760;letter-spacing:.09em;text-transform:uppercase}.badge{display:inline-flex;align-items:center;gap:8px;padding:5px 10px;border:1px solid rgba(255,139,51,.42);border-radius:999px;background:var(--accent-soft);color:var(--accent)}.badge:before{width:7px;height:7px;border-radius:50%;background:currentColor;box-shadow:0 0 0 4px rgba(255,139,51,.12);content:" "}.hero-main{display:flex;align-items:flex-start;gap:19px;margin-top:24px}.icon{flex:none;width:58px;height:58px;display:grid;place-items:center;border:1px solid rgba(255,139,51,.3);border-radius:18px;background:linear-gradient(145deg,rgba(255,139,51,.24),rgba(251,113,133,.12));color:var(--accent)}.icon svg{width:31px;height:31px;fill:none;stroke:currentColor;stroke-linecap:round;stroke-linejoin:round;stroke-width:1.75}h1,h2,h3,p{margin:0}h1{color:var(--title);font-size:clamp(1.9rem,5vw,2.55rem);letter-spacing:-.035em;line-height:1.12}.message{max-width:550px;margin-top:8px;font-size:1.05rem}.content{padding:27px 34px 34px}.reason{display:grid;grid-template-columns:32px 1fr;gap:14px;padding:18px;border:1px solid var(--border);border-radius:16px;background:var(--surface-strong)}.reason-icon{display:grid;place-items:center;width:30px;height:30px;margin-top:2px;border-radius:10px;background:var(--accent-soft);color:var(--accent);font-weight:800}h2{color:var(--title);font-size:1rem;line-height:1.3}.reason p{margin-top:5px;color:var(--muted);font-size:.94rem}.stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:21px}.stat{padding:15px 16px;border:1px solid var(--border);border-radius:14px;background:var(--surface)}.stat span,.details h2,.steps h2{display:block;color:var(--muted);font-size:.73rem;font-weight:750;letter-spacing:.08em;text-transform:uppercase}.stat strong{display:block;margin-top:5px;color:var(--title);font-size:.98rem}.status-value{color:var(--danger)!important}.details{margin-top:21px;padding:18px;border:1px solid var(--border);border-radius:16px}.details h2,.steps h2{margin-bottom:8px}.detail{display:flex;justify-content:space-between;gap:20px;padding:11px 0}.detail+.detail{border-top:1px solid var(--border)}.detail span{color:var(--muted)}.detail strong{max-width:62%;overflow-wrap:anywhere;color:var(--title);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.9rem;text-align:right}.country-detail strong{color:var(--accent)}.steps{margin-top:21px;padding:18px;border:1px solid var(--border);border-radius:16px;background:linear-gradient(135deg,color-mix(in srgb,var(--accent-soft) 55%,transparent),transparent 70%)}.step-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-top:14px}.step{display:grid;grid-template-columns:28px 1fr;gap:10px}.step-number{display:grid;place-items:center;width:25px;height:25px;border:1px solid var(--border);border-radius:50%;color:var(--accent);font-size:.78rem;font-weight:800}.step h3{color:var(--title);font-size:.93rem}.step p{margin-top:3px;color:var(--muted);font-size:.86rem}.footer{display:flex;gap:9px;align-items:flex-start;margin-top:21px;color:var(--muted);font-size:.83rem}.footer svg{flex:none;width:17px;height:17px;margin-top:2px;fill:none;stroke:var(--accent);stroke-linecap:round;stroke-linejoin:round;stroke-width:2}@media(max-width:560px){body{padding:16px}.hero,.content{padding-right:21px;padding-left:21px}.hero-main{gap:14px}.icon{width:49px;height:49px}.stats,.step-grid{grid-template-columns:1fr}.detail{gap:12px}.detail strong{max-width:57%}.eyebrow{align-items:flex-start;flex-direction:column;gap:8px}}
</style>
</head>
<body>
<div class="page"><main>
<header class="hero">
<div class="eyebrow"><span class="badge">]=], restriction, [=[</span><span>HTTP 403</span></div>
<div class="hero-main"><div class="icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3 19 6v5c0 4.7-3.1 8.7-7 10-3.9-1.3-7-5.3-7-10V6l7-3Z"/><path d="M9.5 12.1 11.2 14l3.5-4"/></svg></div><div><h1>]=], copy.heading, [=[</h1><p class="message">]=], message, [=[</p></div></div>
</header>
<div class="content">
<section class="reason" aria-labelledby="why"><div class="reason-icon" aria-hidden="true">i</div><div><h2 id="why">]=], copy.why_heading, [=[</h2><p>]=], explanation, [=[</p></div></section>
<section class="stats" aria-label="]=], copy.detail_heading, [=["><div class="stat"><span>]=], copy.status_label, [=[</span><strong class="status-value">]=], copy.status_value, [=[</strong></div><div class="stat"><span>]=], copy.protection_label, [=[</span><strong>]=], protection, [=[</strong></div></section>
<section class="details" aria-label="]=], copy.detail_heading, [=["><h2>]=], copy.detail_heading, [=[</h2><div class="detail"><span>]=], copy.ip_label, [=[</span><strong>]=], client_ip, [=[</strong></div>]=], country_detail, [=[</section>
<section class="steps" aria-labelledby="next"><h2 id="next">]=], copy.next_heading, [=[</h2><div class="step-grid"><div class="step"><span class="step-number">1</span><div><h3>]=], copy.review_title, [=[</h3><p>]=], copy.review_text, [=[</p></div></div><div class="step"><span class="step-number">2</span><div><h3>]=], copy.contact_title, [=[</h3><p>]=], copy.contact_text, [=[</p></div></div></div></section>
<footer class="footer"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 19 6v5c0 4.7-3.1 8.7-7 10-3.9-1.3-7-5.3-7-10V6l7-3Z"/><path d="M9 12h6"/></svg><span>]=], copy.footer, [=[</span></footer>
</div>
</main></div>
</body>
</html>]=])
