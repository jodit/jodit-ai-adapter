import { MemoryRateLimiter } from './memory-rate-limiter';
import type { RateLimiterConfig } from './types';
import { jest } from '@jest/globals';

describe('MemoryRateLimiter', () => {
	let rateLimiter: MemoryRateLimiter;

	const defaultConfig: RateLimiterConfig = {
		maxRequests: 5,
		windowMs: 1000,
		keyPrefix: 'test:'
	};

	afterEach(async () => {
		if (rateLimiter) {
			await rateLimiter.close();
		}
	});

	describe('Basic functionality', () => {
		beforeEach(() => {
			rateLimiter = new MemoryRateLimiter(defaultConfig);
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
		});

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
			rateLimiter = new MemoryRateLimiter(defaultConfig);
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
			expect(state.resetTime).toBe(0);
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
			rateLimiter = new MemoryRateLimiter(defaultConfig);
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
			const config: RateLimiterConfig = {
				...defaultConfig,
				skip: (key) => key.startsWith('admin:')
			};

			rateLimiter = new MemoryRateLimiter(config);

			// Make many requests with admin key
			for (let i = 0; i < 10; i++) {
				const result = await rateLimiter.consume('admin:user1');
				expect(result.allowed).toBe(true);
				expect(result.current).toBe(0);
			}
		});

		it('should apply rate limiting when skip returns false', async () => {
			const config: RateLimiterConfig = {
				...defaultConfig,
				skip: (key) => key.startsWith('admin:')
			};

			rateLimiter = new MemoryRateLimiter(config);

			// Regular user should be limited
			for (let i = 0; i < 5; i++) {
				await rateLimiter.consume('user:regular');
			}

			const result = await rateLimiter.consume('user:regular');
			expect(result.allowed).toBe(false);
		});

		it('should support async skip function', async () => {
			const config: RateLimiterConfig = {
				...defaultConfig,
				skip: async (key) => {
					await new Promise((resolve) => setTimeout(resolve, 10));
					return key === 'vip';
				}
			};

			rateLimiter = new MemoryRateLimiter(config);

			const result = await rateLimiter.consume('vip');
			expect(result.allowed).toBe(true);
			expect(result.current).toBe(0);
		});
	});

	describe('cleanup', () => {
		it('should cleanup expired entries', async () => {
			jest.useFakeTimers();

			rateLimiter = new MemoryRateLimiter({
				...defaultConfig,
				windowMs: 100
			});

			// Create some entries
			await rateLimiter.consume('user1');
			await rateLimiter.consume('user2');
			await rateLimiter.consume('user3');

			expect(rateLimiter.getStorageSize()).toBe(3);

			// Wait for entries to expire
			jest.advanceTimersByTime(150);

			// Trigger cleanup by consuming a new key
			await rateLimiter.consume('user4');

			// After cleanup interval runs, old entries should be removed
			jest.advanceTimersByTime(61000);


			// Only user4 should remain (plus any new cleanup markers)
			expect(rateLimiter.getStorageSize()).toBeLessThanOrEqual(1);
			jest.useRealTimers();
		});

		it('should not affect active entries during cleanup', async () => {
			jest.useFakeTimers();
			rateLimiter = new MemoryRateLimiter({
				...defaultConfig,
				windowMs: 5000
			});

			// Create an entry
			await rateLimiter.consume('active');

			// Wait a bit but not enough to expire
			jest.advanceTimersByTime(100);

			// Entry should still be there
			const state = await rateLimiter.getState('active');
			expect(state.current).toBe(1);
			jest.useRealTimers();
		});
	});

	describe('key prefixing', () => {
		it('should use custom prefix', async () => {
			const config: RateLimiterConfig = {
				...defaultConfig,
				keyPrefix: 'custom:'
			};

			rateLimiter = new MemoryRateLimiter(config);

			await rateLimiter.consume('test');

			// Internal storage should use prefixed key
			// This is tested indirectly through isolation
			const state = await rateLimiter.getState('test');
			expect(state.current).toBe(1);
		});

		it('should use default prefix if not provided', async () => {
			const config: RateLimiterConfig = {
				maxRequests: 5,
				windowMs: 1000
			};

			rateLimiter = new MemoryRateLimiter(config);

			await rateLimiter.consume('test');
			const state = await rateLimiter.getState('test');
			expect(state.current).toBe(1);
		});
	});

	describe('edge cases', () => {
		beforeEach(() => {
			rateLimiter = new MemoryRateLimiter(defaultConfig);
		});

		it('should handle concurrent requests', async () => {
			const key = 'concurrent';
			const promises = Array.from({ length: 10 }, () =>
				rateLimiter.consume(key)
			);

			const results = await Promise.all(promises);

			// First 5 should be allowed
			expect(results.slice(0, 5).every((r) => r.allowed)).toBe(true);

			// Rest should be blocked
			expect(results.slice(5).every((r) => !r.allowed)).toBe(true);
		});

		it('should handle empty key', async () => {
			const result = await rateLimiter.consume('');
			expect(result.allowed).toBe(true);
			expect(result.current).toBe(1);
		});

		it('should handle very long key', async () => {
			const longKey = 'a'.repeat(1000);
			const result = await rateLimiter.consume(longKey);
			expect(result.allowed).toBe(true);
		});
	});
});
