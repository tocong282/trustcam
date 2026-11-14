import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';
ed.utils.sha512Sync = (...messages) => sha512(ed.utils.concatBytes(...messages));
export const hex = (bytes: Uint8Array): string => ed.utils.bytesToHex(bytes);
function seedBytes(seed: string): Uint8Array {
  if (!/^[0-9a-f]{64}$/.test(seed)) throw new Error('key_corrupt');
  return Uint8Array.from(seed.match(/../g)!, byte => parseInt(byte, 16));
}
export const publicKeyHex = (seed: string): string => hex(ed.sync.getPublicKey(seedBytes(seed)));
export const signBytes = (bytes: Uint8Array, seed: string): string => hex(ed.sync.sign(bytes, seedBytes(seed)));
