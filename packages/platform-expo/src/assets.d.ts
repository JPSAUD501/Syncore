declare module "*.wasm" {
  const asset:
    | string
    | {
        default?: string;
        uri?: string;
      };
  export default asset;
}
