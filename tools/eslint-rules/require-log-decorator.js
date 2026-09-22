'use strict';

/**
 * ESLint rule: require-log-decorator
 *
 * Reports class methods that carry none of the configured logging
 * decorators (default: Log, log, warn, error — the exports of
 * `toch-lib/logger`). This is a development-time/CI check, not a runtime
 * guarantee — nothing stops someone from removing the decorator later or
 * disabling the rule inline; treat it as encouragement backed by CI, not a
 * type-system-level enforcement.
 *
 * Enable it per file/folder via ESLint `overrides` (see ../../.eslintrc.json
 * for an example) rather than repo-wide — most classes have methods that
 * legitimately don't need logging (pure helpers, DTOs, trivial getters),
 * and blanket enforcement produces noise, not signal.
 *
 * Options:
 *   decoratorNames  string[]  Decorator names that satisfy the rule.
 *                             Default: ['Log', 'log', 'warn', 'error'].
 *   checkPrivate    boolean   Also flag `private` methods. Default: false.
 *   checkProtected  boolean   Also flag `protected` methods. Default: true.
 *   ignoreNames     string[]  Method names to always skip. Default: [].
 *
 * Always exempt: constructors, getters/setters, and computed method names
 * (`[Symbol.iterator]() {}`) — none of these are meaningfully "logged".
 */

const DEFAULT_DECORATOR_NAMES = ['Log', 'log', 'warn', 'error'];

function calleeName(node) {
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'MemberExpression' && node.property.type === 'Identifier') return node.property.name;
  return undefined;
}

function decoratorName(decoratorNode) {
  const expr = decoratorNode.expression;
  return calleeName(expr.type === 'CallExpression' ? expr.callee : expr);
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require class methods to carry a logging decorator (@Log/@log/@warn/@error).',
      recommended: false,
    },
    schema: [
      {
        type: 'object',
        properties: {
          decoratorNames: { type: 'array', items: { type: 'string' } },
          checkPrivate: { type: 'boolean' },
          checkProtected: { type: 'boolean' },
          ignoreNames: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      missing:
        "Method '{{name}}' has no logging decorator ({{allowed}}). Add one, e.g. @Log('{{name}}'), or add it to this rule's ignoreNames if it's intentionally unlogged.",
    },
  },
  create(context) {
    const options = context.options[0] || {};
    const allowed = options.decoratorNames || DEFAULT_DECORATOR_NAMES;
    const checkPrivate = options.checkPrivate ?? false;
    const checkProtected = options.checkProtected ?? true;
    const ignoreNames = new Set(options.ignoreNames || []);

    return {
      MethodDefinition(node) {
        if (node.kind === 'constructor' || node.kind === 'get' || node.kind === 'set') return;
        if (node.computed) return;

        const name = node.key.type === 'Identifier' ? node.key.name : String(node.key.value);
        if (ignoreNames.has(name)) return;
        if (node.accessibility === 'private' && !checkPrivate) return;
        if (node.accessibility === 'protected' && !checkProtected) return;

        const decorators = node.decorators || [];
        const hasLogDecorator = decorators.some((d) => allowed.includes(decoratorName(d)));
        if (!hasLogDecorator) {
          context.report({ node, messageId: 'missing', data: { name, allowed: allowed.join('/') } });
        }
      },
    };
  },
};
