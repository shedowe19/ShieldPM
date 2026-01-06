# API Documentation

ShieldPM provides a RESTful API that allows you to automate almost every aspect of the application.

## 🔐 Authentication

All API requests (except getting a token) require a valid **JSON Web Token (JWT)** in the Authorization header.

### Get a Token
**POST** `/api/tokens`

**Body:**
```json
{
  "identity": "admin@example.org",
  "secret": "changeme"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR...",
  "expires": "2025-12-30T12:00:00.000Z"
}
```

### Using the Token
Include the token in the `Authorization` header of subsequent requests:
```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR...
```

## 📡 Endpoints

### Proxy Hosts

#### Get all Proxy Hosts
**GET** `/api/nginx/proxy-hosts`

**Parameters:**
*   `expand`: Comma-separated list of relations to include (e.g., `owner,access_list,certificate`).

#### Create a Proxy Host
**POST** `/api/nginx/proxy-hosts`

**Body:**
```json
{
  "domain_names": ["example.com"],
  "forward_scheme": "http",
  "forward_host": "192.168.1.50",
  "forward_port": 8080,
  "access_list_id": 0,
  "certificate_id": 0,
  "meta": {
    "letsencrypt_agree": false,
    "dns_challenge": false
  },
  "advanced_config": "",
  "locations": [],
  "block_exploits": true,
  "caching_enabled": false,
  "allow_websocket_upgrade": true
}
```

### Reports

#### Dashboard Statistics
**GET** `/api/reports/hosts`

Returns counts of all host types (proxy, redirection, dead, stream) and their status.

---
[🏠 Home](Home) | [🐞 Report a Bug](https://github.com/shedowe19/ShieldPM/issues)
