import * as anchor from "@project-serum/anchor";
import { BN, Coder } from "@project-serum/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";

export type Signers = Keypair[];
export type RemainingAccount = { pubkey: PublicKey, isMut?: boolean, isSigner?: boolean };
export type RemainingAccounts = RemainingAccount[];
export type AddUserAccounts = {
  matchAuthority: PublicKey;
  mint: PublicKey;
  userAccount: PublicKey;
  fromUserTokenAccount: PublicKey;
  toTempUserTokenAccount: PublicKey;
  systemProgram: PublicKey;
  rent: PublicKey;
  tokenProgram: PublicKey;
};
export type AddUserArgs = {
  accounts: AddUserAccounts,
  signers?: Signers,
  remaining_accounts?: RemainingAccounts
};
export type TransferTokenAccounts = {
  matchAuthority: PublicKey;
  fromTokenAccount: PublicKey;
  toTokenAccount: PublicKey;
  userAccount: PublicKey;
  programSigner: PublicKey;
  tokenProgram: PublicKey;
  mint: PublicKey;
};
export type TransferTokenArgs = {
  accounts: TransferTokenAccounts,
  signers?: Signers,
  remaining_accounts?: RemainingAccounts
};
export type LeaveAccounts = {
  matchAuthority: PublicKey;
  lamportRecipient: PublicKey;
  fromTempTokenAccount: PublicKey;
  toUserTokenAccount: PublicKey;
  userAccount: PublicKey;
  tokenProgram: PublicKey;
  programSigner: PublicKey;
};
export type LeaveArgs = {
  accounts: LeaveAccounts,
  signers?: Signers,
  remaining_accounts?: RemainingAccounts
};

export interface RpcNamespace {
  addUser: (wagerAmount: BN, named_args: AddUserArgs) => Promise<string>;
  transferToken: (transferAmount: BN | null, nonce: BN, named_args: TransferTokenArgs) => Promise<string>;
  leave: (nonce: BN, named_args: LeaveArgs) => Promise<string>;
}

export declare class Program implements anchor.Program {
  // @ts-ignore
  readonly rpc: RpcNamespace;
  programId: PublicKey;
  coder: Coder;
}
