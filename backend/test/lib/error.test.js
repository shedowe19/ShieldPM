import { describe, it, expect } from 'vitest';
import errs from '../../lib/error.js';

describe('backend/lib/error.js', () => {
    it('PermissionError should be configured correctly', () => {
        const err = new errs.PermissionError('msg');
        expect(err).toBeInstanceOf(Error);
        expect(err.name).toBe('PermissionError');
        expect(err.status).toBe(403);
        expect(err.public).toBe(true);
        expect(err.message).toBe('msg');
    });

    it('ItemNotFoundError should be configured correctly', () => {
        const err = new errs.ItemNotFoundError('123');
        expect(err.name).toBe('ItemNotFoundError');
        expect(err.status).toBe(404);
        expect(err.public).toBe(true);
        expect(err.message).toContain('123');
    });

    it('AuthError should be configured correctly', () => {
        const err = new errs.AuthError('msg', 'i18n_key');
        expect(err.name).toBe('AuthError');
        expect(err.status).toBe(400);
        expect(err.public).toBe(true);
        expect(err.message_i18n).toBe('i18n_key');
    });

    it('InternalError should be configured correctly', () => {
        const err = new errs.InternalError('msg');
        expect(err.name).toBe('InternalError');
        expect(err.status).toBe(500);
        expect(err.public).toBe(false);
    });

    it('InternalValidationError should be configured correctly', () => {
        const err = new errs.InternalValidationError('msg');
        expect(err.name).toBe('InternalValidationError');
        expect(err.status).toBe(400);
        expect(err.public).toBe(false);
    });

    it('ConfigurationError should be configured correctly', () => {
        const err = new errs.ConfigurationError('msg');
        expect(err.name).toBe('ConfigurationError');
        expect(err.status).toBe(400);
        expect(err.public).toBe(true);
    });

    it('CacheError should be configured correctly', () => {
        const err = new errs.CacheError('msg');
        expect(err.name).toBe('CacheError');
        expect(err.status).toBe(500);
        expect(err.public).toBe(false);
    });

    it('ValidationError should be configured correctly', () => {
        const err = new errs.ValidationError('msg');
        expect(err.name).toBe('ValidationError');
        expect(err.status).toBe(400);
        expect(err.public).toBe(true);
    });

    it('AssertionFailedError should be configured correctly', () => {
        const err = new errs.AssertionFailedError('msg');
        expect(err.name).toBe('AssertionFailedError');
        expect(err.status).toBe(400);
        expect(err.public).toBe(false);
    });

    it('UnauthorizedError should be configured correctly', () => {
        const err = new errs.UnauthorizedError('msg');
        expect(err.name).toBe('UnauthorizedError');
        expect(err.status).toBe(401);
        expect(err.public).toBe(true);
    });

    it('CommandError should be configured correctly', () => {
        const err = new errs.CommandError('stderr output', 127);
        expect(err.name).toBe('CommandError');
        expect(err.message).toBe('stderr output');
        expect(err.code).toBe(127);
        expect(err.public).toBe(false);
    });
});
