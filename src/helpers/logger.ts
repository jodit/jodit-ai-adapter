import winston from 'winston';

const isDevelopment = process.env.NODE_ENV === 'development';

/**
 * Application logger using Winston
 */
export const logger = winston.createLogger({
	level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
	silent: !process.env.LOGGER && process.env.NODE_ENV === 'test',
	format: isDevelopment
		? winston.format.combine(
				winston.format.colorize(),
				winston.format.timestamp({ format: 'HH:mm:ss' }),
				winston.format.printf(
					({ timestamp, level, message, ...meta }) => {
						const metaStr =
							Object.keys(meta).length > 0
								? '\n' + JSON.stringify(meta, null, 2)
								: '';
						return `[${timestamp}] ${level}: ${message}${metaStr}`;
					}
				)
			)
		: winston.format.combine(
				winston.format.timestamp(),
				winston.format.errors({ stack: true }),
				winston.format.json()
			),
	transports: [new winston.transports.Console()],
	exitOnError: false
});

export default logger;
