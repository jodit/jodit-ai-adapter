import nock from 'nock';
import { OpenAIAdapter } from './openai-adapter';
import type { IAIRequestContext } from '../types';

describe('OpenAIAdapter', () => {
	const mockApiKey = 'test-api-key-1234567890';
	const mockContext: IAIRequestContext = {
		mode: 'full',
		conversationId: 'test-conv-123',
		messages: [
			{
				id: 'msg-1',
				role: 'user',
				content: 'Hello, AI!',
				timestamp: Date.now()
			}
		],
		tools: [],
		conversationOptions: {
			model: 'gpt-4o',
			temperature: 0.7
		},
		instructions: 'You are a helpful assistant.'
	};

	beforeEach(() => {
		// Clean up all nock interceptors before each test
		nock.cleanAll();
	});

	afterAll(() => {
		// Restore HTTP interceptors
		nock.restore();
	});

	describe('constructor', () => {
		it('should create adapter with valid config', () => {
			const adapter = new OpenAIAdapter({
				apiKey: mockApiKey
			});

			expect(adapter).toBeInstanceOf(OpenAIAdapter);
		});

		it('should throw error if API key is missing', () => {
			expect(() => {
				new OpenAIAdapter({
					apiKey: ''
				});
			}).toThrow('API key is required');
		});
	});

	describe('handleRequest', () => {
		it('should handle non-streaming response', async () => {
			const adapter = new OpenAIAdapter({
				apiKey: mockApiKey
			});

			// Mock OpenAI API response
			const mockResponse = {
				id: 'chatcmpl-123',
				object: 'chat.completion',
				created: 1677652288,
				model: 'gpt-4o',
				choices: [
					{
						index: 0,
						message: {
							role: 'assistant',
							content: 'Hello! How can I help you today?'
						},
						finish_reason: 'stop'
					}
				],
				usage: {
					prompt_tokens: 10,
					completion_tokens: 20,
					total_tokens: 30
				}
			};

			nock('https://api.openai.com')
				.post('/v1/chat/completions')
				.reply(200, mockResponse);

			const contextWithNoStream = {
				...mockContext,
				metadata: { stream: false }
			};

			const abortController = new AbortController();
			const result = await adapter.handleRequest(
				contextWithNoStream,
				abortController.signal
			);

			expect(result.mode).toBe('final');
			if (result.mode === 'final') {
				expect(result.response.responseId).toBeDefined();
				expect(result.response.content).toBe(
					'Hello! How can I help you today?'
				);
				expect(result.response.finished).toBe(true);
			}
		});

		it('should handle streaming response', async () => {
			const adapter = new OpenAIAdapter({
				apiKey: mockApiKey
			});

			// Note: Testing streaming is complex with nock
			// This is a simplified test - real implementation would mock SSE stream
			const mockStreamResponse = `data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1677652288,"model":"gpt-4o","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}\n\ndata: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1677652288,"model":"gpt-4o","choices":[{"index":0,"delta":{"content":"!"},"finish_reason":null}]}\n\ndata: [DONE]\n\n`;

			nock('https://api.openai.com')
				.post('/v1/chat/completions')
				.reply(200, mockStreamResponse, {
					'Content-Type': 'text/event-stream'
				});

			const abortController = new AbortController();
			const result = await adapter.handleRequest(
				mockContext,
				abortController.signal
			);

			expect(result.mode).toBe('stream');
			if (result.mode === 'stream') {
				// Collect stream events
				const events = [];
				for await (const event of result.stream) {
					events.push(event);
				}

				expect(events.length).toBeGreaterThan(0);
				expect(events[0].type).toBe('created');
			}
		});

		it('should handle tool calls in response', async () => {
			const adapter = new OpenAIAdapter({
				apiKey: mockApiKey
			});

			const mockResponseWithTools = {
				id: 'chatcmpl-123',
				object: 'chat.completion',
				created: 1677652288,
				model: 'gpt-4o',
				choices: [
					{
						index: 0,
						message: {
							role: 'assistant',
							content: '',
							tool_calls: [
								{
									id: 'call_123',
									type: 'function',
									function: {
										name: 'get_weather',
										arguments: '{"location":"San Francisco"}'
									}
								}
							]
						},
						finish_reason: 'tool_calls'
					}
				],
				usage: {
					prompt_tokens: 10,
					completion_tokens: 20,
					total_tokens: 30
				}
			};

			nock('https://api.openai.com')
				.post('/v1/chat/completions')
				.reply(200, mockResponseWithTools);

			const contextWithTools = {
				...mockContext,
				metadata: { stream: false },
				tools: [
					{
						name: 'get_weather',
						description: 'Get weather for a location',
						parameters: [
							{
								name: 'location',
								type: 'string',
								description: 'The location',
								required: true
							}
						]
					}
				]
			};

			const abortController = new AbortController();
			const result = await adapter.handleRequest(
				contextWithTools,
				abortController.signal
			);

			expect(result.mode).toBe('final');
			if (result.mode === 'final') {
				expect(result.response.toolCalls).toBeDefined();
				expect(result.response.toolCalls).toHaveLength(1);
				expect(result.response.toolCalls?.[0].name).toBe(
					'get_weather'
				);
			}
		});

		it('should handle API errors', async () => {
			const adapter = new OpenAIAdapter({
				apiKey: mockApiKey
			});

			nock('https://api.openai.com')
				.post('/v1/chat/completions')
				.reply(401, {
					error: {
						message: 'Invalid API key',
						type: 'invalid_request_error'
					}
				});

			const contextWithNoStream = {
				...mockContext,
				metadata: { stream: false }
			};

			const abortController = new AbortController();
			const result = await adapter.handleRequest(
				contextWithNoStream,
				abortController.signal
			);

			expect(result.mode).toBe('final');
			if (result.mode === 'final') {
				expect(result.response.content).toContain('Error');
				expect(result.response.metadata?.error).toBe(true);
			}
		});

		it('should handle request cancellation', async () => {
			const adapter = new OpenAIAdapter({
				apiKey: mockApiKey
			});

			nock('https://api.openai.com')
				.post('/v1/chat/completions')
				.delay(1000) // Delay to allow cancellation
				.reply(200, {});

			const contextWithNoStream = {
				...mockContext,
				metadata: { stream: false }
			};

			const abortController = new AbortController();

			// Abort immediately
			setTimeout(() => abortController.abort(), 100);

			const result = await adapter.handleRequest(
				contextWithNoStream,
				abortController.signal
			);

			// Should return error response
			expect(result.mode).toBe('final');
			if (result.mode === 'final') {
				expect(result.response.metadata?.error).toBe(true);
			}
		});
	});
});
