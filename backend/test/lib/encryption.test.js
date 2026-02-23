import { describe, it, expect, vi } from 'vitest';

// Mock config.js before importing encryption.js
vi.mock('../../lib/config.js', () => ({
    getEncryptionKey: vi.fn(() => '000102030405060708090a0b0c0d0e0f000102030405060708090a0b0c0d0e0f'), // 32 bytes in hex
}));

import * as encryption from '../../lib/encryption.js';

describe('backend/lib/encryption.js', () => {
    it('should encrypt and decrypt correctly', () => {
        const text = 'Hello World';
        const encrypted = encryption.encrypt(text);
        expect(encrypted).not.toBe(text);
        expect(encrypted).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/); // format check

        const decrypted = encryption.decrypt(encrypted);
        expect(decrypted).toBe(text);
    });

    it('should throw error for invalid encrypted format', () => {
        expect(() => encryption.decrypt('invalid')).toThrow('Invalid encrypted text format');
    });

    it('should throw error when decrypting with corrupted data', () => {
        const text = 'Secret';
        const encrypted = encryption.encrypt(text);
        const parts = encrypted.split(':');
        // Modify the ciphertext
        parts[1] = parts[1].split('').reverse().join('');
        const corrupted = parts.join(':');

        expect(() => encryption.decrypt(corrupted)).toThrow();
    });
});
