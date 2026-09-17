/*
 * Public API surface of toch-lib/logger
 */
export {
  LoggerService,
  LoggerAdapter,
  LOGGER_ADAPTER,
  LOGGER_PREFIX,
  ConsoleLoggerAdapter,
  MatomoLoggerAdapter,
  provideTochLogger,
} from './lib/logger';
