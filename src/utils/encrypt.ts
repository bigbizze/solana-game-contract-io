import Cryptr from 'cryptr';


let cryptr: Cryptr | null = null;

export const loadEncrypt = (key: string) => {
  if (cryptr === null) {
    cryptr = new Cryptr(key);
  }
};

export const encrypt = (val: string) => {
  if (cryptr === null) {
    throw new Error("config for hashing not set");
  }
  return cryptr.encrypt(val);
};

export const decrypt = (val: string) => {
  if (cryptr === null) {
    throw new Error("config for hashing not set");
  }
  return cryptr.decrypt(val);
};


