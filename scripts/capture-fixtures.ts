/**
 * Capture real OpenAI API request/response pairs for use as test fixtures.
 *
 * Usage: npx tsx scripts/capture-fixtures.ts
 *
 * Requires OPENAI_API_KEY (and optionally HTTP_PROXY) in .env
 */

import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '..', 'src', 'adapters', '__fixtures__');

// Ensure fixtures directory exists
fs.mkdirSync(FIXTURES_DIR, { recursive: true });

interface CapturedFixture {
	request: {
		url: string;
		method: string;
		body: unknown;
	};
	response: {
		status: number;
		body: unknown;
	};
}

/**
 * Create a fetch wrapper that captures request/response pairs
 */
function createCapturingFetch(
	baseFetch: typeof fetch,
	captures: CapturedFixture[]
): typeof fetch {
	return async (input: string | URL | Request, init?: RequestInit) => {
		const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
		const method = init?.method || 'GET';
		let requestBody: unknown = null;

		if (init?.body) {
			try {
				requestBody = JSON.parse(init.body as string);
			} catch {
				requestBody = String(init.body);
			}
		}

		console.log(`\n→ ${method} ${url}`);
		console.log('  Request body:', JSON.stringify(requestBody, null, 2).substring(0, 500));

		const response = await baseFetch(input, init);

		// Clone so we can read the body without consuming it
		const cloned = response.clone();
		let responseBody: unknown;

		try {
			responseBody = await cloned.json();
		} catch {
			responseBody = await cloned.text();
		}

		console.log(`← ${response.status}`);
		const bodyStr = JSON.stringify(responseBody, null, 2);
		console.log('  Response body:', bodyStr.substring(0, 500), bodyStr.length > 500 ? '...' : '');

		captures.push({
			request: { url, method, body: requestBody },
			response: { status: response.status, body: responseBody }
		});

		return response;
	};
}

function saveFixture(name: string, fixture: CapturedFixture) {
	const filePath = path.join(FIXTURES_DIR, `${name}.json`);

	// Truncate large base64 image data for readability but keep structure
	const cleaned = JSON.parse(JSON.stringify(fixture));

	// Trim b64 data in image responses to keep fixtures small
	if (cleaned.response?.body?.data) {
		for (const item of cleaned.response.body.data) {
			if (item.b64_json && item.b64_json.length > 200) {
				// Keep first 100 chars + marker so tests can still match structure
				item.b64_json = item.b64_json.substring(0, 100) + '...TRUNCATED_FOR_FIXTURE';
			}
		}
	}

	fs.writeFileSync(filePath, JSON.stringify(cleaned, null, '\t'));
	console.log(`\n✓ Saved fixture: ${filePath}`);
}

async function main() {
	const apiKey = process.env.OPENAI_API_KEY;
	if (!apiKey) {
		console.error('OPENAI_API_KEY is required in .env');
		process.exit(1);
	}

	const httpProxy = process.env.HTTP_PROXY || process.env.HTTPS_PROXY;

	// Dynamic imports to use project source
	const { OpenAIAdapter } = await import('../src/adapters/openai-adapter.js');
	const { IAIRequestContext } = await import('../src/types/index.js') as any;

	// --- Scenario 1: Text generation ---
	console.log('\n' + '='.repeat(60));
	console.log('SCENARIO 1: Text generation');
	console.log('='.repeat(60));

	const captures1: CapturedFixture[] = [];
	const origFetch1 = globalThis.fetch;
	globalThis.fetch = createCapturingFetch(origFetch1, captures1);

	try {
		const adapter1 = new OpenAIAdapter({
			apiKey,
			httpProxy,
			defaultModel: 'gpt-4.1-nano'
		});

		const result1 = await adapter1.handleRequest(
			{
				mode: 'full' as const,
				messages: [
					{
						id: 'msg-1',
						role: 'user' as const,
						content: 'Say "Hello, test!" and nothing else.',
						timestamp: Date.now()
					}
				],
				tools: [],
				instructions: 'You are a test assistant. Reply very briefly.'
			},
			new AbortController().signal
		);

		console.log('\nAdapter result:', JSON.stringify(result1, null, 2).substring(0, 500));

		if (captures1.length > 0) {
			saveFixture('text-generation', captures1[0]);
		}
	} catch (err) {
		console.error('Scenario 1 failed:', err);
	} finally {
		globalThis.fetch = origFetch1;
	}

	// --- Scenario 2: Text generation with tools ---
	console.log('\n' + '='.repeat(60));
	console.log('SCENARIO 2: Text generation with tool calls');
	console.log('='.repeat(60));

	const captures2: CapturedFixture[] = [];
	const origFetch2 = globalThis.fetch;
	globalThis.fetch = createCapturingFetch(origFetch2, captures2);

	try {
		const adapter2 = new OpenAIAdapter({
			apiKey,
			httpProxy,
			defaultModel: 'gpt-4.1-nano'
		});

		const result2 = await adapter2.handleRequest(
			{
				mode: 'full' as const,
				messages: [
					{
						id: 'msg-1',
						role: 'user' as const,
						content: 'What is the weather in London?',
						timestamp: Date.now()
					}
				],
				tools: [
					{
						name: 'get_weather',
						description: 'Get the current weather for a location',
						parameters: [
							{
								name: 'location',
								type: 'string' as const,
								description: 'The city name',
								required: true
							}
						]
					}
				],
				instructions: 'You must use the get_weather tool to answer weather questions.'
			},
			new AbortController().signal
		);

		console.log('\nAdapter result:', JSON.stringify(result2, null, 2).substring(0, 500));

		if (captures2.length > 0) {
			saveFixture('text-with-tools', captures2[0]);
		}
	} catch (err) {
		console.error('Scenario 2 failed:', err);
	} finally {
		globalThis.fetch = origFetch2;
	}

	// --- Scenario 3: Image generation ---
	console.log('\n' + '='.repeat(60));
	console.log('SCENARIO 3: Image generation');
	console.log('='.repeat(60));

	const captures3: CapturedFixture[] = [];
	const origFetch3 = globalThis.fetch;
	globalThis.fetch = createCapturingFetch(origFetch3, captures3);

	try {
		const adapter3 = new OpenAIAdapter({
			apiKey,
			httpProxy,
			defaultModel: 'gpt-4.1-nano'
		});

		const result3 = await adapter3.handleImageGeneration(
			{
				prompt: 'A simple red circle on white background',
				model: 'dall-e-2',
				n: 1,
				size: '256x256'
			},
			new AbortController().signal
		);

		console.log('\nAdapter result:', JSON.stringify(result3, null, 2).substring(0, 300));

		if (captures3.length > 0) {
			saveFixture('image-generation', captures3[0]);
		}
	} catch (err) {
		console.error('Scenario 3 failed:', err);
	} finally {
		globalThis.fetch = origFetch3;
	}

	// --- Scenario 4: Error response (bad model) ---
	console.log('\n' + '='.repeat(60));
	console.log('SCENARIO 4: Error response');
	console.log('='.repeat(60));

	const captures4: CapturedFixture[] = [];
	const origFetch4 = globalThis.fetch;
	globalThis.fetch = createCapturingFetch(origFetch4, captures4);

	try {
		const adapter4 = new OpenAIAdapter({
			apiKey: 'sk-invalid-key-for-testing',
		});

		await adapter4.handleRequest(
			{
				mode: 'full' as const,
				messages: [
					{
						id: 'msg-1',
						role: 'user' as const,
						content: 'Hello',
						timestamp: Date.now()
					}
				],
				tools: [],
			},
			new AbortController().signal
		);
	} catch (err) {
		console.log('Expected error:', (err as Error).message);
	} finally {
		if (captures4.length > 0) {
			saveFixture('error-response', captures4[0]);
		}
		globalThis.fetch = origFetch4;
	}

	console.log('\n' + '='.repeat(60));
	console.log('Done! Check src/adapters/__fixtures__/');
	console.log('='.repeat(60));
}

main().catch(console.error);
