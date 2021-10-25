import { makeNewStringKeypair, PublicKeyString, StringKeyPair } from "./utils/keypair";
import { Cluster, PublicKey } from "@solana/web3.js";
import { getConfig, loadConfig } from "./solana-config/get_config";
import * as anchor from "@project-serum/anchor";
import { BN } from "@project-serum/anchor";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { catchWrapper } from "./utils/general";
import { LeaveArgs, TransferTokenArgs } from "./solana-config/contract_type";
import { Option, Result } from "./shared-types";


export interface MatchRecord {
  matchPubKey: PublicKeyString;
  secretKey: string;
}

export type UserItem = {
  userPubKey: PublicKeyString;
  userTokenPubKey: string;
  userMatchTokenPubKey: string;
};

export interface UserRecord extends UserItem {
  matchPubKey: PublicKeyString;
}

export interface Match extends MatchRecord {
  users: UserRecord[];
}

export type WriteMatchArgs = {
  matchPubKeyPair: StringKeyPair;
};

export type MatchArgs = {
  matchPubKey: PublicKeyString;
};

export type UpdateMatchArgs = {
  matchPubKey: PublicKeyString;
  prevMatchState: Match;
  newMatchState: Match;
  removedUsers: UserItem[]
};

export interface UseSolanaGame {
  createMatch(): Promise<PublicKeyString>;
  addSignedUserToMatch(matchPubKey: PublicKeyString, user: UserItem): Promise<void>;
  leaveGame(matchPubKey: PublicKeyString, userPubKey: PublicKeyString): Promise<Result<string>>;
  endGame(matchPubKey: PublicKeyString, winnerPubKey: PublicKeyString): Promise<Option<number>>;
}


export type SolanaGame = SolanaGameServer;

class SolanaGameServer implements UseSolanaGame {
  ioMethods: ResolvedIOMethods;

  constructor(ioMethods: ResolvedIOMethods) {
    this.ioMethods = ioMethods;
  }

  get configJson() {
    return getConfig().configJson;
  }

  /**
   * @returns createMatchResult (CreateMatchResult)
   * public key of the match & method to call after user has signed transaction
   */
  async createMatch() {
    const matchPubKeyPair = makeNewStringKeypair();
    await this.ioMethods.writeMatchRecord({ matchPubKeyPair });
    return matchPubKeyPair.publicKey;
  }

  /**
   * @param matchPubKey (string) public key of the match to add signed user to
   * @param user (UserItem) public key of user & public key of user match token account
   */
  async addSignedUserToMatch(matchPubKey: PublicKeyString, user: UserItem) {
    if (await this.ioMethods.doesMatchExist(matchPubKey)) {
      await this.ioMethods.writeUserRecord({
        ...user,
        matchPubKey,
      });
    }
  }

  async leaveGame(matchPubKey: PublicKeyString, userPubKey: PublicKeyString) {
    const match = await this.ioMethods.getMatch(matchPubKey);
    if (match instanceof Error) {
      return console.error(match);
    }
    if (!match.users.some(x => x.userPubKey === userPubKey)) {
      return console.error("user not found!");
    }
    const { newUsers, user } = match.users.reduce((obj, user) => ({
      newUsers: user.userPubKey !== userPubKey ? [ ...obj.newUsers, user ] : obj.newUsers,
      user: user.userPubKey !== userPubKey ? obj.user : user
    }), { newUsers: [] } as { newUsers: UserRecord[], user?: UserItem });
    if (newUsers.length === 0) {
      const endMatchResult = await this.ioMethods.removeMatch(matchPubKey);
      if (endMatchResult instanceof Error) {
        return console.error(endMatchResult);
      }
    } else {
      const newUsersArr = newUsers.map(x => x.userPubKey);
      await this.ioMethods.removeUserRecords({
        matchPubKey,
        prevMatchState: match,
        newMatchState: {
          matchPubKey,
          secretKey: match.secretKey,
          users: newUsers
        },
        removedUsers: match.users.filter(x => !newUsersArr.includes(x.userPubKey))
      });
    }
    const solanaMatchPubKey = new PublicKey(matchPubKey);
    const solanaUserPubKey = new PublicKey(userPubKey);
    const solanaUserTokenPubKey = new PublicKey(user.userTokenPubKey);
    const solanaUserMatchTokenPubKey = new PublicKey(user.userMatchTokenPubKey);
    const config = getConfig();
    const [ pda, nonce ] = await anchor.web3.PublicKey.findProgramAddress(
      [ solanaMatchPubKey.toBuffer(), solanaUserPubKey.toBuffer() ],
      config.programId
    );
    const leaveArgs: LeaveArgs = {
      accounts: {
        matchAuthority: solanaMatchPubKey,
        lamportRecipient: config.localWallet.payer.publicKey,
        fromTempTokenAccount: solanaUserMatchTokenPubKey,
        toUserTokenAccount: solanaUserTokenPubKey,
        userAccount: solanaUserPubKey,
        programSigner: pda,
        tokenProgram: TOKEN_PROGRAM_ID
      }
    };
    try {
      const txn = await config.program.rpc.leave(new BN(nonce), leaveArgs);
      console.log(txn);
      return txn;
    } catch (e) {
      console.error(e);
      return e;
    }
  }

  async endGame(matchPubKey: PublicKeyString, winner: PublicKeyString) {
    const match = await this.ioMethods.getMatch(matchPubKey);
    if (match instanceof Error) {
      console.error(match);
      return;
    }
    const solanaMatchPubKey = new PublicKey(matchPubKey);
    const solanaWinner = match.users.reduce((a, b) => a.userPubKey === winner ? a : b);
    const solanaWinnerTokenAccountPubKey = new PublicKey(solanaWinner.userTokenPubKey);
    const config = getConfig();
    const balanceBefore = (await config.connection.getTokenAccountBalance(solanaWinnerTokenAccountPubKey)).value.uiAmount;
    const transfers = await Promise.all(match.users
      .filter(x => x.userPubKey !== winner)
      .map(async (x): Promise<[number, TransferTokenArgs]> => {
        const [ pda, nonce ] = await anchor.web3.PublicKey.findProgramAddress(
          [ solanaMatchPubKey.toBuffer(), new PublicKey(x.userPubKey).toBuffer() ],
          config.programId
        );
        console.log(`PubKey: ${x.userPubKey} | PDA: ${pda} | Nonce: ${nonce}`);
        return [ nonce, {
          accounts: {
            fromTokenAccount: new PublicKey(x.userMatchTokenPubKey),
            toTokenAccount: solanaWinnerTokenAccountPubKey,
            matchAuthority: solanaMatchPubKey,
            userAccount: new PublicKey(x.userPubKey),
            programSigner: pda,
            tokenProgram: TOKEN_PROGRAM_ID,
            mint: config.mintPubKey
          }
        }];
      }));
    for (const [ nonce, transfer ] of transfers) {
      try {
        const txn = await config.program.rpc.transferToken(null, new BN(nonce), transfer);
        console.log(`txn: ${txn}`);
      } catch (e) {
        console.error(e);
      }
    }
    const balanceAfter = (await config.connection.getTokenAccountBalance(solanaWinnerTokenAccountPubKey, "confirmed")).value.uiAmount;
    return (balanceAfter != null ? balanceAfter : 0) - (balanceBefore != null ? balanceBefore : 0);
  }
}

export type RpcConnection = Cluster | string;

export interface SolanaGameServerConfig {
  pathToWalletKeyPair: string;
  rpcConnection: RpcConnection
}

interface SolanaGameServerIOMethods {
  writeMatchRecord: ({ matchPubKeyPair }: WriteMatchArgs) => Promise<void>;
  writeUserRecord: ({ matchPubKey, userPubKey, userMatchTokenPubKey }: UserRecord) => Promise<void>;
  getMatchRecord: ({ matchPubKey }: MatchArgs) => Promise<Result<MatchRecord>>;
  getUserRecords: ({ matchPubKey }: MatchArgs) => Promise<Result<UserRecord[]>>;
  removeUserRecords: ({ prevMatchState, newMatchState, matchPubKey, removedUsers }: UpdateMatchArgs) => Promise<void>;
  removeMatch: ({ matchPubKey }: MatchArgs) => Promise<void>;
}

interface ResolvedIOMethods extends Omit<SolanaGameServerIOMethods, "getMatch" | "removeMatch" | "writeMatchRecord" | "updateMatch"> {
  writeMatchRecord: (args: WriteMatchArgs) => Promise<void>
  getMatch: (matchPubKey: PublicKeyString) => Promise<Result<Match>>;
  removeMatch: (matchPubKey: PublicKeyString) => Promise<Result<void>>;
  removeUserRecords: ({ prevMatchState, newMatchState }: UpdateMatchArgs) => Promise<void>;
  doesMatchExist: (matchPubKey: PublicKeyString) => Promise<boolean>;
}

const createSolanaGameServer = (
  config: SolanaGameServerConfig,
  ioMethods: SolanaGameServerIOMethods
): SolanaGame => {
  loadConfig(config);
  return new SolanaGameServer({
    ...ioMethods,
    async doesMatchExist(matchPubKey) {
      const matchResult = await catchWrapper(async () => (
        await ioMethods.getMatchRecord({ matchPubKey })
      ));
      if (matchResult instanceof Error) {
        console.log(matchResult);
        return false;
      }
      return true;
    },
    async writeMatchRecord(args) {
      const writeResult = await catchWrapper(async () =>
        await ioMethods.writeMatchRecord(args)
      );
      if (writeResult instanceof Error) {
        console.error(writeResult);
      }
    },
    async removeUserRecords(args) {
      const updateResult = await catchWrapper(async () =>
        await ioMethods.removeUserRecords(args)
      );
      if (updateResult instanceof Error) {
        console.error(updateResult);
      }
    },
    async getMatch(matchPubKey) {
      return await catchWrapper(async () => {
        const matchRecord = await catchWrapper(async () => (
          await ioMethods.getMatchRecord({ matchPubKey })
        ));
        if (matchRecord instanceof Error) {
          return matchRecord;
        }
        const userRecords = await catchWrapper(async () => (
          await ioMethods.getUserRecords({ matchPubKey })
        ));
        if (userRecords instanceof Error) {
          return userRecords;
        }
        return {
          ...matchRecord,
          users: userRecords
        };
      });
    },
    async removeMatch(matchPubKey) {
      return await catchWrapper(async () =>
        await ioMethods.removeMatch({ matchPubKey })
      );
    },
  });
};

export default createSolanaGameServer;

if (require.main === module) {


}








