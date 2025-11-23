import nock from 'nock';
import { jest } from '@jest/globals';
import type { IAIRequestContext } from '../types';

// Define mock return types based on the AI SDK
type MockGenerateTextResult = {
	text: string;
	usage?: {
		prompt_tokens?: number;
		completion_tokens?: number;
		total_tokens?: number;
	};
	toolCalls?: Array<{
		toolCallId: string;
		toolName: string;
		args: Record<string, unknown>;
	}>;
};

type MockStreamTextResult = {
	textStream: AsyncGenerator<string>;
	response: Promise<{
		usage?: {
			prompt_tokens?: number;
			completion_tokens?: number;
			total_tokens?: number;
		};
	}>;
};

// Create mock functions BEFORE mocking the module
const mockStreamText = jest.fn<() => MockStreamTextResult>();
const mockGenerateText = jest.fn<() => Promise<MockGenerateTextResult>>();
const mockCreateOpenAI = jest.fn(() => jest.fn());

// Mock the ai module with our mock functions
jest.unstable_mockModule('ai', () => ({
	streamText: mockStreamText,
	generateText: mockGenerateText,
	createOpenAI: mockCreateOpenAI
}));

// Now import after mocking
const { OpenAIAdapter } = await import('./openai-adapter.js');

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
		// Reset mocks
		jest.clearAllMocks();
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

			// Mock generateText response
			mockGenerateText.mockResolvedValue({
				text: 'Hello! How can I help you today?',
				usage: {
					prompt_tokens: 10,
					completion_tokens: 20,
					total_tokens: 30
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

			// Mock streamText response
			async function* mockTextStream(): AsyncGenerator<string> {
				yield 'Hello';
				yield '!';
			}

			mockStreamText.mockReturnValue({
				textStream: mockTextStream(),
				response: Promise.resolve({
					usage: {
						prompt_tokens: 10,
						completion_tokens: 20,
						total_tokens: 30
					}
				})
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

			// Mock generateText with tool calls
			mockGenerateText.mockResolvedValue({
				text: '',
				toolCalls: [
					{
						toolCallId: 'call_123',
						toolName: 'get_weather',
						args: { location: 'San Francisco' }
					}
				],
				usage: {
					prompt_tokens: 10,
					completion_tokens: 20,
					total_tokens: 30
				}
			});

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

			// Mock generateText to reject with error
			mockGenerateText.mockRejectedValue(
				new Error('Invalid API key')
			);

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

			// Mock generateText to simulate abort
			mockGenerateText.mockImplementation(() => {
				return new Promise((_, reject) => {
					setTimeout(() => {
						const error = new Error('Aborted');
						error.name = 'AbortError';
						reject(error);
					}, 200);
				});
			});

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
