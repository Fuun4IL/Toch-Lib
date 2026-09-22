'use strict';

const { RuleTester } = require('eslint');
const rule = require('./require-log-decorator');

const ruleTester = new RuleTester({
  parser: require.resolve('@typescript-eslint/parser'),
  parserOptions: { sourceType: 'module', ecmaVersion: 2022 },
});

ruleTester.run('require-log-decorator', rule, {
  valid: [
    // decorated with the unified decorator
    { code: `class Foo { @Log() bar() {} }` },
    { code: `class Foo { @Log('bar ran') bar() {} }` },
    // decorated with a deprecated alias
    { code: `class Foo { @log('bar') bar() {} }` },
    { code: `class Foo { @warn('bar') bar() {} }` },
    { code: `class Foo { @error('bar') bar() {} }` },
    // always exempt
    { code: `class Foo { constructor() {} }` },
    { code: `class Foo { get bar() { return 1; } }` },
    { code: `class Foo { set bar(v) {} }` },
    { code: `class Foo { [Symbol.iterator]() {} }` },
    // private methods are not checked by default
    { code: `class Foo { private bar() {} }` },
    // explicit ignore list
    { code: `class Foo { bar() {} }`, options: [{ ignoreNames: ['bar'] }] },
    // protected methods opted out
    { code: `class Foo { protected bar() {} }`, options: [{ checkProtected: false }] },
    // custom decorator allow-list
    { code: `class Foo { @Traced() bar() {} }`, options: [{ decoratorNames: ['Traced'] }] },
  ],
  invalid: [
    {
      code: `class Foo { bar() {} }`,
      errors: [{ messageId: 'missing', data: { name: 'bar', allowed: 'Log/log/warn/error' } }],
    },
    {
      code: `class Foo { protected bar() {} }`,
      errors: [{ messageId: 'missing' }], // checkProtected defaults to true
    },
    {
      code: `class Foo { private bar() {} }`,
      options: [{ checkPrivate: true }],
      errors: [{ messageId: 'missing' }],
    },
    {
      code: `class Foo { @Traced() bar() {} }`, // decorator not in the allow-list
      errors: [{ messageId: 'missing' }],
    },
    {
      code: `class Foo { bar() {} baz() {} }`,
      errors: [{ messageId: 'missing' }, { messageId: 'missing' }],
    },
  ],
});
