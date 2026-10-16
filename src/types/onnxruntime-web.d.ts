// onnxruntime-web 1.21's package "exports" has no "types" condition, so TypeScript's bundler
// resolution finds no declarations. Its types.d.ts re-exports onnxruntime-common; so do we.
declare module "onnxruntime-web" {
  export * from "onnxruntime-common";
}
