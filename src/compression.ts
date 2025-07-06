import pako from "pako";

export const compressString = (input: string): string => {
  if (typeof btoa === "function") {
    return btoa(String.fromCharCode(...pako.gzip(input)));
  }
  return Buffer.from(pako.gzip(input)).toString("base64");
};

export const decompressString = (input: string): string => {
  if (typeof atob === "function") {
    return pako.ungzip(
      new Uint8Array([...atob(input)].map((c) => c.charCodeAt(0))),
      { to: "string" }
    ) as string;
  }
  return pako.ungzip(Buffer.from(input, "base64")).toString();
};
