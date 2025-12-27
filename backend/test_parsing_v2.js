
import dayjs from "dayjs";

const buffer = new Map();

function processLine(line) {
    try {
        if (!line.trim()) return;

        console.log(`\nOriginal: ${line.substring(line.length - 40)}`); // Show end of line

        // Fix common Nginx JSON log errors (e.g. unquoted country code)
        // "geoip_country_code":DE} -> "geoip_country_code":"DE"}
        const fixedLine = line.replace(/"geoip_country_code":([A-Z]{2})}/g, '"geoip_country_code":"$1"}');

        console.log(`Fixed   : ${fixedLine.substring(fixedLine.length - 40)}`);

        const data = JSON.parse(fixedLine);

        const status = parseInt(data.status, 10);
        const bytes = parseInt(data.body_bytes_sent, 10) || 0;
        const time = dayjs(data.time_iso8601 || new Date())
            .startOf("minute")
            .toISOString();

        const hostname = data.server_name || "unknown";
        const key = `${time}|${hostname}`;

        if (!buffer.has(key)) {
            buffer.set(key, {
                timestamp: time,
                hostname: hostname,
                count: 0,
                bytes: 0,
                status_2xx: 0,
                status_3xx: 0,
                status_4xx: 0,
                status_5xx: 0,
            });
        }

        const entry = buffer.get(key);
        entry.count++;
        entry.bytes += bytes;

        if (status >= 200 && status < 300) entry.status_2xx++;
        else if (status >= 300 && status < 400) entry.status_3xx++;
        else if (status >= 400 && status < 500) entry.status_4xx++;
        else if (status >= 500) entry.status_5xx++;

        console.log(`PARSED SUCCESS: Status=${status} (2xx=${entry.status_2xx})`);

    } catch (err) {
        console.error(`ERROR: Failed to parse log line: ${err.message}`);
    }
}

const logLines = [
    '{"msec": "1766794699.889", "connection": "378", "connection_requests": "66", "pid": "1821", "request_id": "bd90848016865f7fdcde1f7dadc1b510", "request_length": "21", "remote_addr": "93.192.75.254", "remote_user": "", "remote_port": "61801", "time_local": "27/Dec/2025:01:18:19 +0100", "time_iso8601": "2025-12-27T01:18:19+01:00", "request": "GET /LiveTv/Programs/Recommended?userId=af87ff285063439d818f10bd1d3f74c2&IsAiring=true&limit=1&ImageTypeLimit=1&EnableImageTypes=Primary%2CThumb%2CBackdrop&EnableTotalRecordCount=false&Fields=ChannelInfo%2CPrimaryImageAspectRatio HTTP/3.0", "request_uri": "/LiveTv/Programs/Recommended?userId=af87ff285063439d818f10bd1d3f74c2&IsAiring=true&limit=1&ImageTypeLimit=1&EnableImageTypes=Primary%2CThumb%2CBackdrop&EnableTotalRecordCount=false&Fields=ChannelInfo%2CPrimaryImageAspectRatio", "args": "userId=af87ff285063439d818f10bd1d3f74c2&IsAiring=true&limit=1&ImageTypeLimit=1&EnableImageTypes=Primary%2CThumb%2CBackdrop&EnableTotalRecordCount=false&Fields=ChannelInfo%2CPrimaryImageAspectRatio&api_key=902135cebc8e42358271ec2a183c783d", "status": "200", "body_bytes_sent": "69", "bytes_sent": "307", "http_referer": "", "http_user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36", "http_x_forwarded_for": "", "http_host": "", "server_name": "cdn.clawsucht.eu", "request_time": "0.003", "upstream": "10.0.17.7:8096", "upstream_connect_time": "0.002", "upstream_header_time": "0.003", "upstream_response_time": "0.003", "upstream_response_length": "59", "upstream_cache_status": "", "ssl_protocol": "TLSv1.3", "ssl_cipher": "TLS_AES_256_GCM_SHA384", "scheme": "https", "request_method": "GET", "server_protocol": "HTTP/3.0", "pipe": ".", "gzip_ratio": "0.73", "http_cf_ray": "","geoip_country_code":DE}',
    '{"msec": "1766794699.933", "connection": "380", "connection_requests": "67", "pid": "1821", "request_id": "a2497c701bb892800da0db7b4fe6293c", "request_length": "21", "remote_addr": "93.192.75.254", "remote_user": "", "remote_port": "61801", "time_local": "27/Dec/2025:01:18:19 +0100", "time_iso8601": "2025-12-27T01:18:19+01:00", "request": "GET /Users/af87ff285063439d818f10bd1d3f74c2/Items/Resume?Limit=12&Recursive=true&Fields=PrimaryImageAspectRatio&ImageTypeLimit=1&EnableImageTypes=Primary%2CBackdrop%2CThumb&EnableTotalRecordCount=false&MediaTypes=Video HTTP/3.0", "request_uri": "/Users/af87ff285063439d818f10bd1d3f74c2/Items/Resume?Limit=12&Recursive=true&Fields=PrimaryImageAspectRatio&ImageTypeLimit=1&EnableImageTypes=Primary%2CBackdrop%2CThumb&EnableTotalRecordCount=false&MediaTypes=Video", "args": "Limit=12&Recursive=true&Fields=PrimaryImageAspectRatio&ImageTypeLimit=1&EnableImageTypes=Primary%2CBackdrop%2CThumb&EnableTotalRecordCount=false&MediaTypes=Video&api_key=902135cebc8e42358271ec2a183c783d", "status": "200", "body_bytes_sent": "5471", "bytes_sent": "5709", "http_referer": "", "http_user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36", "http_x_forwarded_for": "", "http_host": "", "server_name": "cdn.clawsucht.eu", "request_time": "0.020", "upstream": "10.0.17.7:8096", "upstream_connect_time": "0.004", "upstream_header_time": "0.020", "upstream_response_time": "0.020", "upstream_response_length": "18738", "upstream_cache_status": "", "ssl_protocol": "TLSv1.3", "ssl_cipher": "TLS_AES_256_GCM_SHA384", "scheme": "https", "request_method": "GET", "server_protocol": "HTTP/3.0", "pipe": ".", "gzip_ratio": "3.42", "http_cf_ray": "","geoip_country_code":DE}'
];

logLines.forEach(processLine);

console.log("\nBuffer Stats:", buffer.size > 0 ? Array.from(buffer.values())[0] : "Empty");
