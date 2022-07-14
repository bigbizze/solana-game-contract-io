import { Keypair } from "@solana/web3.js";


export type PublicKeyString = string;
export type SecretKeyBase64 = string;
export type StringKeyPair = {
  publicKey: PublicKeyString;
  secretKey: SecretKeyBase64
};

export const makeNewStringKeypair = (): StringKeyPair => {
  const keyPair = Keypair.generate();
  return {
    publicKey: keyPair.publicKey.toString(),
    secretKey: Buffer.from(keyPair.secretKey).toString("base64url")
  };
};
