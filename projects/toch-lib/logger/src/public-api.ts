/*
 * Public API surface of toch-lib/logger
 */
export {
  LoggerAdapter,
  LOGGER_ADAPTER,
  LOGGER_PREFIX,
  ConsoleLoggerAdapter,
  MatomoLoggerAdapter,
  provideTochLogger,
  setLoggerAdapter,
} from './lib/logger';
export { log, warn, error } from './lib/logger.decorators';
