const WORKER_NAME = "syncore-worker";

function joinAppWorkerPath(dir: string) {
  return `${dir.replace(/[\\/]$/, "")}/app/syncore.worker`;
}

/**
 * Wrap a Next config with the settings Syncore needs for worker assets.
 *
 * This enables async WebAssembly support and configures webpack to bundle the
 * syncore worker as a separate entry point.
 */
export function withSyncoreNext<TConfig extends Record<string, unknown>>(
  config: TConfig
): TConfig {
  const baseConfig = config as Record<string, unknown>;
  const isStaticExport = baseConfig.output === "export";
  const userWebpack =
    typeof baseConfig.webpack === "function"
      ? (baseConfig.webpack as (
          config: Record<string, unknown>,
          context: unknown
        ) => Record<string, unknown>)
      : undefined;
  const userTranspilePackages = Array.isArray(baseConfig.transpilePackages)
    ? baseConfig.transpilePackages
    : [];
  const internalScope = `${String.fromCharCode(64)}syncore/`;
  const syncoreTranspilePackages = [
    "syncorejs",
    `${internalScope}core`,
    `${internalScope}schema`,
    `${internalScope}react`,
    `${internalScope}platform-web`,
    `${internalScope}next`
  ];

  const nextConfig: Record<string, unknown> = {
    ...config,
    transpilePackages: Array.from(
      new Set([...userTranspilePackages, ...syncoreTranspilePackages])
    ),
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
      const resolve = (nextConfig.resolve ?? {}) as Record<string, unknown>;
      nextConfig.resolve = {
        ...resolve,
        extensionAlias: {
          ...((resolve.extensionAlias ?? {}) as Record<string, unknown>),
          ".js": [".ts", ".tsx", ".js"],
          ".mjs": [".mts", ".mjs"]
        }
      };
      const moduleConfig = (nextConfig.module ?? {}) as Record<string, unknown>;
      const rules = Array.isArray(moduleConfig.rules) ? moduleConfig.rules : [];
      nextConfig.module = {
        ...moduleConfig,
        rules: [
          {
            test: /\.wasm$/,
            type: "asset/resource"
          },
          ...rules
        ]
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
