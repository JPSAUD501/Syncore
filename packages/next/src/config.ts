const WORKER_NAME = "syncore-worker";

function joinAppWorkerPath(dir: string) {
  return `${dir.replace(/[\\/]$/, "")}/app/syncore.worker`;
}

/**
 * Wrap a Next config with the settings Syncore needs for SQL.js and worker assets.
 *
 * This enables async WebAssembly support and, for non-exported apps, adds a
 * long-lived cache header for `sql-wasm.wasm`. It also configures webpack to
 * bundle the syncore worker as a separate entry point.
 */
export function withSyncoreNext<TConfig extends Record<string, unknown>>(
  config: TConfig
): TConfig {
  const baseConfig = config as Record<string, unknown>;
  const isStaticExport = baseConfig.output === "export";
  const headers = (baseConfig.headers ?? []) as Array<Record<string, unknown>>;
  const userWebpack =
    typeof baseConfig.webpack === "function"
      ? (baseConfig.webpack as (
          config: Record<string, unknown>,
          context: unknown
        ) => Record<string, unknown>)
      : undefined;
  const userHeaders =
    typeof baseConfig.headers === "function"
      ? (baseConfig.headers as () =>
          | Array<Record<string, unknown>>
          | Promise<Array<Record<string, unknown>>>)
      : undefined;
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

      type WebpackContext = {
        dev?: boolean;
        isServer: boolean;
        nextRuntime?: string;
        dir: string;
      };
      const ctx = context as WebpackContext | undefined;
      if (
        isStaticExport &&
        ctx &&
        !ctx.dev &&
        !ctx.isServer &&
        ctx.nextRuntime !== "edge"
      ) {
        const entry =
          (nextConfig.entry as () => Promise<Record<string, unknown>>) ??
          (async () => ({}));
        const workerPath = joinAppWorkerPath(ctx.dir);
        nextConfig.entry = async () => {
          const entries = await entry();
          return {
            ...entries,
            [WORKER_NAME]: {
              import: workerPath,
              filename: "static/chunks/[name].js"
            }
          };
        };
      }

      if (userWebpack) {
        return userWebpack(nextConfig, context);
      }

      return nextConfig;
    }
  };

  if (!isStaticExport || userHeaders) {
    nextConfig.headers = async () => {
      const resolvedHeaders = userHeaders ? await userHeaders() : headers;
      return isStaticExport
        ? resolvedHeaders
        : [...resolvedHeaders, syncoreHeaders];
    };
  }

  return nextConfig as TConfig;
}

export function getSyncoreWorkerUrl(): string {
  return `/_next/static/chunks/${WORKER_NAME}.js`;
}

/**
 * Create the default worker URL used by the Next integration.
 */
export function createSyncoreNextWorkerUrl(
  relativePath = "./syncore.worker.js"
) {
  return new URL(relativePath, import.meta.url);
}
