import type { Request, Response, NextFunction } from 'express';
import { authMiddleware } from './auth';
import type { AppConfig, AuthenticatedRequest } from '../types';

describe('authMiddleware', () => {
	const mockConfig: AppConfig = {
		port: 8082,
		debug: false,
		requestTimeout: 120000,
		maxRetries: 3,
		requireReferer: false,
		providers: {}
	};

	let mockReq: Partial<Request>;
	let mockRes: Partial<Response>;
	let mockNext: NextFunction;

	beforeEach(() => {
		mockReq = {
			headers: {},
			ip: '127.0.0.1'
		};

		const jsonMock = jest.fn();
		mockRes = {
			status: jest.fn().mockReturnThis(),
			json: jsonMock
		};

		mockNext = jest.fn();
	});

	describe('API key validation', () => {
		it('should accept valid API key in Authorization header', async () => {
			mockReq.headers = {
				authorization: 'Bearer ABCDEF0123456789-ABCDEF012345'
			};

			const middleware = authMiddleware(mockConfig);
			await middleware(
				mockReq as Request,
				mockRes as Response,
				mockNext
			);

			expect(mockNext).toHaveBeenCalled();
			expect((mockReq as AuthenticatedRequest).apiKey).toBe(
				'ABCDEF0123456789-ABCDEF012345'
			);
		});

		it('should accept valid API key in x-api-key header', async () => {
			mockReq.headers = {
				'x-api-key': 'ABCDEF0123456789-ABCDEF012345'
			};

			const middleware = authMiddleware(mockConfig);
			await middleware(
				mockReq as Request,
				mockRes as Response,
				mockNext
			);

			expect(mockNext).toHaveBeenCalled();
			expect((mockReq as AuthenticatedRequest).apiKey).toBe(
				'ABCDEF0123456789-ABCDEF012345'
			);
		});

		it('should reject request without API key', async () => {
			const middleware = authMiddleware(mockConfig);
			await middleware(
				mockReq as Request,
				mockRes as Response,
				mockNext
			);

			expect(mockRes.status).toHaveBeenCalledWith(401);
			expect(mockRes.json).toHaveBeenCalledWith({
				error: 'API key is required'
			});
			expect(mockNext).not.toHaveBeenCalled();
		});

		it('should reject API key with invalid format', async () => {
			mockReq.headers = {
				authorization: 'Bearer invalid-key'
			};

			const middleware = authMiddleware(mockConfig);
			await middleware(
				mockReq as Request,
				mockRes as Response,
				mockNext
			);

			expect(mockRes.status).toHaveBeenCalledWith(401);
			expect(mockRes.json).toHaveBeenCalledWith({
				error: 'Invalid API key format'
			});
			expect(mockNext).not.toHaveBeenCalled();
		});

		it('should accept API key with custom pattern', async () => {
			const customConfig = {
				...mockConfig,
				apiKeyPattern: /^test-key-\d+$/
			};

			mockReq.headers = {
				authorization: 'Bearer test-key-12345'
			};

			const middleware = authMiddleware(customConfig);
			await middleware(
				mockReq as Request,
				mockRes as Response,
				mockNext
			);

			expect(mockNext).toHaveBeenCalled();
			expect((mockReq as AuthenticatedRequest).apiKey).toBe('test-key-12345');
		});
	});

	describe('Referer validation', () => {
		it('should reject request without referer when required', async () => {
			const configWithReferer = {
				...mockConfig,
				requireReferer: true
			};

			mockReq.headers = {
				authorization: 'Bearer ABCDEF0123456789-ABCDEF012345'
			};

			const middleware = authMiddleware(configWithReferer);
			await middleware(
				mockReq as Request,
				mockRes as Response,
				mockNext
			);

			expect(mockRes.status).toHaveBeenCalledWith(403);
			expect(mockRes.json).toHaveBeenCalledWith({
				error: 'Referer header is required'
			});
			expect(mockNext).not.toHaveBeenCalled();
		});

		it('should accept valid referer', async () => {
			const configWithReferer = {
				...mockConfig,
				requireReferer: true,
				allowedReferers: [/^https:\/\/example\.com/]
			};

			mockReq.headers = {
				authorization: 'Bearer ABCDEF0123456789-ABCDEF012345',
				referer: 'https://example.com/page'
			};

			const middleware = authMiddleware(configWithReferer);
			await middleware(
				mockReq as Request,
				mockRes as Response,
				mockNext
			);

			expect(mockNext).toHaveBeenCalled();
		});

		it('should reject referer not in allowed list', async () => {
			const configWithReferer = {
				...mockConfig,
				requireReferer: true,
				allowedReferers: [/^https:\/\/example\.com/]
			};

			mockReq.headers = {
				authorization: 'Bearer ABCDEF0123456789-ABCDEF012345',
				referer: 'https://evil.com/page'
			};

			const middleware = authMiddleware(configWithReferer);
			await middleware(
				mockReq as Request,
				mockRes as Response,
				mockNext
			);

			expect(mockRes.status).toHaveBeenCalledWith(403);
			expect(mockRes.json).toHaveBeenCalledWith({
				error: 'Referer not allowed'
			});
			expect(mockNext).not.toHaveBeenCalled();
		});

		it('should accept origin header as referer', async () => {
			const configWithReferer = {
				...mockConfig,
				requireReferer: true,
				allowedReferers: [/^https:\/\/example\.com/]
			};

			mockReq.headers = {
				authorization: 'Bearer ABCDEF0123456789-ABCDEF012345',
				origin: 'https://example.com'
			};

			const middleware = authMiddleware(configWithReferer);
			await middleware(
				mockReq as Request,
				mockRes as Response,
				mockNext
			);

			expect(mockNext).toHaveBeenCalled();
		});
	});

	describe('Custom authentication callback', () => {
		it('should call custom auth callback and accept valid user', async () => {
			const mockAuthCallback = jest
				.fn()
				.mockResolvedValue('user-123');

			const configWithAuth = {
				...mockConfig,
				checkAuthentication: mockAuthCallback
			};

			mockReq.headers = {
				authorization: 'Bearer ABCDEF0123456789-ABCDEF012345'
			};

			const middleware = authMiddleware(configWithAuth);
			await middleware(
				mockReq as Request,
				mockRes as Response,
				mockNext
			);

			expect(mockAuthCallback).toHaveBeenCalledWith(
				'ABCDEF0123456789-ABCDEF012345',
				undefined,
				mockReq
			);
			expect(mockNext).toHaveBeenCalled();
			expect((mockReq as AuthenticatedRequest).userId).toBe('user-123');
		});

		it('should reject when custom auth callback returns null', async () => {
			const mockAuthCallback = jest.fn().mockResolvedValue(null);

			const configWithAuth = {
				...mockConfig,
				checkAuthentication: mockAuthCallback
			};

			mockReq.headers = {
				authorization: 'Bearer ABCDEF0123456789-ABCDEF012345'
			};

			const middleware = authMiddleware(configWithAuth);
			await middleware(
				mockReq as Request,
				mockRes as Response,
				mockNext
			);

			expect(mockRes.status).toHaveBeenCalledWith(401);
			expect(mockRes.json).toHaveBeenCalledWith({
				error: 'Authentication failed'
			});
			expect(mockNext).not.toHaveBeenCalled();
		});

		it('should handle errors from custom auth callback', async () => {
			const mockAuthCallback = jest
				.fn()
				.mockRejectedValue(new Error('Database error'));

			const configWithAuth = {
				...mockConfig,
				checkAuthentication: mockAuthCallback
			};

			mockReq.headers = {
				authorization: 'Bearer ABCDEF0123456789-ABCDEF012345'
			};

			const middleware = authMiddleware(configWithAuth);
			await middleware(
				mockReq as Request,
				mockRes as Response,
				mockNext
			);

			expect(mockRes.status).toHaveBeenCalledWith(500);
			expect(mockNext).not.toHaveBeenCalled();
		});
	});
});
