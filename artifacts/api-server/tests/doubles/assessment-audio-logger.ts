const silent = (..._args: unknown[]) => {};
type SilentLogger = {
  info: typeof silent;
  warn: typeof silent;
  error: typeof silent;
  debug: typeof silent;
  fatal: typeof silent;
  child: (...args: unknown[]) => SilentLogger;
};
export const logger: SilentLogger = {
  info: silent, warn: silent, error: silent, debug: silent, fatal: silent,
  child: () => logger,
};