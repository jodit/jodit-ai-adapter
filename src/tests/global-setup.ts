export default async function setup(): Promise<void> {
	process.env.TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE = '/var/run/docker.sock';
	process.env.TESTCONTAINERS_HOST_OVERRIDE ||= "127.0.0.1";
	process.env.TESTCONTAINERS_RYUK_DISABLED ||= "true";

	const { GenericContainer } = await import('testcontainers');

	try {
		console.info('Starting Redis container for tests...', process.env.DOCKER_HOST);

		const container = await new GenericContainer('redis:8-alpine')
			.withExposedPorts(6379)
			.start();

		console.info('Redis container started');

		// Store container reference globally for teardown
		// @ts-expect-error - allow setting global variable
		global.__REDIS_CONTAINER__ = container;

		// Set Redis connection info in environment
		const host = container.getHost();
		const port = container.getMappedPort(6379);
		process.env.REDIS_HOST = host;
		process.env.REDIS_PORT = String(port);
		process.env.REDIS_URL = `redis://${host}:${port}`;

		console.info(`Redis container started at ${process.env.REDIS_URL}`);
	} catch (error) {
		console.error(error);
		console.warn(
			'Failed to start Redis container, Redis tests will be skipped'
		);
		// Don't fail the entire test suite if Redis can't start
		// Tests will check for Redis availability and skip if needed
	}
}
