import { webcrypto } from 'crypto';
import { TextDecoder, TextEncoder } from 'util';

process.env.VAULT_PBKDF2_ITERATIONS = '1000';

const g = globalThis as any;
if (!g.crypto) g.crypto = webcrypto;
if (!g.TextEncoder) g.TextEncoder = TextEncoder;
if (!g.TextDecoder) g.TextDecoder = TextDecoder;
