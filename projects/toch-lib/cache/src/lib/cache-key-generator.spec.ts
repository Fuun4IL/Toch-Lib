import { HttpRequest } from '@angular/common/http';
import { CacheKeyGenerator } from './cache-key-generator';

describe('CacheKeyGenerator', () => {
  const generator = new CacheKeyGenerator();

  it('distinguishes different query parameters on the same URL', () => {
    const page1 = generator.generate(new HttpRequest('GET', '/api/users?page=1'));
    const page2 = generator.generate(new HttpRequest('GET', '/api/users?page=2'));

    expect(page1).not.toBe(page2);
  });

  it('distinguishes different URLs', () => {
    const users = generator.generate(new HttpRequest('GET', '/api/users'));
    const orders = generator.generate(new HttpRequest('GET', '/api/orders'));

    expect(users).not.toBe(orders);
  });

  it('distinguishes different HTTP methods on the same URL', () => {
    const get = generator.generate(new HttpRequest('GET', '/api/users'));
    const post = generator.generate(new HttpRequest('POST', '/api/users', {}));

    expect(get).not.toBe(post);
  });

  it('produces the same key for two otherwise-identical requests', () => {
    const a = generator.generate(new HttpRequest('GET', '/api/users?page=1'));
    const b = generator.generate(new HttpRequest('GET', '/api/users?page=1'));

    expect(a).toBe(b);
  });
});
