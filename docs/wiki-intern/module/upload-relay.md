# Resumable Upload Relay

## Zweck

Das optionale **Resumable Upload Relay** eines Proxy Hosts nimmt große Dateien in wiederaufnehmbaren, CDN-tauglichen Teilen entgegen. Die Teile werden unter `${DATA_PATH}/upload-relay/` persistent gespeichert. Nach dem letzten Teil bestätigt ShieldPM den Upload sofort als dauerhaft `queued`; ein lokaler Finalizer streamt die Datei anschließend **direkt zum privaten `forward_host`**. Der Origin-Transfer läuft damit weder erneut über die öffentliche Cloudflare-Domain noch innerhalb der zeitkritischen öffentlichen Chunk-Anfrage.

## Aktivierung

Im Proxy-Host-Dialog unter **Erweitert → Fortsetzbares Upload-Relay** aktivieren und festlegen:

| Einstellung                      |               Standard | Bedeutung                                                                                            |
| -------------------------------- | ---------------------: | ---------------------------------------------------------------------------------------------------- |
| Öffentlicher Upload-Pfad         |    `/_shieldpm-upload` | Pfad, über den der Upload-Client tus spricht.                                                        |
| Privater Upstream-Zielpfad       |                    `/` | Pfad auf dem bereits konfigurierten privaten `forward_host`.                                         |
| Chunk-Größe                      |    `83886080` (80 MiB) | Obergrenze je Request. Der Wert muss zwischen 5 MiB und 90 MiB liegen.                               |
| Maximale Dateigröße              | `10737418240` (10 GiB) | Obergrenze für einen Upload.                                                                         |
| Reservierter temporärer Speicher | `21474836480` (20 GiB) | Pro Host reservierbares Gesamtbudget offener Uploads; höchstens 32 Sessions sind gleichzeitig offen. |
| Bereinigung                      |                 `24` h | Abgelaufene unvollständige Uploads werden beim Start und anschließend stündlich entfernt.            |

Eine Proxy-Host-Access-List ist beim Aktivieren verpflichtend; ohne sie wird die Konfiguration abgewiesen, bevor ein
anonymer Client Speicher reservieren kann. Deren IP-/Basic-/SSO-Regeln gelten unverändert für den Uploadpfad. Eine
`satisfy any`-Liste mit `allow all` gilt dabei als öffentlich und kann kein Relay schützen. Bei `pass_auth: false`
wird ein Basic-`Authorization`-Header ausdrücklich nicht zum Origin weitergereicht. Das Relay ist standardmäßig
deaktiviert.

## Protokoll

Der Endpunkt implementiert das relevante [tus 1.0.0](https://tus.io/protocols/resumable-upload) Basisprotokoll: `POST` (Erstellung), `HEAD` (Status), `PATCH` (Teil übertragen) und `DELETE` (abbrechen). Ein Offsetkonflikt antwortet mit `409 Conflict`, `Tus-Resumable` und dem autoritativen `Upload-Offset`. Bei der letzten bestätigten Chunk-Anfrage erhält der Client ebenfalls sofort `204 No Content`; der Response-Header `Upload-Relay-State: queued` zeigt den Übergang an. Chunk-Datei, Verzeichnis und Metadaten werden vor dieser Bestätigung synchron auf Datenträger geschrieben. Der Finalizer arbeitet mit maximal einer parallelen Origin-Übertragung und schreibt die Zustände `uploading → queued → forwarding → completed/failed` atomar in die Upload-Metadaten.

`HEAD <relay-path>/:id` liefert neben Länge und Offset den Header `Upload-Relay-State` sowie `Cache-Control: no-store`. `GET <relay-path>/:id` liefert denselben sicheren Status als JSON. Ein explizites `POST <relay-path>/:id/finalize` stellt einen fehlgeschlagenen vollständigen Upload erneut in die Queue und gibt ebenfalls unmittelbar `204` mit dem Zustand `queued` zurück. Der Browser bzw. Client muss den Upload explizit über diesen Endpunkt anstoßen; ein normaler einzelner Upload-Request kann nach Cloudflare nicht transparent gesplittet werden.

### Beispielablauf

```text
POST /_shieldpm-upload
Tus-Resumable: 1.0.0
Upload-Length: 524288000
Upload-Metadata: filename ZmlsbS56aXA=,content-type YXBwbGljYXRpb24vemlw

→ 201 Created
  Location: /_shieldpm-upload/<upload-id>
  Upload-Offset: 0

PATCH /_shieldpm-upload/<upload-id>
Tus-Resumable: 1.0.0
Upload-Offset: 0
Content-Type: application/offset+octet-stream
Content-Length: 83886080

<80-MiB-Teil>

→ 204 No Content
  Upload-Offset: 83886080
```

Ein Client setzt nach einem Abbruch mit `HEAD` fort und sendet den nächsten `PATCH` mit dem gelieferten `Upload-Offset`. Bei Erreichen von `Upload-Length` kehrt der letzte `PATCH` zurück, nachdem Chunk und Status `queued` dauerhaft geschrieben sind; erst danach beginnt der lokale Finalizer den POST zum internen Zielpfad. Das verhindert einen Cloudflare-524-Timeout durch einen langsamen finalen Origin-Transfer. Die finale Anfrage überträgt den zusammengesetzten Inhalt als `application/octet-stream`; `Authorization`, `Cookie`, `X-API-Key` und `X-Upload-Token` werden nur im Speicher des laufenden Finalizer-Jobs weitergereicht und niemals in den Upload-Metadaten gespeichert. Der Header `X-ShieldPM-Upload-Id` ist ein verpflichtender Idempotenzschlüssel für den Origin: Ein Origin muss mehrfach eintreffende Requests mit derselben ID sicher deduplizieren, weil eine explizite Wiederholung nach einem unbestimmten Netzwerkfehler notwendig sein kann.

Der Zielservice muss deshalb einen einzelnen Raw-Body-`POST` am gewählten Zielpfad akzeptieren. Für bestehende Anwendungen, die ausschließlich ein bestimmtes `multipart/form-data`-Feld verlangen, wird eine passende Anwendungserweiterung oder ein eigener Upload-Endpunkt benötigt — das Relay simuliert kein beliebiges HTML-Formular.

## Verhalten bei Fehlern

- Teilgrößen, Offsets und Gesamtgröße werden serverseitig vor dem Speichern geprüft.
- Eine abgelehnte oder nicht erreichbare Origin setzt den Zustand auf `failed`; die Teile bleiben erhalten. `POST <relay-path>/:id/finalize` reiht einen neuen Finalisierungsversuch ein, ohne den letzten Chunk erneut übertragen zu müssen. Ändern sich zwischen Queueing und Versand Origin-Ziel, Access-List-Identität/-Regeln/-Zugangsdaten oder die `pass_auth`-Richtlinie, wird nicht mit alten Zielen oder Headern weitergeleitet; der Upload wird mit `configuration-changed` angehalten und muss ausdrücklich finalisiert werden.
- Nach erfolgreicher Origin-Antwort werden die Chunk-Dateien entfernt. Die kleine Status-Metadatei bleibt bis zur regulären Bereinigung erhalten und meldet `completed` samt HTTP-Status des Origins.
- Bei einem Prozessneustart werden nur noch nicht gestartete, wartende Uploads ohne weitergereichte Anmeldeinformationen automatisch wieder eingereiht. Benötigte `Authorization`-, Cookie- oder Token-Header werden absichtlich nicht persistent gespeichert; solche Uploads erhalten `failed` mit `restart-requires-authorization` und müssen über den authentifizierten `finalize`-Endpunkt erneut eingereiht werden. Ein beim Neustart bereits `forwarding`-Upload wird niemals automatisch erneut gesendet, sondern mit `interrupted-forwarding` angehalten.
- Ein `DELETE` markiert einen laufenden Transfer dauerhaft als abgebrochen, signalisiert dessen Abbruch und entfernt die Teile nach Ende des Workers; ein wartender Upload wird unmittelbar gelöscht. Ein abgebrochener Upload kann nicht als `completed` wieder erscheinen.

## Verwandte Seiten

- [Proxy Host](proxy-host.md)
- [Nginx Engine](nginx-engine.md)
- [Datenbank-Migrationen](../daten/migrationen.md)
