import { generateIssuerPrivateKey } from '../src/infrastructure/cryptography/index.js';

const privateKey = generateIssuerPrivateKey();
console.log(`ISSUER_PRIVATE_KEY=${privateKey}`);
