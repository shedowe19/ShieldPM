# GeoIP2 test database

`GeoIP2-Country-Test.mmdb` is a synthetic test database from
[MaxMind-DB](https://github.com/maxmind/MaxMind-DB/blob/276926d23b4109ca5452709bfb5931c338afb34c/test-data/GeoIP2-Country-Test.mmdb),
commit `276926d23b4109ca5452709bfb5931c338afb34c`. It is for tests only, not production country identification.

The upstream project distributes its specification and test databases under either
MIT or Apache 2.0. This copy uses MIT; the copyright and permission notice are in
`MAXMIND-LICENSE.txt`.

The notice includes the upstream README's copyright statement followed by the
unchanged pinned `LICENSE-MIT` text. Its SHA-256 is
`1df87b7d02b61565af885de9c6368651d0ffd1893b2d289ecaae725e9ac2f914`.

- Size: 19,492 bytes
- SHA-256: `b37601903448683d241af52893c8cbf0fed461e0cdebe0bfaca01891fdeb6db9`
- Test assignments: `81.2.69.160` → `GB`, `89.160.20.128` → `SE`

The Nginx smoke reads the file through `NGINX_GEOIP_DATABASE`. Its country lookup
uses the same `$geoip2_country_code` / `source=$remote_addr` definition as Analytics.

## ASN test database

`GeoLite2-ASN-Test.mmdb` comes from the same MaxMind-DB commit:
[upstream fixture](https://github.com/maxmind/MaxMind-DB/blob/276926d23b4109ca5452709bfb5931c338afb34c/test-data/GeoLite2-ASN-Test.mmdb).
The same MIT notice in `MAXMIND-LICENSE.txt` applies. It is synthetic test data,
not a production ASN database.

- Size: 12,653 bytes
- SHA-256: `75901b98ed6e58d3bd41af9985044b747a7ec0be1369f930c24f5e044427181a`

The smoke's independent libmaxminddb oracle reads ASN and organization for its
chosen test addresses directly from this file; it does not invent assignments.

## City startup fixture

`GeoIP2-City-Test.mmdb` is from the same upstream commit and uses the same MIT
notice: [upstream fixture](https://github.com/maxmind/MaxMind-DB/blob/276926d23b4109ca5452709bfb5931c338afb34c/test-data/GeoIP2-City-Test.mmdb).
It lets the offline Docker smoke enable Analytics' existing City/Country blocks
while exercising the optional ASN startup block.

- Size: 22,569 bytes
- SHA-256: `ed972738e4e03a3e56e12041a6af4d91592249d110f7e4a647e5f2fa0e639c09`
