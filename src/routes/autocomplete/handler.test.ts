import request from 'supertest';
import nock from 'nock';
import { jest } from '@jest/globals';
import {
	createTestApp,
	authHeader,
	mockFixture,
	OPENAI_BASE
} from '../__tests__/setup.js';
import type { UsageStats } from '../../types/index.js';

describe('POST /ai/autocomplete', () => {
	let result: ReturnType<typeof createTestApp>;
	beforeAll(() => {
		result = createTestApp();
	});

	afterAll(async () => {
		await result.cleanup();
	});

	afterEach(() => {
		nock.cleanAll();
	});

	afterAll(() => {
		nock.restore();
	});

	it('should return 401 without API key', async () => {
		const res = await request(result.app)
			.post('/ai/autocomplete?query=Hello')
			.send({ provider: 'openai' });

		expect(res.status).toBe(401);
	});

	it('should return 400 without query parameter', async () => {
		const res = await request(result.app)
			.post('/ai/autocomplete')
			.set(authHeader())
			.send({ provider: 'openai' });

		expect(res.status).toBe(400);
	});

	it('should return 400 with empty query parameter', async () => {
		const res = await request(result.app)
			.post('/ai/autocomplete?query=')
			.set(authHeader())
			.send({ provider: 'openai' });

		expect(res.status).toBe(400);
	});

	it('should return 400 for invalid body (missing provider)', async () => {
		const res = await request(result.app)
			.post('/ai/autocomplete?query=Hello')
			.set(authHeader())
			.send({});

		expect(res.status).toBe(400);
	});

	it('should return 400 for unsupported provider', async () => {
		const res = await request(result.app)
			.post('/ai/autocomplete?query=Hello')
			.set(authHeader())
			.send({ provider: 'nonexistent' });

		expect(res.status).toBe(400);
	});

	it('should return autocomplete suggestions from OpenAI', async () => {
		const { fixture } = mockFixture('openai', 'autocomplete');

		const res = await request(result.app)
			.post('/ai/autocomplete?query=How+to+make+a')
			.set(authHeader())
			.send({ provider: 'openai' });

		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);
		expect(res.body.result.responseId).toBe(fixture.response.body.id);
		expect(res.body.result.suggestions).toBeInstanceOf(Array);
		expect(res.body.result.suggestions.length).toBeGreaterThan(0);
		expect(res.body.result.suggestions).toContain('cake with chocolate frosting');
		expect(res.body.result.metadata).toBeDefined();
		expect(res.body.result.metadata.model).toBe('gpt-4.1-nano');
	});

	it('should pass custom instructions and model', async () => {
		mockFixture('openai', 'autocomplete');

		const res = await request(result.app)
			.post('/ai/autocomplete?query=How+to+make+a')
			.set(authHeader())
			.send({
				provider: 'openai',
				context: {
					instructions: 'You are a cooking assistant.',
					conversationOptions: {
						model: 'gpt-4.1-nano',
						temperature: 0.5
					},
					maxSuggestions: 3
				}
			});

		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);
		expect(res.body.result.suggestions).toBeInstanceOf(Array);
		// maxSuggestions=3 should limit results
		expect(res.body.result.suggestions.length).toBeLessThanOrEqual(3);
	});

	it('should handle OpenAI API errors', async () => {
		nock(OPENAI_BASE)
			.post('/v1/responses')
			.reply(401, {
				error: {
					message: 'Incorrect API key provided',
					type: 'invalid_request_error',
					param: null,
					code: 'invalid_api_key'
				}
			});

		const res = await request(result.app)
			.post('/ai/autocomplete?query=Hello')
			.set(authHeader())
			.send({ provider: 'openai' });

		expect(res.status).toBe(500);
		expect(res.body.success).toBe(false);
	});

	describe('onUsage callback', () => {
		let onUsage: ReturnType<typeof jest.fn>;
		let appWithUsage: ReturnType<typeof createTestApp>;

		beforeAll(() => {
			onUsage = jest.fn();
			appWithUsage = createTestApp({ onUsage: onUsage as never });
		});

		afterAll(async () => {
			await appWithUsage.cleanup();
		});

		beforeEach(() => {
			onUsage.mockClear();
		});

		it('should call onUsage after autocomplete request', async () => {
			mockFixture('openai', 'autocomplete');

			const res = await request(appWithUsage.app)
				.post('/ai/autocomplete?query=How+to+make+a')
				.set(authHeader())
				.send({ provider: 'openai' });

			expect(res.status).toBe(200);
			expect(onUsage).toHaveBeenCalledTimes(1);

			const stats: UsageStats = onUsage.mock.calls[0][0] as UsageStats;
			expect(stats).toEqual(
				expect.objectContaining({
					userId: 'anonymous',
					apiKey: '12345678-1234-1234-1234-123456789abc',
					provider: 'openai',
					model: 'gpt-4.1-nano',
					responseId: expect.any(String),
					promptTokens: 60,
					completionTokens: 30,
					totalTokens: 90,
					timestamp: expect.any(Number),
					duration: expect.any(Number)
				})
			);
		});

		it('should not fail request when onUsage throws', async () => {
			onUsage.mockRejectedValue(new Error('DB write failed'));
			mockFixture('openai', 'autocomplete');

			const res = await request(appWithUsage.app)
				.post('/ai/autocomplete?query=How+to+make+a')
				.set(authHeader())
				.send({ provider: 'openai' });

			expect(res.status).toBe(200);
			expect(res.body.success).toBe(true);
			expect(onUsage).toHaveBeenCalledTimes(1);
		});
	});
});
