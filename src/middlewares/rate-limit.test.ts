import express, {
	type Express,
	type Request,
	type Response,
	type NextFunction
} from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';
import Boom from '@hapi/boom';
import { MemoryRateLimiter } from '../rate-limiter/memory-rate-limiter';
import { rateLimitMiddleware, createRateLimitMiddleware } from './rate-limit';
import type { IRateLimiter, RateLimitResult } from '../rate-limiter';
import type { AuthenticatedRequest } from '../types';

/**
 * Simple error handler for tests
 */
function errorHandler(
	err: Error | Boom.Boom,
	req: Request,
	res: Response,
	_: NextFunction
): void {
	if (Boom.isBoom(err)) {
		res.status(err.output.statusCode).json({
			success: false,
			error: {
				code: err.output.statusCode,
				message: err.output.payload.message,
				details: err.data
			}
		});
	} else {
		res.status(500).json({
			success: false,
			error: {
				code: 500,
				message: err.message || 'Internal server error'
			}
		});
	}
}

describe('Rate Limit Middleware', () => {
	let app: Express;
	let rateLimiter: IRateLimiter;

	afterEach(async () => {
		if (rateLimiter) {
			await rateLimiter.close();
		}
	});

	describe('rateLimitMiddleware', () => {
		beforeEach(() => {
			app = express();
			app.use(express.json());

			rateLimiter = new MemoryRateLimiter({
				maxRequests: 3,
				windowMs: 1000
			});
		});

		it('should allow requests within limit', async () => {
			app.use(rateLimitMiddleware({ rateLimiter }));
			app.get('/test', (req, res) => res.json({ ok: true }));

			// Make 3 requests (within limit)
			for (let i = 0; i < 3; i++) {
				const response = await request(app).get('/test');
				expect(response.status).toBe(200);
			}
		});

		it('should block requests exceeding limit', async () => {
			app.use(rateLimitMiddleware({ rateLimiter }));
			app.get('/test', (req, res) => res.json({ ok: true }));
			app.use(errorHandler);

			// Make 3 requests (within limit)
			for (let i = 0; i < 3; i++) {
				await request(app).get('/test');
			}

			// 4th request should be blocked
			const response = await request(app).get('/test');
			expect(response.status).toBe(429);
			expect(response.body.error.message).toContain('Too many requests');
		});

		it('should include rate limit headers', async () => {
			app.use(
				rateLimitMiddleware({
					rateLimiter,
					includeHeaders: true
				})
			);
			app.get('/test', (req, res) => res.json({ ok: true }));

			const response = await request(app).get('/test');

			expect(response.headers['x-ratelimit-limit']).toBe('3');
			expect(response.headers['x-ratelimit-remaining']).toBe('2');
			expect(response.headers['x-ratelimit-reset']).toBeDefined();
		});

		it('should include Retry-After header when blocked', async () => {
			app.use(rateLimitMiddleware({ rateLimiter }));
			app.get('/test', (req, res) => res.json({ ok: true }));
			app.use(errorHandler);

			// Exhaust limit
			for (let i = 0; i < 3; i++) {
				await request(app).get('/test');
			}

			// Next request should include Retry-After
			const response = await request(app).get('/test');
			expect(response.status).toBe(429);
			expect(response.headers['retry-after']).toBeDefined();
		});

		it('should use custom key extractor', async () => {
			app.use(
				rateLimitMiddleware({
					rateLimiter,
					keyExtractor: (req) => req.headers['x-user-id'] as string
				})
			);
			app.get('/test', (req, res) => res.json({ ok: true }));
			app.use(errorHandler);

			// Make 3 requests with user1
			for (let i = 0; i < 3; i++) {
				await request(app).get('/test').set('x-user-id', 'user1');
			}

			// user1 should be blocked
			const response1 = await request(app)
				.get('/test')
				.set('x-user-id', 'user1');
			expect(response1.status).toBe(429);

			// user2 should be allowed
			const response2 = await request(app)
				.get('/test')
				.set('x-user-id', 'user2');
			expect(response2.status).toBe(200);
		});

		it('should use userId from authenticated request', async () => {
			// Mock auth middleware
			app.use((req, res, next) => {
				const authReq = req as AuthenticatedRequest;
				authReq.userId = 'auth-user-123';
				next();
			});

			app.use(rateLimitMiddleware({ rateLimiter }));
			app.get('/test', (req, res) => res.json({ ok: true }));
			app.use(errorHandler);

			// Make 3 requests
			for (let i = 0; i < 3; i++) {
				await request(app).get('/test');
			}

			// 4th request should be blocked
			const response = await request(app).get('/test');
			expect(response.status).toBe(429);
		});

		it('should fall back to IP address if no userId', async () => {
			app.use(rateLimitMiddleware({ rateLimiter }));
			app.get('/test', (req, res) => res.json({ ok: true }));
			app.use(errorHandler);

			// All requests from same IP
			for (let i = 0; i < 3; i++) {
				await request(app).get('/test');
			}

			const response = await request(app).get('/test');
			expect(response.status).toBe(429);
		});

		it('should skip rate limiting when skip returns true', async () => {
			app.use(
				rateLimitMiddleware({
					rateLimiter,
					skip: (req) => req.path === '/health'
				})
			);
			app.get('/test', (req, res) => res.json({ ok: true }));
			app.get('/health', (req, res) => res.json({ ok: true }));
			app.use(errorHandler);

			// Make many requests to /health (should not be limited)
			for (let i = 0; i < 10; i++) {
				const response = await request(app).get('/health');
				expect(response.status).toBe(200);
			}

			// /test should still be limited
			for (let i = 0; i < 3; i++) {
				await request(app).get('/test');
			}
			const response = await request(app).get('/test');
			expect(response.status).toBe(429);
		});

		it('should support async skip function', async () => {
			app.use(
				rateLimitMiddleware({
					rateLimiter,
					skip: async (req) => {
						await new Promise((resolve) => setTimeout(resolve, 10));
						return req.headers['x-skip'] === 'true';
					}
				})
			);
			app.get('/test', (req, res) => res.json({ ok: true }));

			// Request with skip header
			const response1 = await request(app)
				.get('/test')
				.set('x-skip', 'true');
			expect(response1.status).toBe(200);

			// Make many requests with skip header
			for (let i = 0; i < 10; i++) {
				const response = await request(app)
					.get('/test')
					.set('x-skip', 'true');
				expect(response.status).toBe(200);
			}
		});

		it('should use custom error message', async () => {
			app.use(
				rateLimitMiddleware({
					rateLimiter,
					message: 'Slow down there, partner!'
				})
			);
			app.get('/test', (req, res) => res.json({ ok: true }));
			app.use(errorHandler);

			// Exhaust limit
			for (let i = 0; i < 3; i++) {
				await request(app).get('/test');
			}

			const response = await request(app).get('/test');
			expect(response.status).toBe(429);
			expect(response.body.error.message).toBe(
				'Slow down there, partner!'
			);
		});

		it('should call onLimitReached callback', async () => {
			const onLimitReached =
				jest.fn<(req: Request, key: string) => void | Promise<void>>();

			app.use(
				rateLimitMiddleware({
					rateLimiter,
					onLimitReached
				})
			);
			app.get('/test', (req, res) => res.json({ ok: true }));

			// Exhaust limit
			for (let i = 0; i < 3; i++) {
				await request(app).get('/test');
			}

			// Trigger limit
			await request(app).get('/test');

			expect(onLimitReached).toHaveBeenCalledTimes(1);
			expect(onLimitReached).toHaveBeenCalledWith(
				expect.any(Object),
				expect.stringMatching(/^ip:/)
			);
		});

		it('should not block on rate limiter errors', async () => {
			// Create a failing rate limiter
			const failingLimiter: IRateLimiter = {
				consume: jest
					.fn<(key: string) => Promise<RateLimitResult>>()
					.mockRejectedValue(new Error('Redis down')),
				reset: jest.fn<(key: string) => Promise<void>>(),
				getState: jest.fn<(key: string) => Promise<RateLimitResult>>(),
				close: jest.fn<() => Promise<void>>()
			};

			app.use(rateLimitMiddleware({ rateLimiter: failingLimiter }));
			app.get('/test', (req, res) => res.json({ ok: true }));

			// Should still allow request
			const response = await request(app).get('/test');
			expect(response.status).toBe(200);
		});
	});

	describe('createRateLimitMiddleware', () => {
		it('should create middleware with rate limiter', () => {
			rateLimiter = new MemoryRateLimiter({
				maxRequests: 5,
				windowMs: 1000
			});

			const middleware = createRateLimitMiddleware(rateLimiter);
			expect(middleware).toBeInstanceOf(Function);
		});

		it('should create no-op middleware when rateLimiter is null', async () => {
			app = express();
			app.use(express.json());

			const middleware = createRateLimitMiddleware(null);
			app.use(middleware);
			app.get('/test', (req, res) => res.json({ ok: true }));

			// Should never be limited
			for (let i = 0; i < 100; i++) {
				const response = await request(app).get('/test');
				expect(response.status).toBe(200);
			}
		});

		it('should accept custom options', async () => {
			app = express();
			app.use(express.json());

			rateLimiter = new MemoryRateLimiter({
				maxRequests: 2,
				windowMs: 1000
			});

			const middleware = createRateLimitMiddleware(rateLimiter, {
				message: 'Custom message',
				includeHeaders: true
			});

			app.use(middleware);
			app.get('/test', (req, res) => res.json({ ok: true }));
			app.use(errorHandler);

			// Exhaust limit
			await request(app).get('/test');
			await request(app).get('/test');

			const response = await request(app).get('/test');
			expect(response.status).toBe(429);
			expect(response.body.error.message).toBe('Custom message');
			expect(response.headers['x-ratelimit-limit']).toBe('2');
		});
	});

	describe('Integration scenarios', () => {
		it('should reset after window expires', async () => {
			app = express();
			app.use(express.json());

			rateLimiter = new MemoryRateLimiter({
				maxRequests: 2,
				windowMs: 500
			});

			app.use(rateLimitMiddleware({ rateLimiter }));
			app.get('/test', (req, res) => res.json({ ok: true }));
			app.use(errorHandler);

			// Exhaust limit
			await request(app).get('/test');
			await request(app).get('/test');

			// Should be blocked
			const response1 = await request(app).get('/test');
			expect(response1.status).toBe(429);

			// Wait for window to expire
			await new Promise((resolve) => setTimeout(resolve, 600));

			// Should be allowed again
			const response2 = await request(app).get('/test');
			expect(response2.status).toBe(200);
		}, 10000);

		it('should handle multiple routes', async () => {
			app = express();
			app.use(express.json());

			rateLimiter = new MemoryRateLimiter({
				maxRequests: 2,
				windowMs: 1000
			});

			app.use(rateLimitMiddleware({ rateLimiter }));
			app.get('/api/users', (req, res) => res.json({ ok: true }));
			app.get('/api/posts', (req, res) => res.json({ ok: true }));
			app.use(errorHandler);

			// Requests to different routes count toward same limit
			await request(app).get('/api/users');
			await request(app).get('/api/posts');

			const response = await request(app).get('/api/users');
			expect(response.status).toBe(429);
		});

		it('should track different IPs separately', async () => {
			app = express();
			app.use(express.json());

			rateLimiter = new MemoryRateLimiter({
				maxRequests: 2,
				windowMs: 1000
			});

			// Use custom key extractor that reads X-Forwarded-For header
			app.use(
				rateLimitMiddleware({
					rateLimiter,
					keyExtractor: (req) => {
						const ip = req.headers['x-forwarded-for'] as string;
						return `ip:${ip || 'unknown'}`;
					}
				})
			);
			app.get('/test', (req, res) => res.json({ ok: true }));
			app.use(errorHandler);

			// IP1 makes 2 requests
			await request(app).get('/test').set('x-forwarded-for', '1.1.1.1');
			await request(app).get('/test').set('x-forwarded-for', '1.1.1.1');

			// IP1 should be blocked
			const response1 = await request(app)
				.get('/test')
				.set('x-forwarded-for', '1.1.1.1');
			expect(response1.status).toBe(429);

			// IP2 should still be allowed
			const response2 = await request(app)
				.get('/test')
				.set('x-forwarded-for', '2.2.2.2');
			expect(response2.status).toBe(200);
		});
	});
});
