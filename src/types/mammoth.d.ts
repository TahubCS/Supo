// Minimal typings for the parts of mammoth we use (the package ships none).
declare module "mammoth" {
  type Input = { buffer: Buffer } | { arrayBuffer: ArrayBuffer } | { path: string };
  type Result = { value: string; messages: { type: string; message: string }[] };
  export function convertToHtml(input: Input): Promise<Result>;
  export function extractRawText(input: Input): Promise<Result>;
  const mammoth: { convertToHtml: typeof convertToHtml; extractRawText: typeof extractRawText };
  export default mammoth;
}
