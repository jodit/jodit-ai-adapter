import request from 'supertest';
import nock from 'nock';
import { authHeader, createTestApp } from '../../routes/__tests__/setup';
import { DeepSeekAdapter } from './deepseek-adapter';

describe('DeepSeek', () => {
	const provider = { type: 'deepseek' as const, apiKey: 'deepseek-test-key' };
	const { app, cleanup } = createTestApp({
		providers: { deepseek: provider }
	});

	afterEach(() => {
		nock.cleanAll();
	});
	afterAll(async () => {
		await cleanup();
		nock.restore();
	});

	it('returns autocomplete suggestions through the DeepSeek chat API', async () => {
		const scope = nock('https://api.deepseek.com')
			.matchHeader('authorization', 'Bearer deepseek-test-key')
			.post(
				'/chat/completions',
				(body) =>
					body.model === 'deepseek-flash' &&
					body.response_format.type === 'json_object' &&
					body.thinking.type === 'disabled' &&
					body.messages[0].content.includes('"suggestions"')
			)
			.reply(200, {
				id: 'ds-1',
				model: 'deepseek-flash',
				created: 1,
				choices: [
					{
						index: 0,
						finish_reason: 'stop',
						message: {
							role: 'assistant',
							content: '{"suggestions":["name is","friend"]}'
						}
					}
				],
				usage: {
					prompt_tokens: 10,
					completion_tokens: 3,
					total_tokens: 13
				}
			});
		const res = await request(app)
			.post('/ai/autocomplete?query=Hi')
			.set(authHeader())
			.send({ provider: 'deepseek', context: { maxSuggestions: 1 } });
		expect(res.status).toBe(200);
		expect(res.body.result.suggestions).toEqual(['name is']);
		scope.done();
	});

	it('counts cached and uncached tokens at the configured Flash rate', () => {
		const cost = new DeepSeekAdapter(provider).calculateCredits(
			'deepseek-flash',
			{
				inputTokens: 2_000_000,
				cachedInputTokens: 1_000_000,
				outputTokens: 1_000_000
			}
		);
		expect(cost.usdCost).toBeCloseTo(0.753);
		expect(cost.credits).toBe(753);
	});
});
