import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export const Paths = {
  document: path.join(os.tmpdir(), "syncore-expo-contract-fs")
};

mkdirSync(Paths.document, { recursive: true });

export class Directory {
  readonly uri: string;

  constructor(...segments: string[]) {
    this.uri = path.join(...segments);
  }

  get exists() {
    try {
      return statSync(this.uri).isDirectory();
    } catch {
      return false;
    }
  }

  create(options?: { intermediates?: boolean }) {
    mkdirSync(this.uri, {
      recursive: options?.intermediates ?? true
    });
  }
}

export class File {
  readonly uri: string;

  constructor(directory: Directory, name: string) {
    this.uri = path.join(directory.uri, name);
  }

  get exists() {
    try {
      return statSync(this.uri).isFile();
    } catch {
      return false;
    }
  }

  get size() {
    return this.exists ? statSync(this.uri).size : 0;
  }

  get type() {
    return "";
  }

  create() {
    mkdirSync(path.dirname(this.uri), { recursive: true });
    writeFileSync(this.uri, new Uint8Array());
  }

  write(data: Uint8Array) {
    mkdirSync(path.dirname(this.uri), { recursive: true });
    writeFileSync(this.uri, data);
  }

  bytes() {
    return new Uint8Array(readFileSync(this.uri));
  }

  delete() {
    rmSync(this.uri, { force: true });
  }
}
