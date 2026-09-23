## Was ist ein Proxy-Host?

Ein Proxy-Host ist der eingehende Endpunkt für einen Webdienst, den Sie weiterleiten möchten.

Er bietet optionale SSL-Terminierung für Ihren Dienst, der möglicherweise keine integrierte SSL-Unterstützung hat.

Proxy-Hosts sind die häufigste Verwendung für den ShieldPM.

## Host-Überwachung

Die Spalte **Dienstprüfung** zeigt, ob der konfigurierte Zielserver antwortet. Sie ist unabhängig vom Nginx-Status. Unter **Host-Überwachung** im Aktionsmenü können Sie HTTP(S)- oder TCP-Prüfungen aktivieren, Intervall und Zeitlimit einstellen und die letzten Ergebnisse sehen. Für HTTP(S) geben Sie einen relativen Pfad wie `/health` und den erwarteten Statuscode an. **Jetzt prüfen** führt nach dem Speichern eine manuelle Prüfung aus.

Bei Statuswechseln können Benachrichtigungen über die Telegram-Integration des Host-Eigentümers versendet werden. Ohne Monitor steht dort **Nicht eingerichtet**; ein deaktivierter Host oder Monitor zeigt **Pausiert**. Verwenden Sie einen ohne Anmeldung erreichbaren Health-Pfad oder wählen Sie TCP für eine einfache Verbindungsprüfung.
