import nextTranspileModules from 'next-transpile-modules'

const withTM = nextTranspileModules(["@tack/fbc-client", "@tack/logger", "@tack/ui"])

export default withTM({
  reactStrictMode: true,
});
