// Sophon protobuf definitions
// Generated from SophonManifest.proto based on fischl-rs research

import * as protobuf from 'protobufjs'

// Protobuf definition for Sophon manifest
// Based on reverse engineering from fischl-rs project
const SOPHON_PROTO = `
syntax = "proto3";

package sophon;

message Manifest {
  repeated ManifestFile files = 1;
}

message ManifestFile {
  string name = 1;
  repeated FileChunk chunks = 2;
  int64 type = 3;
  int64 size = 4;
  string md5 = 5;
}

message FileChunk {
  string chunk_name = 1;
  string chunk_decompressed_md5 = 2;
  int64 chunk_on_file_offset = 3;
  int64 chunk_size = 4;
  int64 chunk_decompressed_size = 5;
  int64 something = 6;
  string chunk_md5 = 7;
}
`

// Cache the parsed root
let _root: protobuf.Root | null = null

// Get or create protobuf root
function getRoot(): protobuf.Root {
  if (!_root) {
    _root = protobuf.parse(SOPHON_PROTO).root
  }
  return _root
}

// Decode manifest from buffer
export function decodeManifest(buffer: Buffer): SophonManifestProto {
  const root = getRoot()
  const Manifest = root.lookupType('sophon.Manifest')

  const message = Manifest.decode(buffer)
  const obj = Manifest.toObject(message, {
    longs: Number,
    enums: String,
    bytes: Buffer,
    defaults: true,
  })

  return obj as SophonManifestProto
}

// Types matching the protobuf structure
export interface SophonManifestProto {
  files: SophonManifestFileProto[]
}

export interface SophonManifestFileProto {
  name: string
  chunks: SophonFileChunkProto[]
  type: number
  size: number
  md5: string
}

export interface SophonFileChunkProto {
  chunkName: string
  chunkDecompressedMd5: string
  chunkOnFileOffset: number
  chunkSize: number
  chunkDecompressedSize: number
  something: number
  chunkMd5: string
}
