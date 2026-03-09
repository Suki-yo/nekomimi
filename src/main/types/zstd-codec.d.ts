declare module 'zstd-codec' {
  export interface ZstdSimple {
    compress(data: Uint8Array, level?: number): Uint8Array
    decompress(data: Uint8Array): Uint8Array
  }

  export interface ZstdModule {
    Simple: new () => ZstdSimple
  }

  export const ZstdCodec: {
    run: (callback: (zstd: ZstdModule) => void) => void
  }

  export function run(callback: (zstd: ZstdModule) => void): void
}
