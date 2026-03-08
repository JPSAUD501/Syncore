/**
 * Wrap a Next config with the settings Syncore needs for SQL.js and worker assets.
 *
 * This enables async WebAssembly support and, for non-exported apps, adds a
 * long-lived cache header for `sql-wasm.wasm`.
 */
export function withSyncoreNext<TConfig extends Record<string, unknown>>(
  config: TConfig
): TConfig {
  const baseConfig = config as Record<string, unknown>;
  const isStaticExport = baseConfig.output === "export";
  const headers = (baseConfig.headers ?? []) as Array<Record<string, unknown>>;
  const userWebpack = baseConfig.webpack;
  const syncoreHeaders = {
    source: "/sql-wasm.wasm",
    headers: [
      {
        key: "Cache-Control",
        value: "public, max-age=31536000, immutable"
      }
    ]
  };

  const nextConfig: Record<string, unknown> = {
    ...config,
    webpack(currentConfig: Record<string, unknown>, context: unknown) {
      const nextConfig = { ...currentConfig };
      const experiments = (nextConfig.experiments ?? {}) as Record<
        string,
        unknown
      >;
      nextConfig.experiments = {
        ...experiments,
        asyncWebAssembly: true
      };

      if (typeof userWebpack === "function") {
        return userWebpack(nextConfig, context);
      }

      return nextConfig;
    }
  };

  if (!isStaticExport || typeof baseConfig.headers === "function") {
    nextConfig.headers = async () => {
      const userHeaders = baseConfig.headers;
      const resolvedHeaders =
        typeof userHeaders === "function"
          ? ((await userHeaders()) as Array<Record<string, unknown>>)
          : headers;
      return isStaticExport
        ? resolvedHeaders
        : [...resolvedHeaders, syncoreHeaders];
    };
  }

  return nextConfig as TConfig;
}

/**
 * Create the default worker URL used by the Next integration.
 */
export function createSyncoreNextWorkerUrl(
  relativePath = "./syncore.worker.ts"
) {
  return new URL(relativePath, import.meta.url);
}
