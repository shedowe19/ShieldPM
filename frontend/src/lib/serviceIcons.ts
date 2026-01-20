/**
 * Service Icon Detection Library (Frontend)
 * Maps ports and hostnames to known service icons
 *
 * Icon source: https://github.com/walkxcode/dashboard-icons
 */

export interface ServiceDefinition {
    port: number;
    hostname?: string;
    name: string;
    displayName: string;
}

const SERVICES: ServiceDefinition[] = [
    // Home Automation
    { port: 8123, name: "home-assistant", displayName: "Home Assistant" },
    { port: 7681, name: "home-assistant", displayName: "Home Assistant" },
    { port: 1880, name: "node-red", displayName: "Node-RED" },
    { port: 8080, hostname: "zigbee2mqtt", name: "zigbee2mqtt", displayName: "Zigbee2MQTT" },

    // Media Servers
    { port: 8096, name: "jellyfin", displayName: "Jellyfin" },
    { port: 8920, name: "jellyfin", displayName: "Jellyfin" },
    { port: 32400, name: "plex", displayName: "Plex" },
    { port: 8097, name: "emby", displayName: "Emby" },
    { port: 8181, name: "tautulli", displayName: "Tautulli" },

    // Media Management (*arr stack)
    { port: 8989, name: "sonarr", displayName: "Sonarr" },
    { port: 7878, name: "radarr", displayName: "Radarr" },
    { port: 6767, name: "bazarr", displayName: "Bazarr" },
    { port: 8686, name: "lidarr", displayName: "Lidarr" },
    { port: 8787, name: "readarr", displayName: "Readarr" },
    { port: 9696, name: "prowlarr", displayName: "Prowlarr" },
    { port: 9117, name: "jackett", displayName: "Jackett" },
    { port: 5055, name: "overseerr", displayName: "Overseerr" },
    { port: 5056, name: "jellyseerr", displayName: "Jellyseerr" },
    { port: 8085, name: "stash", displayName: "Stash" },

    // Downloaders
    { port: 8080, hostname: "qbittorrent", name: "qbittorrent", displayName: "qBittorrent" },
    { port: 9091, name: "transmission", displayName: "Transmission" },
    { port: 6789, name: "nzbget", displayName: "NZBGet" },
    { port: 8787, hostname: "sabnzbd", name: "sabnzbd", displayName: "SABnzbd" },
    { port: 7474, name: "autobrr", displayName: "Autobrr" },
    { port: 9696, hostname: "flaresolverr", name: "flaresolverr", displayName: "FlareSolverr" },

    // Dashboards & Monitoring
    { port: 3000, hostname: "grafana", name: "grafana", displayName: "Grafana" },
    { port: 5601, name: "kibana", displayName: "Kibana" },
    { port: 9000, name: "portainer", displayName: "Portainer" },
    { port: 9443, hostname: "portainer", name: "portainer", displayName: "Portainer" },
    { port: 9090, name: "prometheus", displayName: "Prometheus" },
    { port: 9093, name: "alertmanager", displayName: "Alertmanager" },
    { port: 19999, name: "netdata", displayName: "Netdata" },
    { port: 8080, hostname: "uptime-kuma", name: "uptime-kuma", displayName: "Uptime Kuma" },
    { port: 3001, name: "uptime-kuma", displayName: "Uptime Kuma" },
    { port: 8081, hostname: "homepage", name: "homepage", displayName: "Homepage" },
    { port: 4200, hostname: "dashy", name: "dashy", displayName: "Dashy" },
    { port: 8082, hostname: "homarr", name: "homarr", displayName: "Homarr" },

    // Databases
    { port: 5432, name: "postgresql", displayName: "PostgreSQL" },
    { port: 3306, name: "mysql", displayName: "MySQL" },
    { port: 27017, name: "mongodb", displayName: "MongoDB" },
    { port: 6379, name: "redis", displayName: "Redis" },
    { port: 8086, name: "influxdb", displayName: "InfluxDB" },
    { port: 9200, name: "elasticsearch", displayName: "Elasticsearch" },

    // Networking & DNS
    { port: 80, hostname: "pihole", name: "pi-hole", displayName: "Pi-hole" },
    { port: 3000, hostname: "adguard", name: "adguard-home", displayName: "AdGuard Home" },
    { port: 8083, hostname: "adguard", name: "adguard-home", displayName: "AdGuard Home" },
    { port: 443, hostname: "traefik", name: "traefik", displayName: "Traefik" },
    { port: 8080, hostname: "traefik", name: "traefik", displayName: "Traefik" },
    { port: 80, hostname: "caddy", name: "caddy", displayName: "Caddy" },
    { port: 81, name: "nginx-proxy-manager", displayName: "Nginx Proxy Manager" },
    { port: 3000, hostname: "headscale", name: "headscale", displayName: "Headscale" },
    { port: 8081, hostname: "tailscale", name: "tailscale", displayName: "Tailscale" },

    // Cloud & Storage
    { port: 11000, name: "nextcloud", displayName: "Nextcloud" },
    { port: 443, hostname: "nextcloud", name: "nextcloud", displayName: "Nextcloud" },
    { port: 5000, name: "synology-dsm", displayName: "Synology DSM" },
    { port: 5001, name: "synology-dsm", displayName: "Synology DSM" },
    { port: 9980, name: "collabora-online", displayName: "Collabora Online" },
    { port: 9980, hostname: "code", name: "collabora-online", displayName: "Collabora Online" },
    { port: 9000, hostname: "minio", name: "minio", displayName: "MinIO" },
    { port: 8384, name: "syncthing", displayName: "Syncthing" },
    { port: 8888, hostname: "filebrowser", name: "filebrowser", displayName: "Filebrowser" },

    // Git & Development
    { port: 3000, hostname: "gitea", name: "gitea", displayName: "Gitea" },
    { port: 3000, hostname: "forgejo", name: "forgejo", displayName: "Forgejo" },
    { port: 80, hostname: "gitlab", name: "gitlab", displayName: "GitLab" },
    { port: 443, hostname: "gitlab", name: "gitlab", displayName: "GitLab" },
    { port: 8443, hostname: "gitlab", name: "gitlab", displayName: "GitLab" },
    { port: 8443, hostname: "code-server", name: "code-server", displayName: "Code Server" },
    { port: 8888, name: "jupyter", displayName: "Jupyter" },

    // Authentication & Security
    { port: 9000, hostname: "authentik", name: "authentik", displayName: "Authentik" },
    { port: 9443, hostname: "authentik", name: "authentik", displayName: "Authentik" },
    { port: 8080, hostname: "keycloak", name: "keycloak", displayName: "Keycloak" },
    { port: 8200, name: "vault", displayName: "Vault" },
    { port: 8500, name: "consul", displayName: "Consul" },
    { port: 7745, name: "vaultwarden", displayName: "Vaultwarden" },
    { port: 8080, hostname: "bitwarden", name: "bitwarden", displayName: "Bitwarden" },

    // Gaming
    { port: 25565, name: "minecraft", displayName: "Minecraft" },
    { port: 8443, hostname: "pterodactyl", name: "pterodactyl", displayName: "Pterodactyl" },

    // Unifi & Networking Hardware
    { port: 8443, name: "unifi", displayName: "UniFi" },
    { port: 4443, name: "unifi", displayName: "UniFi" },
    { port: 8880, name: "unifi", displayName: "UniFi" },

    // Communication
    { port: 8448, name: "matrix", displayName: "Matrix" },
    { port: 8008, hostname: "synapse", name: "matrix-synapse", displayName: "Synapse" },
    { port: 3000, hostname: "element", name: "element", displayName: "Element" },
    { port: 9005, hostname: "ntfy", name: "ntfy", displayName: "Ntfy" },
    { port: 8065, name: "mattermost", displayName: "Mattermost" },

    // Productivity
    { port: 8080, hostname: "paperless", name: "paperless-ngx", displayName: "Paperless-ngx" },
    { port: 3000, hostname: "outline", name: "outline", displayName: "Outline" },
    { port: 3000, hostname: "immich", name: "immich", displayName: "Immich" },
    { port: 2283, name: "immich", displayName: "Immich" },
    { port: 80, hostname: "bookstack", name: "bookstack", displayName: "BookStack" },
    { port: 6875, name: "mealie", displayName: "Mealie" },
    { port: 9000, hostname: "mealie", name: "mealie", displayName: "Mealie" },
    { port: 3000, hostname: "linkwarden", name: "linkwarden", displayName: "Linkwarden" },

    // Container & Orchestration
    { port: 2375, name: "docker", displayName: "Docker" },
    { port: 2376, name: "docker", displayName: "Docker" },
    { port: 6443, name: "kubernetes", displayName: "Kubernetes" },
    { port: 8001, name: "kubernetes-dashboard", displayName: "Kubernetes Dashboard" },
    { port: 10250, name: "kubelet", displayName: "Kubelet" },

    // Misc / Default fallbacks
    { port: 80, name: "nginx", displayName: "Nginx" },
    { port: 443, name: "nginx", displayName: "Nginx" },
    { port: 8080, name: "apache", displayName: "Apache" },
];

export const ICON_CDN_BASE = "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg";

/**
 * Detect service based on port and hostname
 */
export function detectService(port: number, hostname = ""): ServiceDefinition | null {
    const lowerHostname = hostname?.toLowerCase() || "";

    // First try exact match with hostname (more specific)
    const hostnameMatch = SERVICES.find(
        (s) => s.port === port && s.hostname && lowerHostname.includes(s.hostname),
    );
    if (hostnameMatch) return hostnameMatch;

    // Fallback to port-only match (less specific)
    return SERVICES.find((s) => s.port === port && !s.hostname) || null;
}

/**
 * Get icon URL for a service
 */
export function getIconUrl(serviceName: string): string {
    return `${ICON_CDN_BASE}/${serviceName}.svg`;
}

/**
 * Get all available services (for autocomplete/picker)
 */
export function getAllServices(): { name: string; displayName: string; iconUrl: string }[] {
    const seen = new Set<string>();
    return SERVICES.filter((s) => {
        if (seen.has(s.name)) return false;
        seen.add(s.name);
        return true;
    }).map((s) => ({
        name: s.name,
        displayName: s.displayName,
        iconUrl: getIconUrl(s.name),
    }));
}

export { SERVICES };
