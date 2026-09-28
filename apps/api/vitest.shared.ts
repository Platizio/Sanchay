import swc from 'unplugin-swc';

export function swcPlugin() {
  return swc.vite({
    tsconfigFile: false,
    // The inline options below are the whole config: never merge apps/api/.swcrc (it is for
    // `nest build` and excludes *.test.ts, which would make SWC refuse every test file).
    swcrc: false,
    module: { type: 'es6' },
    jsc: {
      target: 'es2023',
      parser: { syntax: 'typescript', decorators: true },
      transform: {
        legacyDecorator: true,
        decoratorMetadata: true,
        useDefineForClassFields: false,
      },
      keepClassNames: true,
    },
  });
}
