import { RedisRateLimiter } from './redis-rate-limiter';
import type { RedisRateLimiterConfig } from './types';

// Use Redis URL from environment (set by global-setup.ts)
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

describe('RedisRateLimiter', () => {
	let rateLimiter: RedisRateLimiter;

	const defaultConfig: RedisRateLimiterConfig = {
		maxRequests: 5,
		windowMs: 1000,
		keyPrefix: 'test:',
		redisUrl: REDIS_URL
	};

	beforeAll(async () => {
		// Test Redis connection
		const testLimiter = new RedisRateLimiter(defaultConfig);
		try {
			const isHealthy = await testLimiter.healthCheck();
			if (!isHealthy) {
				console.warn('Redis is not available, skipping Redis tests');
				throw new Error('Redis not available');
			}
		} finally {
			// Only close if connection was successful
			try {
				await testLimiter.close();
			} catch {
				// Ignore close errors
			}
		}
	});

	afterEach(async () => {
		if (rateLimiter) {
			try {
				// Clean up test keys only if connection is active
				const client = rateLimiter.getClient();
				if (client.status === 'ready') {
					const keys = await client.keys('test:*');
					if (keys.length > 0) {
						await client.del(...keys);
					}
				}
			} catch {
				// Ignore cleanup errors (e.g., connection already closed)
			}

			// Always try to close
			try {
				await rateLimiter.close();
			} catch {
				// Ignore close errors
			}
		}
	});

	describe('Basic functionality', () => {
		beforeEach(() => {
			rateLimiter = new RedisRateLimiter(defaultConfig);
		});

		it('should allow requests within limit', async () => {
			const key = 'user1';

			for (let i = 1; i <= 5; i++) {
				const result = await rateLimiter.consume(key);
				expect(result.allowed).toBe(true);
				expect(result.current).toBe(i);
				expect(result.remaining).toBe(5 - i);
			}
		});

		it('should block requests exceeding limit', async () => {
			const key = 'user2';

			// Consume all allowed requests
			for (let i = 0; i < 5; i++) {
				await rateLimiter.consume(key);
			}

			// Next request should be blocked
			const result = await rateLimiter.consume(key);
			expect(result.allowed).toBe(false);
			expect(result.current).toBe(6);
			expect(result.remaining).toBe(0);
		});

		it('should reset after window expires', async () => {
			const key = 'user3';

			// Consume all requests
			for (let i = 0; i < 5; i++) {
				await rateLimiter.consume(key);
			}

			// Wait for window to expire
			await new Promise((resolve) => setTimeout(resolve, 1100));

			// Should allow new requests
			const result = await rateLimiter.consume(key);
			expect(result.allowed).toBe(true);
			expect(result.current).toBe(1);
			expect(result.remaining).toBe(4);
		}, 10000);

		it('should track different keys independently', async () => {
			const result1 = await rateLimiter.consume('user1');
			const result2 = await rateLimiter.consume('user2');

			expect(result1.current).toBe(1);
			expect(result2.current).toBe(1);
		});

		it('should return correct reset time', async () => {
			const key = 'user4';
			const result = await rateLimiter.consume(key);

			expect(result.resetTime).toBeGreaterThan(0);
			expect(result.resetTime).toBeLessThanOrEqual(
				defaultConfig.windowMs
			);
		});
	});

	describe('getState', () => {
		beforeEach(() => {
			rateLimiter = new RedisRateLimiter(defaultConfig);
		});

		it('should return current state without consuming', async () => {
			const key = 'user5';

			await rateLimiter.consume(key);
			await rateLimiter.consume(key);

			const state = await rateLimiter.getState(key);
			expect(state.current).toBe(2);
			expect(state.remaining).toBe(3);
			expect(state.allowed).toBe(true);

			// Verify it didn't consume
			const nextState = await rateLimiter.getState(key);
			expect(nextState.current).toBe(2);
		});

		it('should return default state for non-existent key', async () => {
			const state = await rateLimiter.getState('nonexistent');
			expect(state.current).toBe(0);
			expect(state.remaining).toBe(5);
			expect(state.allowed).toBe(true);
		});

		it('should indicate when limit is exceeded', async () => {
			const key = 'user6';

			// Consume all requests
			for (let i = 0; i < 5; i++) {
				await rateLimiter.consume(key);
			}

			const state = await rateLimiter.getState(key);
			expect(state.current).toBe(5);
			expect(state.remaining).toBe(0);
			expect(state.allowed).toBe(false);
		});
	});

	describe('reset', () => {
		beforeEach(() => {
			rateLimiter = new RedisRateLimiter(defaultConfig);
		});

		it('should reset rate limit for specific key', async () => {
			const key = 'user7';

			// Consume some requests
			await rateLimiter.consume(key);
			await rateLimiter.consume(key);
			await rateLimiter.consume(key);

			// Reset
			await rateLimiter.reset(key);

			// Should start from 0
			const result = await rateLimiter.consume(key);
			expect(result.current).toBe(1);
			expect(result.remaining).toBe(4);
		});

		it('should not affect other keys', async () => {
			await rateLimiter.consume('user1');
			await rateLimiter.consume('user1');
			await rateLimiter.consume('user2');

			await rateLimiter.reset('user1');

			const state1 = await rateLimiter.getState('user1');
			const state2 = await rateLimiter.getState('user2');

			expect(state1.current).toBe(0);
			expect(state2.current).toBe(1);
		});
	});

	describe('skip function', () => {
		it('should skip rate limiting when skip returns true', async () => {
			const config: RedisRateLimiterConfig = {
				...defaultConfig,
				skip: (key) => key.startsWith('admin:')
			};

			rateLimiter = new RedisRateLimiter(config);

			// Make many requests with admin key
			for (let i = 0; i < 10; i++) {
				const result = await rateLimiter.consume('admin:user1');
				expect(result.allowed).toBe(true);
				expect(result.current).toBe(0);
			}
		});

		it('should apply rate limiting when skip returns false', async () => {
			const config: RedisRateLimiterConfig = {
				...defaultConfig,
				skip: (key) => key.startsWith('admin:')
			};

			rateLimiter = new RedisRateLimiter(config);

			// Regular user should be limited
			for (let i = 0; i < 5; i++) {
				await rateLimiter.consume('user:regular');
			}

			const result = await rateLimiter.consume('user:regular');
			expect(result.allowed).toBe(false);
		});
	});

	describe('distributed consistency', () => {
		it('should work across multiple instances', async () => {
			const key = 'distributed-user';

			// Create two instances
			const limiter1 = new RedisRateLimiter(defaultConfig);
			const limiter2 = new RedisRateLimiter(defaultConfig);

			try {
				// Consume from both instances
				await limiter1.consume(key);
				await limiter1.consume(key);
				await limiter2.consume(key);
				await limiter2.consume(key);
				await limiter1.consume(key);

				// Should have consumed 5 requests total
				const state = await limiter1.getState(key);
				expect(state.current).toBe(5);

				// Next request from either should be blocked
				const result = await limiter2.consume(key);
				expect(result.allowed).toBe(false);

				// Cleanup test keys
				const client = limiter1.getClient();
				if (client.status === 'ready') {
					const keys = await client.keys('test:*');
					if (keys.length > 0) {
						await client.del(...keys);
					}
				}
			} finally {
				await limiter1.close();
				await limiter2.close();
			}
		});
	});

	describe('healthCheck', () => {
		beforeEach(() => {
			rateLimiter = new RedisRateLimiter(defaultConfig);
		});

		it('should return true when Redis is healthy', async () => {
			const isHealthy = await rateLimiter.healthCheck();
			expect(isHealthy).toBe(true);
		});

		it('should return false when Redis is down', async () => {
			// Close the connection
			await rateLimiter.close();

			const isHealthy = await rateLimiter.healthCheck();
			expect(isHealthy).toBe(false);
		}, 10000); // Increase timeout for this test
	});

	describe('error handling', () => {
		it('should fail open when Redis is unavailable', async () => {
			// Create limiter with invalid URL
			const badLimiter = new RedisRateLimiter({
				...defaultConfig,
				redisUrl: 'redis://127.0.0.1:9999' // Use invalid port instead of host to fail faster
			});

			try {
				// Should still allow requests (fail open)
				const result = await badLimiter.consume('test');
				expect(result.allowed).toBe(true);
			} finally {
				try {
					await badLimiter.close();
				} catch {
					// Ignore close errors for invalid connection
				}
			}
		});
	});

	describe('key prefixing', () => {
		it('should use custom prefix', async () => {
			const config: RedisRateLimiterConfig = {
				...defaultConfig,
				keyPrefix: 'custom:'
			};

			rateLimiter = new RedisRateLimiter(config);

			await rateLimiter.consume('test');

			// Check that key exists with correct prefix
			const client = rateLimiter.getClient();
			const keys = await client.keys('custom:*');
			expect(keys.length).toBeGreaterThan(0);
			expect(keys[0]).toContain('custom:test');
		});
	});

	describe('concurrent requests', () => {
		beforeEach(() => {
			rateLimiter = new RedisRateLimiter(defaultConfig);
		});

		it('should handle concurrent requests correctly', async () => {
			const key = 'concurrent';
			const promises = Array.from({ length: 10 }, () =>
				rateLimiter.consume(key)
			);

			const results = await Promise.all(promises);

			// Count allowed and blocked requests
			const allowed = results.filter((r) => r.allowed).length;
			const blocked = results.filter((r) => !r.allowed).length;

			expect(allowed).toBe(5);
			expect(blocked).toBe(5);
		});
	});

	describe('Redis connection options', () => {
		it('should accept custom Redis options', async () => {
			const config: RedisRateLimiterConfig = {
				...defaultConfig,
				redisOptions: {
					connectTimeout: 5000,
					maxRetriesPerRequest: 2
				}
			};

			rateLimiter = new RedisRateLimiter(config);
			const isHealthy = await rateLimiter.healthCheck();
			expect(isHealthy).toBe(true);
		});
	});
});
