import request from 'supertest';
import nock from 'nock';
import {
	createTestApp,
	authHeader,
	mockFixture,
	OPENAI_BASE
} from '../__tests__/setup.js';

describe('POST /ai/request', () => {
	const app = createTestApp();

	afterEach(() => {
		nock.cleanAll();
	});

	it('should return 401 without API key', async () => {
		const res = await request(app)
			.post('/ai/request')
			.send({ provider: 'openai', context: {} });

		expect(res.status).toBe(401);
	});

	it('should return 400 for invalid body', async () => {
		const res = await request(app)
			.post('/ai/request')
			.set(authHeader())
			.send({ provider: '' });

		expect(res.status).toBe(400);
	});

	it('should return 400 for unsupported provider', async () => {
		const res = await request(app)
			.post('/ai/request')
			.set(authHeader())
			.send({
				provider: 'nonexistent',
				context: {
					mode: 'full',
					tools: []
				}
			});

		expect(res.status).toBe(400);
	});

	it('should proxy text generation through OpenAI', async () => {
		const { fixture } = mockFixture('openai', 'text-generation');

		const res = await request(app)
			.post('/ai/request')
			.set(authHeader())
			.send({
				provider: 'openai',
				context: {
					mode: 'full',
					messages: [
						{
							id: 'msg-1',
							role: 'user',
							content: 'Say "Hello, test!" and nothing else.',
							timestamp: Date.now()
						}
					],
					tools: [],
					instructions:
						'You are a test assistant. Reply very briefly.'
				}
			});

		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);
		expect(res.body.result.responseId).toBe(fixture.response.body.id);
		expect(res.body.result.content).toBe('Hello, test!');
		expect(res.body.result.finished).toBe(true);
	});

	it('should return tool calls from OpenAI', async () => {
		mockFixture('openai', 'text-with-tools');

		const res = await request(app)
			.post('/ai/request')
			.set(authHeader())
			.send({
				provider: 'openai',
				context: {
					mode: 'full',
					messages: [
						{
							id: 'msg-1',
							role: 'user',
							content: 'What is the weather in London?',
							timestamp: Date.now()
						}
					],
					tools: [
						{
							name: 'get_weather',
							description:
								'Get the current weather for a location',
							parameters: [
								{
									name: 'location',
									type: 'string',
									description: 'The city name',
									required: true
								}
							]
						}
					],
					instructions:
						'You must use the get_weather tool to answer weather questions.'
				}
			});

		expect(res.status).toBe(200);
		expect(res.body.result.toolCalls).toHaveLength(1);
		expect(res.body.result.toolCalls[0].name).toBe('get_weather');
		expect(res.body.result.toolCalls[0].arguments).toEqual({
			location: 'London'
		});
	});

	it('should handle OpenAI API errors', async () => {
		nock(OPENAI_BASE).post('/v1/responses').reply(401, {
			error: {
				message: 'Incorrect API key provided',
				type: 'invalid_request_error',
				param: null,
				code: 'invalid_api_key'
			}
		});

		const res = await request(app)
			.post('/ai/request')
			.set(authHeader())
			.send({
				provider: 'openai',
				context: {
					mode: 'full',
					messages: [
						{
							id: 'msg-1',
							role: 'user',
							content: 'Hello',
							timestamp: Date.now()
						}
					],
					tools: []
				}
			});

		// BaseAdapter catches the error and returns an error response as 200
		expect(res.status).toBe(200);
		expect(res.body.result.content).toContain('Error');
		expect(res.body.result.metadata?.error).toBe(true);
	});
});
