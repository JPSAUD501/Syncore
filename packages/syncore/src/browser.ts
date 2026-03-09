export {
  BrowserFileStorageAdapter,
  createBrowserSyncoreClient,
  createBrowserSyncoreRuntime,
  createBrowserWorkerRuntime,
  type BrowserSyncoreSchema,
  type CreateBrowserRuntimeOptions,
  type CreateBrowserWorkerRuntimeOptions,
  createWebSyncoreClient,
  createWebSyncoreRuntime,
  createWebWorkerRuntime
} from "@syncore/platform-web";
export type {
  AttachWebWorkerRuntimeOptions,
  AttachedWebWorkerRuntime,
  CreateWebWorkerClientProviderOptions,
  ManagedWebWorkerClient,
  SyncoreWorkerMessageEndpoint,
  SyncoreWebWorkerClient,
  WorkerQueryWatch
} from "@syncore/platform-web";
export {
  attachWebWorkerRuntime,
  createManagedWebWorkerClient,
  createSyncoreWebWorkerClient,
  createWebWorkerClient
} from "@syncore/platform-web";

import {
  attachWebWorkerRuntime,
  createManagedWebWorkerClient,
  createSyncoreWebWorkerClient
} from "@syncore/platform-web";
import type {
  CreateWebWorkerClientProviderOptions,
  ManagedWebWorkerClient
} from "@syncore/platform-web";

export type CreateBrowserWorkerClientOptions =
  CreateWebWorkerClientProviderOptions;
export type ManagedBrowserWorkerClient = ManagedWebWorkerClient;

export const attachBrowserWorkerRuntime = attachWebWorkerRuntime;
export const createBrowserWorkerClient = createSyncoreWebWorkerClient;
export const createManagedBrowserWorkerClient = createManagedWebWorkerClient;
