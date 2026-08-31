# Token

## Zweck

`backend/internal/token.js` stellt kurzlebige Access-JWTs aus und delegiert Refresh-, Replay-, Step-up- und
Impersonation-Zustand an den Auth-Session-Service.

## Schlüssel und Persistenz

JWT-/Anwendungsschlüssel liegen in `/data/shieldpm/keys.json` mit restriktiven Rechten. Die Datei ist Teil des
verschlüsselten Backups, aber niemals von GitOps. Ein Schlüsselverlust invalidiert Sessions und kann verschlüsselte
Konfiguration unlesbar machen.

## Token-Vertrag

- Access-JWT enthält Subject, Scope, Session-ID und bei Impersonation den Actor-Kontext.
- Middleware vergleicht die Claims mit der aktiven serverseitigen Session; ein gültig signiertes JWT zu einer
  widerrufenen/inkonsistenten Session reicht nicht.
- Refresh-Tokens sind opake Zufallswerte, werden gehasht gespeichert und rotieren bei Nutzung.
- Step-up- und MFA-Pending-Tokens verweisen auf serverseitige One-Time-Challenges mit Zweck und Ablauf.
- ChatOps erzeugt keine JWTs, sondern verwendet einen live Integration-Principal.

## Wichtige Dateien

- `backend/internal/token.js`
- `backend/internal/auth-session-service.js`
- `backend/internal/auth-challenge-service.js`
- `backend/lib/express/jwt.js`
- `backend/lib/express/jwt-decode.js`
- `backend/routes/tokens.js`

## Verwandte Seiten

- [Auth-Session-Service](./auth-session-service.md)
- [Benutzer & Auth](./benutzer-auth.md)
- [ChatOps](./chatops.md)
- [Secrets und Sicherheit](../konfiguration/secrets-und-sicherheit.md)
