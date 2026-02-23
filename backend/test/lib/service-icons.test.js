import { describe, it, expect } from 'vitest';
import serviceIcons from '../../lib/service-icons.js';

describe('backend/lib/service-icons.js', () => {
    describe('detectService', () => {
        it('should detect service by port', () => {
            const service = serviceIcons.detectService(8123);
            expect(service.name).toBe('home-assistant');
        });

        it('should detect service by hostname', () => {
            const service = serviceIcons.detectService(8080, 'zigbee2mqtt.local');
            expect(service.name).toBe('zigbee2mqtt');
        });

        it('should return null for unknown service', () => {
            const service = serviceIcons.detectService(99999);
            expect(service).toBeNull();
        });

        it('should prefer hostname match over port match', () => {
            // If I use 8080 and 'qbittorrent', it should match qbittorrent
            const service = serviceIcons.detectService(8080, 'qbittorrent');
            expect(service.name).toBe('qbittorrent');
        });
    });

    describe('getIconUrl', () => {
        it('should return correct URL', () => {
            const url = serviceIcons.getIconUrl('test-service');
            expect(url).toContain('test-service.svg');
            expect(url).toContain(serviceIcons.ICON_CDN_BASE);
        });
    });

    describe('getAllServices', () => {
        it('should return list of unique services', () => {
            const services = serviceIcons.getAllServices();
            expect(Array.isArray(services)).toBe(true);
            expect(services.length).toBeGreaterThan(0);

            // Check structure
            const first = services[0];
            expect(first).toHaveProperty('name');
            expect(first).toHaveProperty('displayName');
            expect(first).toHaveProperty('iconUrl');

            // Check uniqueness
            const names = services.map(s => s.name);
            const uniqueNames = new Set(names);
            expect(names.length).toBe(uniqueNames.size);
        });
    });
});
