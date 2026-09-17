import { formatValue, ODataPrimitive, ODataVersion } from './odata-types';

/**
 * Composable $filter expression, rendered differently for OData V2 and V4
 * (e.g. `contains(Name,'x')` in V4 becomes `substringof('x',Name)` in V2).
 *
 * ```ts
 * filter.and(
 *   filter.eq('Status', 'A'),
 *   filter.or(filter.contains('Name', 'SAP'), filter.gt('Price', 100)),
 * )
 * ```
 */
export abstract class ODataFilterNode {
  abstract render(version: ODataVersion): string;

  and(other: ODataFilterNode): ODataFilterNode {
    return new LogicalNode('and', [this, other]);
  }

  or(other: ODataFilterNode): ODataFilterNode {
    return new LogicalNode('or', [this, other]);
  }

  not(): ODataFilterNode {
    return new NotNode(this);
  }
}

class ComparisonNode extends ODataFilterNode {
  constructor(
    private readonly field: string,
    private readonly op: 'eq' | 'ne' | 'gt' | 'ge' | 'lt' | 'le',
    private readonly value: ODataPrimitive
  ) {
    super();
  }
  render(version: ODataVersion): string {
    return `${this.field} ${this.op} ${formatValue(this.value, version)}`;
  }
}

class LogicalNode extends ODataFilterNode {
  constructor(private readonly op: 'and' | 'or', private readonly children: ODataFilterNode[]) {
    super();
  }
  render(version: ODataVersion): string {
    const parts = this.children.map((c) => {
      const rendered = c.render(version);
      return c instanceof LogicalNode ? `(${rendered})` : rendered;
    });
    return parts.join(` ${this.op} `);
  }
}

class NotNode extends ODataFilterNode {
  constructor(private readonly child: ODataFilterNode) {
    super();
  }
  render(version: ODataVersion): string {
    return `not (${this.child.render(version)})`;
  }
}

class RawNode extends ODataFilterNode {
  constructor(private readonly expression: string) {
    super();
  }
  render(): string {
    return this.expression;
  }
}

class StringFnNode extends ODataFilterNode {
  constructor(
    private readonly kind: 'contains' | 'startswith' | 'endswith',
    private readonly field: string,
    private readonly value: string
  ) {
    super();
  }
  render(version: ODataVersion): string {
    const v = formatValue(this.value, version);
    if (this.kind === 'contains') {
      return version === ODataVersion.V2
        ? `substringof(${v},${this.field})`
        : `contains(${this.field},${v})`;
    }
    return `${this.kind}(${this.field},${v})`;
  }
}

class InNode extends ODataFilterNode {
  constructor(private readonly field: string, private readonly values: ODataPrimitive[]) {
    super();
  }
  render(version: ODataVersion): string {
    if (this.values.length === 0) {
      // An empty IN matches nothing.
      return 'false';
    }
    if (version === ODataVersion.V4) {
      return `${this.field} in (${this.values.map((v) => formatValue(v, version)).join(',')})`;
    }
    // V2 has no `in`; expand to eq/or chain.
    return `(${this.values
      .map((v) => `${this.field} eq ${formatValue(v, version)}`)
      .join(' or ')})`;
  }
}

class BetweenNode extends ODataFilterNode {
  constructor(
    private readonly field: string,
    private readonly low: ODataPrimitive,
    private readonly high: ODataPrimitive,
    private readonly negate: boolean
  ) {
    super();
  }
  render(version: ODataVersion): string {
    const range = `(${this.field} ge ${formatValue(this.low, version)} and ${this.field} le ${formatValue(
      this.high,
      version
    )})`;
    return this.negate ? `not ${range}` : range;
  }
}

/** Factory helpers to build `$filter` expressions. */
export const filter = {
  eq: (field: string, value: ODataPrimitive) => new ComparisonNode(field, 'eq', value) as ODataFilterNode,
  ne: (field: string, value: ODataPrimitive) => new ComparisonNode(field, 'ne', value) as ODataFilterNode,
  gt: (field: string, value: ODataPrimitive) => new ComparisonNode(field, 'gt', value) as ODataFilterNode,
  ge: (field: string, value: ODataPrimitive) => new ComparisonNode(field, 'ge', value) as ODataFilterNode,
  lt: (field: string, value: ODataPrimitive) => new ComparisonNode(field, 'lt', value) as ODataFilterNode,
  le: (field: string, value: ODataPrimitive) => new ComparisonNode(field, 'le', value) as ODataFilterNode,

  /** V4: `contains(field,'v')` — V2: `substringof('v',field)`. */
  contains: (field: string, value: string) => new StringFnNode('contains', field, value) as ODataFilterNode,
  startsWith: (field: string, value: string) => new StringFnNode('startswith', field, value) as ODataFilterNode,
  endsWith: (field: string, value: string) => new StringFnNode('endswith', field, value) as ODataFilterNode,

  /** V4: `field in (...)` — V2: expanded to an or-chain of eq. */
  in: (field: string, values: ODataPrimitive[]) => new InNode(field, values) as ODataFilterNode,

  /** Inclusive range: `(field ge low and field le high)`. */
  between: (field: string, low: ODataPrimitive, high: ODataPrimitive) =>
    new BetweenNode(field, low, high, false) as ODataFilterNode,
  notBetween: (field: string, low: ODataPrimitive, high: ODataPrimitive) =>
    new BetweenNode(field, low, high, true) as ODataFilterNode,

  and: (...nodes: ODataFilterNode[]) => new LogicalNode('and', nodes) as ODataFilterNode,
  or: (...nodes: ODataFilterNode[]) => new LogicalNode('or', nodes) as ODataFilterNode,
  not: (node: ODataFilterNode) => new NotNode(node) as ODataFilterNode,

  /** Escape hatch: emit the expression exactly as given. */
  raw: (expression: string) => new RawNode(expression) as ODataFilterNode,
};
