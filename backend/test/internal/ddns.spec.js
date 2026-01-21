import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ddnsService from '../../internal/ddns.js';
import DdnsProvider from '../../models/ddns_provider.js';

// Mock DB
vi.mock('../../models/ddns_provider.js', () => {
    return {
        default: {
            query: vi.fn(),
        }
    };
});

// Mock Logger
vi.mock('../../logger.js', () => ({
    global: {
        info: vi.fn(),
        error: vi.fn(),
        success: vi.fn(),
    }
}));

// Mock Global Fetch
const fetchMock = vi.fn();
global.fetch = fetchMock;

describe('DDNS Service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('getWanIp', () => {
        it('should return IP on success', async () => {
            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ ip: '1.2.3.4' })
            });
            const ip = await ddnsService.getWanIp();
            expect(ip).toBe('1.2.3.4');
            expect(fetchMock).toHaveBeenCalledWith('https://api.ipify.org?format=json');
        });

        it('should throw on failure', async () => {
            fetchMock.mockResolvedValueOnce({
                ok: false,
                statusText: 'Bad Request'
            });
            await expect(ddnsService.getWanIp()).rejects.toThrow('IP Fetch failed: Bad Request');
        });
    });

    describe('updateProvider', () => {
        it('should update Cloudflare', async () => {
            const provider = {
                id: 1,
                name: 'Test CF',
                provider: 'cloudflare',
                domains: ['example.com'],
                config: { token: 'abc', zone_id: 'xyz' },
                last_ip: '1.1.1.1'
            };

            // Mock List Record
            fetchMock.mockResolvedValueOnce({
                json: async () => ({ success: true, result: [{ id: 'rec1', proxied: false }] })
            });

            // Mock Update Record
            fetchMock.mockResolvedValueOnce({
                json: async () => ({ success: true })
            });

            // Mock DB Patch
            const patchAndFetchById = vi.fn().mockResolvedValue({});
            DdnsProvider.query.mockReturnValue({
                patchAndFetchById
            });

            await ddnsService.updateProvider(provider, '2.2.2.2');

            expect(fetchMock).toHaveBeenCalledTimes(2);
            expect(patchAndFetchById).toHaveBeenCalledWith(1, expect.objectContaining({
                last_ip: '2.2.2.2',
                last_error: null
            }));
        });
    });
});
