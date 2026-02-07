import type { StartedTestContainer } from 'testcontainers';

export default async function teardown(): Promise<void> {
	// Stop Redis container if it was started
	// @ts-expect-error - global variable set in setup
	const container = global.__REDIS_CONTAINER__ as
		| StartedTestContainer
		| undefined;

	if (container) {
		try {
			await container.stop();
			console.info('Redis container stopped');
		} catch (error) {
			console.error('Error stopping Redis container:', error);
		}
	}
}
