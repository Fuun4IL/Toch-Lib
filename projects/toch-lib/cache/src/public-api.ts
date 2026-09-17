/*
 * Public API surface of toch-lib/cache
 */
export { CacheService, CacheSetOptions, CacheEntryInfo } from './lib/cache.service';
export {
  tochCacheInterceptor,
  CacheInterceptor,
  provideTochCacheInterceptor,
  httpCacheKey,
  HTTP_CACHE_TAG,
} from './lib/cache.interceptor';
