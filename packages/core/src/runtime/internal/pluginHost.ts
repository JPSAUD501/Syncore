import type {
  AnySyncoreSchema,
  CapabilityDescriptor,
  SyncoreCapabilities,
  SyncoreExperimentalPlugin,
  SyncoreExperimentalPluginContext
} from "../runtime.js";

export class PluginHost<TSchema extends AnySyncoreSchema> {
  constructor(
    private readonly plugins: Array<SyncoreExperimentalPlugin<TSchema>>,
    private readonly createContext: () => SyncoreExperimentalPluginContext<TSchema>
  ) {}

  buildCapabilities(baseCapabilities: SyncoreCapabilities): SyncoreCapabilities {
    const capabilities: SyncoreCapabilities = {
      ...baseCapabilities
    };

    for (const plugin of this.plugins) {
      if (!plugin.capabilities) {
        continue;
      }
      const contributed =
        typeof plugin.capabilities === "function"
          ? plugin.capabilities(this.createContext())
          : plugin.capabilities;
      if (!contributed) {
        continue;
      }
      Object.assign(capabilities, contributed);
    }

    return capabilities;
  }

  buildCapabilityDescriptors(
    baseDescriptors: CapabilityDescriptor[]
  ): CapabilityDescriptor[] {
    const descriptors = [...baseDescriptors];

    for (const plugin of this.plugins) {
      if (!plugin.capabilityDescriptors) {
        continue;
      }
      const contributed =
        typeof plugin.capabilityDescriptors === "function"
          ? plugin.capabilityDescriptors(this.createContext())
          : plugin.capabilityDescriptors;
      if (!contributed || contributed.length === 0) {
        continue;
      }
      descriptors.push(...contributed);
    }

    return dedupeCapabilityDescriptors(descriptors);
  }

  async runHook(hook: "onStart" | "onStop"): Promise<void> {
    const context = this.createContext();
    for (const plugin of this.plugins) {
      const handler = plugin[hook];
      if (!handler) {
        continue;
      }
      await handler(context);
    }
  }
}

function dedupeCapabilityDescriptors(
  descriptors: CapabilityDescriptor[]
): CapabilityDescriptor[] {
  const byKey = new Map<string, CapabilityDescriptor>();
  for (const descriptor of descriptors) {
    byKey.set(`${descriptor.name}@${descriptor.version}`, descriptor);
  }
  return [...byKey.values()].sort((left, right) =>
    `${left.name}@${left.version}`.localeCompare(
      `${right.name}@${right.version}`
    )
  );
}
