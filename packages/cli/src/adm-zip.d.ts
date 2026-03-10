declare module "adm-zip" {
  export default class AdmZip {
    constructor(path?: string);
    addFile(entryName: string, content: Buffer): void;
    extractAllTo(targetPath: string, overwrite?: boolean): void;
    writeZip(targetPath: string): void;
  }
}
