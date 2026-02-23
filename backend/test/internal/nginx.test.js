import { describe, it, expect, vi, beforeEach } from 'vitest';
import internalNginx from '../../internal/nginx.js';
import utils from '../../lib/utils.js';
import internalAnubis from '../../internal/anubis.js';
import fs from 'node:fs';

// Mock utils
vi.mock('../../lib/utils.js', () => ({
    default: {
        execFile: vi.fn(),
        getRenderEngine: vi.fn(),
        writeHash: vi.fn(),
        getFileFriendlyHostType: vi.fn((t) => t.replace(/-/g, '_')),
    }
}));

// Mock logger
vi.mock('../../logger.js', () => ({
    nginx: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
    },
    debug: vi.fn(),
    global: {},
}));

// Mock anubis
vi.mock('../../internal/anubis.js', () => ({
    default: {
        generatePolicy: vi.fn(),
    }
}));

// Mock fs
vi.mock('node:fs', () => ({
    default: {
        promises: {
            writeFile: vi.fn(),
            unlink: vi.fn(),
            rename: vi.fn(),
            copyFile: vi.fn(),
            access: vi.fn(),
        },
    }
}));

describe('backend/internal/nginx.js', () => {
    let mockModel;
    let mockQueryBuilder;
    let mockHost;

    beforeEach(() => {
        vi.clearAllMocks();

        mockQueryBuilder = {
            where: vi.fn().mockReturnThis(),
            patch: vi.fn().mockResolvedValue(1),
        };

        mockModel = {
            query: vi.fn(() => mockQueryBuilder),
        };

        mockHost = {
            id: 1,
            domain_names: ['example.com'],
            forward_scheme: 'http',
            forward_host: '1.2.3.4',
            forward_port: 80,
            caching_enabled: false,
            block_exploits: false,
            allow_websocket_upgrade: false,
            access_list_id: 0,
            certificate_id: 0,
            ssl_forced: false,
            hsts_enabled: false,
            hsts_subdomains: false,
            http2_support: false,
            meta: {},
        };

        // Mock render engine
        utils.getRenderEngine.mockReturnValue({
            renderFile: vi.fn().mockResolvedValue('server { ... }'),
            registerFilter: vi.fn(),
        });

        // Mock execFile success by default
        utils.execFile.mockResolvedValue('ok');
    });

    describe('configure', () => {
        it('should configure nginx successfully', async () => {
            await internalNginx.configure(mockModel, 'proxy-host', mockHost);

            // Verify backup
            expect(fs.promises.copyFile).toHaveBeenCalled();
            // Verify generate config
            expect(utils.getRenderEngine().renderFile).toHaveBeenCalled();
            expect(fs.promises.writeFile).toHaveBeenCalled();
            // Verify test
            expect(utils.execFile).toHaveBeenCalledWith('nginx', ['-tq']);
            // Verify delete backup
            expect(internalAnubis.generatePolicy).toHaveBeenCalled();
            // Verify meta update
            expect(mockModel.query).toHaveBeenCalled();
            expect(mockQueryBuilder.patch).toHaveBeenCalledWith(expect.objectContaining({
                meta: expect.objectContaining({ nginx_online: true })
            }));

            // Reload called?
            expect(utils.execFile).toHaveBeenCalledWith('nginx', ['-s', 'reload']);
        });

        it('should rollback on configuration failure', async () => {
            // Mock test failure
            let failedOnce = false;
            utils.execFile.mockImplementation((cmd, args) => {
                if (cmd === 'nginx' && args && args[0] === '-tq' && !failedOnce) {
                    failedOnce = true;
                    return Promise.reject(new Error('nginx test failed'));
                }
                return Promise.resolve('ok');
            });

            // Mock rename (renameConfigAsError)
            fs.promises.rename.mockResolvedValue();

            await internalNginx.configure(mockModel, 'proxy-host', mockHost);

            // Verify rollback
            expect(fs.promises.rename).toHaveBeenCalledTimes(2); // once to .err, once to restore .bak

            // Verify meta update with error
            expect(mockQueryBuilder.patch).toHaveBeenCalledWith(expect.objectContaining({
                meta: expect.objectContaining({ nginx_online: false })
            }));
        });
    });

    describe('test', () => {
        it('should call nginx -tq', async () => {
            await internalNginx.test();
            expect(utils.execFile).toHaveBeenCalledWith('nginx', ['-tq']);
        });
    });

    describe('reload', () => {
        it('should call nginx -s reload', async () => {
            await internalNginx.reload();
            expect(utils.execFile).toHaveBeenCalledWith('nginx', ['-s', 'reload']);
        });
    });

    describe('deleteConfig', () => {
        it('should delete config and .err files', async () => {
            fs.promises.access.mockResolvedValue(); // file exists
            await internalNginx.deleteConfig('proxy-host', mockHost);
            expect(fs.promises.unlink).toHaveBeenCalledTimes(2);
        });
    });
});
