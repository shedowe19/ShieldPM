import { describe, it, expect, vi, beforeEach } from 'vitest';
import internalToken from '../../internal/token.js';
import errs from '../../lib/error.js';
import userModel from '../../models/user.js';
import authModel from '../../models/auth.js';
import TokenModel from '../../models/token.js';

// Mock dependencies
vi.mock('../../models/user.js', () => {
    return {
        default: {
            query: vi.fn(),
        }
    };
});

vi.mock('../../models/auth.js', () => {
    return {
        default: {
            query: vi.fn(),
        }
    };
});

vi.mock('../../models/token.js', () => {
    return {
        default: vi.fn(() => ({
            create: vi.fn(),
        }))
    };
});

vi.mock('bcryptjs', () => ({
    default: {
        compare: vi.fn().mockResolvedValue(true),
    }
}));

describe('backend/internal/token.js', () => {
    let mockUserQuery;
    let mockAuthQuery;
    let mockTokenInstance;

    beforeEach(() => {
        vi.clearAllMocks();

        // Setup User mock
        mockUserQuery = {
            where: vi.fn().mockReturnThis(),
            andWhere: vi.fn().mockReturnThis(),
            first: vi.fn(),
        };
        userModel.query.mockReturnValue(mockUserQuery);

        // Setup Auth mock
        mockAuthQuery = {
            where: vi.fn().mockReturnThis(),
            first: vi.fn(),
        };
        authModel.query.mockReturnValue(mockAuthQuery);

        // Setup Token mock
        mockTokenInstance = {
            create: vi.fn(),
        };
        TokenModel.mockReturnValue(mockTokenInstance);
    });

    describe('getTokenFromEmail', () => {
        it('should return token for valid credentials', async () => {
            const user = { id: 1, email: 'test@example.com', roles: ['user'], is_deleted: 0, is_disabled: 0 };
            const auth = { verifyPassword: vi.fn().mockResolvedValue(true) };
            const token = { token: 'jwt-token' };

            mockUserQuery.first.mockResolvedValue(user);
            mockAuthQuery.first.mockResolvedValue(auth);
            mockTokenInstance.create.mockResolvedValue(token);

            const result = await internalToken.getTokenFromEmail({
                identity: 'test@example.com',
                secret: 'password'
            });

            expect(result.token).toBe('jwt-token');
            expect(result.user.email).toBe('test@example.com');
        });

        it('should throw AuthError for invalid user', async () => {
            mockUserQuery.first.mockResolvedValue(null);

            await expect(internalToken.getTokenFromEmail({
                identity: 'test@example.com',
                secret: 'password'
            })).rejects.toThrow(errs.AuthError);
        });

        it('should throw AuthError for invalid password', async () => {
            const user = { id: 1, email: 'test@example.com', roles: ['user'] };
            const auth = { verifyPassword: vi.fn().mockResolvedValue(false) };

            mockUserQuery.first.mockResolvedValue(user);
            mockAuthQuery.first.mockResolvedValue(auth);

            await expect(internalToken.getTokenFromEmail({
                identity: 'test@example.com',
                secret: 'password'
            })).rejects.toThrow(errs.AuthError);
        });
    });

    describe('getTokenFromUser', () => {
        it('should return token for user object', async () => {
            const user = { id: 1, email: 'test@example.com' };
            const token = { token: 'jwt-token' };
            mockTokenInstance.create.mockResolvedValue(token);

            const result = await internalToken.getTokenFromUser(user);

            expect(result.token).toBe('jwt-token');
            expect(result.user).toEqual(user);
        });
    });
});
