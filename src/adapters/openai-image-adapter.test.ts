import { jest } from '@jest/globals';
import type { IImageGenerationRequest } from '../types';

// Mock fetch globally
const mockFetch = jest.fn<typeof fetch>();
global.fetch = mockFetch;

// Now import after mocking
const { OpenAIImageAdapter } = await import('./openai-image-adapter.js');

describe('OpenAIImageAdapter', () => {
	const mockApiKey = 'test-api-key-1234567890';

	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe('constructor', () => {
		it('should create adapter with valid config', () => {
			const adapter = new OpenAIImageAdapter({
				apiKey: mockApiKey
			});

			expect(adapter).toBeInstanceOf(OpenAIImageAdapter);
		});

		it('should throw error if API key is missing', () => {
			expect(() => {
				new OpenAIImageAdapter({
					apiKey: ''
				});
			}).toThrow('API key is required');
		});
	});

	describe('generateImage', () => {
		it('should generate image with basic request', async () => {
			const adapter = new OpenAIImageAdapter({
				apiKey: mockApiKey
			});

			const mockResponse = {
				created: 1700000000,
				data: [
					{
						url: 'https://example.com/generated-image.png',
						revised_prompt: 'A beautiful sunset over the ocean'
					}
				]
			};

			mockFetch.mockResolvedValue({
				ok: true,
				json: async () => mockResponse
			} as Response);

			const request: IImageGenerationRequest = {
				prompt: 'A beautiful sunset'
			};

			const result = await adapter.generateImage(request);

			expect(result.images).toHaveLength(1);
			expect(result.images[0].url).toBe(
				'https://example.com/generated-image.png'
			);
			expect(result.images[0].revisedPrompt).toBe(
				'A beautiful sunset over the ocean'
			);
			expect(result.created).toBe(1700000000);
			expect(result.metadata?.model).toBe('dall-e-3');
		});

		it('should generate multiple images', async () => {
			const adapter = new OpenAIImageAdapter({
				apiKey: mockApiKey,
				defaultModel: 'dall-e-2'
			});

			const mockResponse = {
				created: 1700000000,
				data: [
					{ url: 'https://example.com/image1.png' },
					{ url: 'https://example.com/image2.png' }
				]
			};

			mockFetch.mockResolvedValue({
				ok: true,
				json: async () => mockResponse
			} as Response);

			const request: IImageGenerationRequest = {
				prompt: 'A cat',
				n: 2
			};

			const result = await adapter.generateImage(request);

			expect(result.images).toHaveLength(2);
			expect(result.images[0].url).toBe(
				'https://example.com/image1.png'
			);
			expect(result.images[1].url).toBe(
				'https://example.com/image2.png'
			);
		});

		it('should handle base64 response format', async () => {
			const adapter = new OpenAIImageAdapter({
				apiKey: mockApiKey
			});

			const mockResponse = {
				created: 1700000000,
				data: [
					{
						b64_json: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
					}
				]
			};

			mockFetch.mockResolvedValue({
				ok: true,
				json: async () => mockResponse
			} as Response);

			const request: IImageGenerationRequest = {
				prompt: 'A dog',
				responseFormat: 'b64_json'
			};

			const result = await adapter.generateImage(request);

			expect(result.images[0].b64_json).toBeDefined();
			expect(result.images[0].url).toBeUndefined();
		});

		it('should handle API errors', async () => {
			const adapter = new OpenAIImageAdapter({
				apiKey: mockApiKey
			});

			mockFetch.mockResolvedValue({
				ok: false,
				status: 400,
				json: async () => ({
					error: {
						message: 'Invalid prompt'
					}
				})
			} as Response);

			const request: IImageGenerationRequest = {
				prompt: ''
			};

			await expect(adapter.generateImage(request)).rejects.toThrow(
				'Invalid prompt'
			);
		});

		it('should handle request cancellation', async () => {
			const adapter = new OpenAIImageAdapter({
				apiKey: mockApiKey
			});

			mockFetch.mockImplementation(() => {
				return new Promise((_, reject) => {
					setTimeout(() => {
						const error = new Error('The user aborted a request');
						error.name = 'AbortError';
						reject(error);
					}, 100);
				});
			});

			const request: IImageGenerationRequest = {
				prompt: 'A landscape'
			};

			const abortController = new AbortController();
			setTimeout(() => abortController.abort(), 50);

			await expect(
				adapter.generateImage(request, abortController.signal)
			).rejects.toThrow();
		});

		it('should pass custom parameters', async () => {
			const adapter = new OpenAIImageAdapter({
				apiKey: mockApiKey,
				apiEndpoint: 'https://custom.api.com/v1'
			});

			mockFetch.mockResolvedValue({
				ok: true,
				json: async () => ({
					created: 1700000000,
					data: [{ url: 'https://example.com/image.png' }]
				})
			} as Response);

			const request: IImageGenerationRequest = {
				prompt: 'A mountain',
				size: '1792x1024',
				quality: 'hd',
				style: 'vivid'
			};

			await adapter.generateImage(request);

			expect(mockFetch).toHaveBeenCalledWith(
				'https://custom.api.com/v1/images/generations',
				expect.objectContaining({
					method: 'POST',
					headers: expect.objectContaining({
						'Content-Type': 'application/json',
						Authorization: `Bearer ${mockApiKey}`
					}),
					body: expect.stringContaining('"size":"1792x1024"')
				})
			);
		});

		it('should use model from request when provided', async () => {
			const adapter = new OpenAIImageAdapter({
				apiKey: mockApiKey,
				defaultModel: 'dall-e-3'
			});

			mockFetch.mockResolvedValue({
				ok: true,
				json: async () => ({
					created: 1700000000,
					data: [{ url: 'https://example.com/image.png' }]
				})
			} as Response);

			const request: IImageGenerationRequest = {
				prompt: 'A sunset',
				model: 'dall-e-2'
			};

			const result = await adapter.generateImage(request);

			expect(mockFetch).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({
					body: expect.stringContaining('"model":"dall-e-2"')
				})
			);

			expect(result.metadata?.model).toBe('dall-e-2');
		});

		it('should use default model when not provided in request', async () => {
			const adapter = new OpenAIImageAdapter({
				apiKey: mockApiKey,
				defaultModel: 'dall-e-2'
			});

			mockFetch.mockResolvedValue({
				ok: true,
				json: async () => ({
					created: 1700000000,
					data: [{ url: 'https://example.com/image.png' }]
				})
			} as Response);

			const request: IImageGenerationRequest = {
				prompt: 'A forest'
			};

			const result = await adapter.generateImage(request);

			expect(mockFetch).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({
					body: expect.stringContaining('"model":"dall-e-2"')
				})
			);

			expect(result.metadata?.model).toBe('dall-e-2');
		});
	});
});
