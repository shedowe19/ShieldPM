import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import utils from '../../lib/utils.js';
import fs from 'node:fs';
import { execFile as nodeExecFile } from 'node:child_process';

// Mock fs
vi.mock('node:fs', () => {
    return {
        default: {
            promises: {
                readdir: vi.fn(),
                readFile: vi.fn(),
                writeFile: vi.fn(),
                mkdir: vi.fn(),
            },
            existsSync: vi.fn(),
        }
    };
});

// Mock child_process
vi.mock('node:child_process', () => ({
    execFile: vi.fn(),
}));

// Mock logger
vi.mock('../../logger.js', () => ({
    global: {},
    debug: vi.fn(),
}));

describe('backend/lib/utils.js', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('writeHash', () => {
        it('should calculate hash from templates and write to file', async () => {
            // Mock fs.promises.readdir to return some files
            fs.promises.readdir.mockResolvedValue(['template1.conf', 'template2.conf']);

            // Mock fs.promises.readFile to return content with env vars
            fs.promises.readFile.mockImplementation((path) => {
                if (path.includes('template1.conf')) return Promise.resolve('server_name {{ env.DOMAIN }};');
                if (path.includes('template2.conf')) return Promise.resolve('listen {{ env.PORT }};');
                return Promise.resolve('');
            });

            // Mock process.env
            const originalEnv = process.env;
            process.env = { ...originalEnv, DOMAIN: 'example.com', PORT: '80', TV: '1' };

            // Mock mkdir to succeed
            fs.promises.mkdir.mockResolvedValue();

            await utils.writeHash();

            // Verify readdir was called
            expect(fs.promises.readdir).toHaveBeenCalled();

            // Verify readFile was called for each file
            expect(fs.promises.readFile).toHaveBeenCalledTimes(2);

            // Verify writeFile was called with a hash
            expect(fs.promises.writeFile).toHaveBeenCalledWith(
                '/data/shieldpm/env.sha512sum',
                expect.any(String)
            );

            // Restore process.env
            process.env = originalEnv;
        });

        it('should create directory if it does not exist', async () => {
             fs.promises.readdir.mockResolvedValue([]);
             fs.existsSync.mockReturnValue(false);
             fs.promises.mkdir.mockResolvedValue();

             await utils.writeHash();

             expect(fs.promises.mkdir).toHaveBeenCalledWith('/data/shieldpm', { recursive: true });
        });
    });

    describe('execFile', () => {
        it('should execute a command and return stdout + stderr', async () => {
            // Mock nodeExecFile to call the callback with success
            nodeExecFile.mockImplementation((cmd, args, callback) => {
                // Handle optional args
                if (typeof args === 'function') {
                    callback = args;
                    args = [];
                }
                callback(null, { stdout: 'output', stderr: 'error' });
            });

            const result = await utils.execFile('ls', ['-la']);
            expect(result).toBe('outputerror');
            expect(nodeExecFile).toHaveBeenCalledWith('ls', ['-la'], expect.any(Function));
        });

        it('should throw CommandError on failure', async () => {
            // Mock nodeExecFile to call the callback with error
            nodeExecFile.mockImplementation((cmd, args, callback) => {
                 if (typeof args === 'function') {
                    callback = args;
                    args = [];
                }
                const err = new Error('Command failed');
                err.stdout = 'stdout info';
                err.stderr = 'stderr info';
                callback(err);
            });

            await expect(utils.execFile('fail', [])).rejects.toThrow('stdout infostderr info');
        });
    });

    describe('omitRow', () => {
        it('should omit specified keys from an object', () => {
            const row = { a: 1, b: 2, c: 3 };
            const omit = utils.omitRow(['b']);
            const result = omit(row);
            expect(result).toEqual({ a: 1, c: 3 });
        });
    });

    describe('omitRows', () => {
        it('should omit specified keys from an array of objects', () => {
            const rows = [{ a: 1, b: 2 }, { a: 3, b: 4 }];
            const omit = utils.omitRows(['b']);
            const result = omit(rows);
            expect(result).toEqual([{ a: 1 }, { a: 3 }]);
        });
    });

    describe('getRenderEngine', () => {
        it('should return a Liquid engine instance', () => {
            const engine = utils.getRenderEngine();
            expect(engine).toBeDefined();
            expect(engine.renderFile).toBeDefined();
        });

        it('should register nginxAccessRule filter', async () => {
             const engine = utils.getRenderEngine();
             const template = `{{ rule | nginxAccessRule }}`;
             const context = { rule: { directive: 'allow', address: '127.0.0.1' } };
             const result = await engine.parseAndRender(template, context);
             expect(result).toBe('allow 127.0.0.1;');
        });

        it('should return empty string for invalid nginxAccessRule input', async () => {
             const engine = utils.getRenderEngine();
             const template = `{{ rule | nginxAccessRule }}`;
             const context = { rule: {} }; // Missing properties
             const result = await engine.parseAndRender(template, context);
             expect(result).toBe('');
        });
    });
});
