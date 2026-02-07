import nock from 'nock';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OpenAIAdapter } from './openai-adapter.js';
import type { IAIRequestContext } from '../types/index.js';
import type { JSONSchema7TypeName } from 'json-schema';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadFixture(name: string) {
	const filePath = path.join(__dirname, '__fixtures__', 'openai', `${name}.json`);
	return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

const OPENAI_BASE = 'https://api.openai.com';

describe('OpenAIAdapter', () => {
	const mockApiKey = 'test-api-key-1234567890';

	beforeEach(() => {
		nock.cleanAll();
	});

	afterAll(() => {
		nock.cleanAll();
		nock.restore();
	});

	describe('constructor', () => {
		it('should create adapter with valid config', () => {
			const adapter = new OpenAIAdapter({ apiKey: mockApiKey });
			expect(adapter).toBeInstanceOf(OpenAIAdapter);
		});

		it('should throw error if API key is missing', () => {
			expect(() => new OpenAIAdapter({ apiKey: '' })).toThrow(
				'API key is required'
			);
		});
	});

	describe('handleRequest', () => {
		it('should handle non-streaming text generation', async () => {
			const fixture = loadFixture('text-generation');

			nock(OPENAI_BASE)
				.post('/v1/responses')
				.reply(fixture.response.status, fixture.response.body);

			const adapter = new OpenAIAdapter({
				apiKey: mockApiKey,
				defaultModel: 'gpt-4.1-nano'
			});

			const context: IAIRequestContext = {
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
				instructions: 'You are a test assistant. Reply very briefly.'
			};

			const result = await adapter.handleRequest(
				context,
				new AbortController().signal
			);

			expect(result.mode).toBe('final');
			if (result.mode === 'final') {
				expect(result.response.responseId).toBe(
					fixture.response.body.id
				);
				expect(result.response.content).toBe('Hello, test!');
				expect(result.response.finished).toBe(true);
				expect(result.response.metadata?.usage).toBeDefined();
			}
		});

		it('should handle tool calls in response', async () => {
			const fixture = loadFixture('text-with-tools');

			nock(OPENAI_BASE)
				.post('/v1/responses')
				.reply(fixture.response.status, fixture.response.body);

			const adapter = new OpenAIAdapter({
				apiKey: mockApiKey,
				defaultModel: 'gpt-4.1-nano'
			});

			const context: IAIRequestContext = {
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
								type: 'string' as JSONSchema7TypeName,
								description: 'The city name',
								required: true
							}
						]
					}
				],
				instructions:
					'You must use the get_weather tool to answer weather questions.'
			};

			const result = await adapter.handleRequest(
				context,
				new AbortController().signal
			);

			expect(result.mode).toBe('final');
			if (result.mode === 'final') {
				expect(result.response.toolCalls).toBeDefined();
				expect(result.response.toolCalls).toHaveLength(1);
				expect(result.response.toolCalls?.[0].name).toBe(
					'get_weather'
				);
				expect(result.response.toolCalls?.[0].arguments).toEqual({
					location: 'London'
				});
				expect(result.response.content).toBe('');
			}
		});

		it('should handle API errors gracefully', async () => {
			nock(OPENAI_BASE).post('/v1/responses').reply(401, {
				error: {
					message: 'Incorrect API key provided: sk-inval...sting.',
					type: 'invalid_request_error',
					param: null,
					code: 'invalid_api_key'
				}
			});

			const adapter = new OpenAIAdapter({
				apiKey: 'sk-invalid-key'
			});

			const context: IAIRequestContext = {
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
			};

			// BaseAdapter.handleRequest catches errors and returns error response
			const result = await adapter.handleRequest(
				context,
				new AbortController().signal
			);

			expect(result.mode).toBe('final');
			if (result.mode === 'final') {
				expect(result.response.content).toContain('Error');
				expect(result.response.metadata?.error).toBe(true);
			}
		});

		it('should handle abort signal', async () => {
			// Delay response so abort fires first
			nock(OPENAI_BASE)
				.post('/v1/responses')
				.delay(5000)
				.reply(200, {});

			const adapter = new OpenAIAdapter({
				apiKey: mockApiKey,
				defaultModel: 'gpt-4.1-nano'
			});

			const context: IAIRequestContext = {
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
			};

			const abortController = new AbortController();
			setTimeout(() => abortController.abort(), 50);

			const result = await adapter.handleRequest(
				context,
				abortController.signal
			);

			expect(result.mode).toBe('final');
			if (result.mode === 'final') {
				expect(result.response.metadata?.error).toBe(true);
			}
		});

		it('should use provided model from conversationOptions', async () => {
			const fixture = loadFixture('text-generation');

			const scope = nock(OPENAI_BASE)
				.post('/v1/responses', (body: Record<string, unknown>) => {
					return body.model === 'gpt-4.1-mini';
				})
				.reply(fixture.response.status, fixture.response.body);

			const adapter = new OpenAIAdapter({
				apiKey: mockApiKey,
				defaultModel: 'gpt-4.1-nano'
			});

			const context: IAIRequestContext = {
				mode: 'full',
				messages: [
					{
						id: 'msg-1',
						role: 'user',
						content: 'Hello',
						timestamp: Date.now()
					}
				],
				tools: [],
				conversationOptions: { model: 'gpt-4.1-mini' }
			};

			await adapter.handleRequest(
				context,
				new AbortController().signal
			);

			expect(scope.isDone()).toBe(true);
		});

		it('should pass selection contexts as user messages', async () => {
			const fixture = loadFixture('text-generation');

			const scope = nock(OPENAI_BASE)
				.post('/v1/responses', (body: Record<string, unknown>) => {
					const input = body.input as Array<Record<string, unknown>>;
					// Should have system + user message + selection context message
					return input.length >= 3;
				})
				.reply(fixture.response.status, fixture.response.body);

			const adapter = new OpenAIAdapter({
				apiKey: mockApiKey,
				defaultModel: 'gpt-4.1-nano'
			});

			const context: IAIRequestContext = {
				mode: 'full',
				messages: [
					{
						id: 'msg-1',
						role: 'user',
						content: 'Fix this HTML',
						timestamp: Date.now()
					}
				],
				tools: [],
				instructions: 'You are a helpful assistant.',
				selectionContexts: [
					{ html: '<p>Hello</p>' }
				]
			};

			await adapter.handleRequest(
				context,
				new AbortController().signal
			);

			expect(scope.isDone()).toBe(true);
		});
	});

	describe('handleImageGeneration', () => {
		it('should generate images via Vercel AI SDK', async () => {
			const fixture = loadFixture('image-generation');

			nock(OPENAI_BASE)
				.post('/v1/images/generations')
				.reply(fixture.response.status, fixture.response.body);

			const adapter = new OpenAIAdapter({
				apiKey: mockApiKey,
				defaultModel: 'gpt-4.1-nano'
			});

			const result = await adapter.handleImageGeneration(
				{
					prompt: 'A simple red circle on white background',
					model: 'dall-e-2',
					n: 1,
					size: '256x256'
				},
				new AbortController().signal
			);

			expect(result.images).toHaveLength(1);
			expect(result.images[0].b64_json).toBeDefined();
			expect(result.created).toBeDefined();
			expect(result.metadata?.model).toBe('dall-e-2');
			expect(result.metadata?.prompt).toBe(
				'A simple red circle on white background'
			);
		});

		it('should pass provider options for quality and style', async () => {
			const fixture = loadFixture('image-generation');

			const scope = nock(OPENAI_BASE)
				.post(
					'/v1/images/generations',
					(body: Record<string, unknown>) => {
						return (
							body.quality === 'hd' && body.style === 'vivid'
						);
					}
				)
				.reply(fixture.response.status, fixture.response.body);

			const adapter = new OpenAIAdapter({
				apiKey: mockApiKey
			});

			await adapter.handleImageGeneration(
				{
					prompt: 'A test image',
					model: 'dall-e-3',
					quality: 'hd',
					style: 'vivid'
				},
				new AbortController().signal
			);

			expect(scope.isDone()).toBe(true);
		});

		it('should propagate usage data in metadata', async () => {
			// Image response with usage data
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

			const adapter = new OpenAIAdapter({
				apiKey: mockApiKey
			});

			const result = await adapter.handleImageGeneration(
				{
					prompt: 'A test',
					model: 'dall-e-2',
					size: '256x256'
				},
				new AbortController().signal
			);

			expect(result.metadata?.usage).toBeDefined();
		});

		it('should handle image generation API errors', async () => {
			nock(OPENAI_BASE).post('/v1/images/generations').reply(400, {
				error: {
					message: 'Your request was rejected as a result of our safety system.',
					type: 'invalid_request_error',
					param: null,
					code: 'content_policy_violation'
				}
			});

			const adapter = new OpenAIAdapter({
				apiKey: mockApiKey
			});

			await expect(
				adapter.handleImageGeneration(
					{
						prompt: 'bad prompt',
						model: 'dall-e-2',
						size: '256x256'
					},
					new AbortController().signal
				)
			).rejects.toThrow();
		});
	});
});
