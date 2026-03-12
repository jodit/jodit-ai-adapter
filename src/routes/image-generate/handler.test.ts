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

describe('POST /ai/image/generate', () => {
	let mainApp: ReturnType<typeof createTestApp>;
	beforeAll(() => {
		mainApp = createTestApp();
	});

	afterAll(async () => {
		await mainApp.cleanup();
	});

	afterEach(() => {
		nock.cleanAll();
	});

	afterAll(() => {
		nock.restore();
	});

	it('should return 401 without API key', async () => {
		const res = await request(mainApp.app)
			.post('/ai/image/generate')
			.send({
				provider: 'openai',
				request: { prompt: 'A red circle' }
			});

		expect(res.status).toBe(401);
	});

	it('should return 400 for invalid body', async () => {
		const res = await request(mainApp.app)
			.post('/ai/image/generate')
			.set(authHeader())
			.send({ provider: '' });

		expect(res.status).toBe(400);
	});

	it('should return 400 for missing prompt', async () => {
		const res = await request(mainApp.app)
			.post('/ai/image/generate')
			.set(authHeader())
			.send({
				provider: 'openai',
				request: {}
			});

		expect(res.status).toBe(400);
	});

	it('should proxy image generation through OpenAI', async () => {
		mockFixture('openai', 'image-generation');

		const res = await request(mainApp.app)
			.post('/ai/image/generate')
			.set(authHeader())
			.send({
				provider: 'openai',
				request: {
					prompt: 'A simple red circle on white background',
					model: 'dall-e-2',
					n: 1,
					size: '256x256'
				}
			});

		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);
		expect(res.body.result.images).toHaveLength(1);
		expect(res.body.result.images[0].b64_json).toBeDefined();
		expect(res.body.result.metadata.prompt).toBe(
			'A simple red circle on white background'
		);
	});

	it('should handle OpenAI API errors', async () => {
		nock(OPENAI_BASE)
			.post('/v1/images/generations')
			.reply(500, {
				error: {
					message: 'Internal server error',
					type: 'server_error',
					param: null,
					code: null
				}
			});

		const res = await request(mainApp.app)
			.post('/ai/image/generate')
			.set(authHeader())
			.send({
				provider: 'openai',
				request: {
					prompt: 'A simple red circle',
					model: 'dall-e-2',
					n: 1,
					size: '256x256'
				}
			});

		expect(res.status).toBe(500);
	});

	it('should return 400 for unsupported provider', async () => {
		const res = await request(mainApp.app)
			.post('/ai/image/generate')
			.set(authHeader())
			.send({
				provider: 'nonexistent',
				request: { prompt: 'A red circle' }
			});

		expect(res.status).toBe(400);
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

		it('should call onUsage with credits after image generation', async () => {
			nock(OPENAI_BASE)
				.post('/v1/images/generations')
				.reply(200, {
					created: 1770449035,
					data: [{ b64_json: 'abc123base64data' }],
					usage: {
						input_tokens: 100,
						output_tokens: 2000,
						total_tokens: 2100
					}
				});

			const res = await request(appWithUsage.app)
				.post('/ai/image/generate')
				.set(authHeader())
				.send({
					provider: 'openai',
					request: {
						prompt: 'A red circle on white background',
						model: 'gpt-image-1',
						n: 1,
						size: '1024x1024'
					}
				});

			expect(res.status).toBe(200);
			expect(res.body.success).toBe(true);
			expect(onUsage).toHaveBeenCalledTimes(1);

			const stats: UsageStats = onUsage.mock.calls[0][0] as UsageStats;
			expect(stats).toEqual(
				expect.objectContaining({
					userId: 'anonymous',
					provider: 'openai',
					model: 'gpt-image-1',
					responseId: expect.stringMatching(/^img-/),
					timestamp: expect.any(Number),
					duration: expect.any(Number)
				})
			);
			expect(stats.metadata).toEqual(
				expect.objectContaining({
					imageCount: 1,
					prompt: 'A red circle on white background'
				})
			);

			// gpt-image-1: input=$5.00/1M, cachedInput=$1.25/1M, output=$10.00/1M
			// 100 input tokens * $5.00/1M + 2000 output tokens * $10.00/1M = $0.0005 + $0.02 = $0.0205
			// credits = ceil($0.0205 * 1000) = 21
			expect(stats.credits).toEqual({
				credits: 21,
				usdCost: expect.closeTo(0.0205, 8),
				inputTokens: 100,
				outputTokens: 2000,
				cachedInputTokens: 0
			});
		});

		it('should not fail when onUsage throws', async () => {
			onUsage.mockRejectedValue(new Error('DB error'));

			nock(OPENAI_BASE)
				.post('/v1/images/generations')
				.reply(200, {
					created: 1770449035,
					data: [{ b64_json: 'abc123' }],
					usage: {
						input_tokens: 10,
						output_tokens: 50,
						total_tokens: 60
					}
				});

			const res = await request(appWithUsage.app)
				.post('/ai/image/generate')
				.set(authHeader())
				.send({
					provider: 'openai',
					request: {
						prompt: 'A test image',
						model: 'gpt-image-1',
						n: 1,
						size: '1024x1024'
					}
				});

			expect(res.status).toBe(200);
			expect(res.body.success).toBe(true);
		});
	});
});
