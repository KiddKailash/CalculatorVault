import { randomBytes as nodeRandomBytes } from 'crypto';

export const getRandomBytes = (length: number): Uint8Array =>
  Uint8Array.from(nodeRandomBytes(length));

export const getRandomBytesAsync = async (length: number): Promise<Uint8Array> =>
  getRandomBytes(length);

export const getRandomValues = <T extends ArrayBufferView>(arr: T): T => {
  const bytes = getRandomBytes(arr.byteLength);
  new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength).set(bytes);
  return arr;
};
