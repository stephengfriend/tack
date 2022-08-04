import nextTranspileModules from 'next-transpile-modules'

const withTM = nextTranspileModules(["ui"])

export default withTM({
  reactStrictMode: true,
});
