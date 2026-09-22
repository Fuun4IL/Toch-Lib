// Used only to transpile @angular's ESM-only (.mjs) build output to
// CommonJS for Jest — the library's own TypeScript still goes through
// ts-jest (see jest.config.js). Not used by ng-packagr/the actual build.
module.exports = {
  presets: [['@babel/preset-env', { targets: { node: 'current' } }]],
};
