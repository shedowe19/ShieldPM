# Troubleshooting & FAQ

Stuck? Here are some solutions to common problems.

## 🔑 Login Issues

### I forgot my Admin Password
If you are using SQLite (default):
1.  Access the container:
    ```bash
    docker exec -it npmplus sh
    ```
2.  Run the password reset utility:
    ```bash
    npm-reset-password
    ```

## 🌐 Connectivity Issues

### "502 Bad Gateway"
This usually means Nginx cannot reach your upstream service.
*   **Check Docker Network:** If `npmplus` is in `network_mode: host`, it can reach other containers on `localhost:<port>` ONLY if those containers also map ports to the host.
*   **Check IP:** Ensure you are using the correct internal IP or container name (if unrelated to host mode).

### "Connection Refused"
*   Is the upstream service running?
*   Is the port correct?

## 📜 Logs

Logs are your best friend when debugging.

### Container Logs
Check the main output for startup errors or crashes:
```bash
docker logs -f npmplus
```

### Nginx Access/Error Logs
By default, these are printed to the docker logs. If you enabled `LOGROTATE=true`, they are written to disk:
*   `/opt/npmplus/nginx/access.log`
*   `/opt/npmplus/nginx/error.log`

## 🔒 Certificates

### Let's Encrypt Errors
*   **Check Port 80:** Certbot requires port 80 to be accessible from the public internet for the HTTP-01 challenge.
*   **Check Logs:** Look for "ACME" or "Certbot" errors in the docker logs.
