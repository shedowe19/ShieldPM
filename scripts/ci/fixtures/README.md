# GeoIP2 test database

`GeoIP2-Country-Test.mmdb` is a synthetic test database from
[MaxMind-DB](https://github.com/maxmind/MaxMind-DB/blob/276926d23b4109ca5452709bfb5931c338afb34c/test-data/GeoIP2-Country-Test.mmdb),
commit `276926d23b4109ca5452709bfb5931c338afb34c`. It is for tests only, not production country identification.

The upstream project distributes its specification and test databases under either
MIT or Apache 2.0. This copy uses MIT; the copyright and permission notice are in
`MAXMIND-LICENSE.txt`.

- Size: 19,492 bytes
- SHA-256: `b37601903448683d241af52893c8cbf0fed461e0cdebe0bfaca01891fdeb6db9`
- Test assignments: `81.2.69.160` → `GB`, `89.160.20.128` → `SE`

The Nginx smoke reads the file through `NGINX_GEOIP_DATABASE`. Its country lookup
uses the same `$geoip2_country_code` / `source=$remote_addr` definition as Analytics.
