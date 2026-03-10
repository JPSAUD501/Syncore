declare module "adm-zip" {
  export interface AdmZipEntry {
    entryName: string;
    getData(): Buffer;
  }

  export default class AdmZip {
    constructor(path?: string);
    addFile(entryName: string, content: Buffer): void;
    extractAllTo(targetPath: string, overwrite?: boolean): void;
    getEntries(): AdmZipEntry[];
    writeZip(targetPath: string): void;
  }
}
