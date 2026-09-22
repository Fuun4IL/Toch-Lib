/*
 * Public API surface of toch-lib/logger
 */
export { LogLevel, LogTrigger, LogEntry, Logger, LogOptions } from './lib/logger.types';
export { setLogger, getLogger } from './lib/logger.bridge';
export {
  LOGGER,
  ConsoleLogger,
  MatomoLogger,
  provideTochLogger,
  // deprecated pre-@Log aliases — kept for backward compatibility
  LoggerAdapter,
  LOGGER_ADAPTER,
  ConsoleLoggerAdapter,
  MatomoLoggerAdapter,
  setLoggerAdapter,
} from './lib/logger';
export {
  Log,
  // deprecated aliases — thin wrappers over Log(); prefer Log(...) directly
  log,
  warn,
  error,
} from './lib/logger.decorators';
