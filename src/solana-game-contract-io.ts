import { makeNewStringKeypair, PublicKeyString, StringKeyPair } from "./utils/keypair";
import { Cluster, PublicKey } from "@solana/web3.js";
import { getConfig, loadConfig } from "./solana-config/get_config";
import * as anchor from "@project-serum/anchor";
import { BN } from "@project-serum/anchor";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { catchWrapper } from "./utils/general";
import { LeaveArgs, TransferTokenArgs } from "./solana-config/contract_type";
import { decrypt, encrypt } from "./utils/encrypt";
import { Result } from "./shared-types";

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

export type WriteMatchArgs<M> = {
  matchPubKeyPair: StringKeyPair;
  matchType: M
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

export type TransferUserArgs = {
  type: "UserToken" | "UserMatchToken",
  userPubKey: PublicKeyString
};

export type AvailableMatches<M> = { matchPubKeys: string[], matchType: M };

export interface UseSolanaGame<M> {
  createMatch(matchType: M): Promise<PublicKeyString>;

  getAvailableMatches(matchType: M): Promise<AvailableMatches<M>>;

  addSignedUserToMatch(matchPubKey: PublicKeyString, user: UserItem): Promise<void>;

  leaveGame(matchPubKey: PublicKeyString, userPubKey: PublicKeyString): Promise<Result<string>>;

  transfer(matchPubKey: PublicKeyString, fromTokenAccPubKey: TransferUserArgs, toTokenAccPubKey: TransferUserArgs): Promise<void>;

  transferAllToWinner(matchPubKey: PublicKeyString, winnerPubKey: PublicKeyString): Promise<void>;
}


// export type SolanaGame = SolanaGameServer;

export class SolanaGameChainIo<M> implements UseSolanaGame<M> {
  ioMethods: ResolvedIOMethods<M>;

  constructor(ioMethods: ResolvedIOMethods<M>) {
    this.ioMethods = ioMethods;
  }

  static isValidPubKey(pubKey: string | PublicKey): boolean {
    const _pubKey = typeof pubKey === "string" ? new PublicKey(decrypt(pubKey)) : pubKey;
    return anchor.web3.PublicKey.isOnCurve(_pubKey.toBytes());
  }

  /**
   * @returns createMatchResult (CreateMatchResult)
   * public key of the match & method to call after user has signed transaction
   */
  async createMatch(matchType: M) {
    const matchPubKeyPair = makeNewStringKeypair();
    await this.ioMethods.writeMatchRecord({ matchPubKeyPair, matchType });
    return encrypt(matchPubKeyPair.publicKey);
  }

  async getAvailableMatches(matchType: M) {
    const res = await this.ioMethods.getMatchRecordsByMatchType({ matchType });
    if (res instanceof Error) {
      throw res;
    }
    return res.reduce((obj, y) => ({
      ...obj,
      matchPubKeys: [
        ...obj.matchPubKeys,
        encrypt(y.matchPubKey)
      ]
    }), { matchPubKeys: [], matchType } as AvailableMatches<M>);
  }

  /**
   * @param matchPubKey (string) public key of the match to add signed user to
   * @param user (UserItem) public key of user & public key of user match token account
   */
  async addSignedUserToMatch(matchPubKey: PublicKeyString, user: UserItem) {
    const _matchPubKey = decrypt(matchPubKey);
    if (await this.ioMethods.doesMatchExist(_matchPubKey)) {
      await this.ioMethods.writeUserRecord({
        ...user,
        matchPubKey: _matchPubKey
      });
    }
  }

  async leaveGame(matchPubKey: PublicKeyString, userPubKey: PublicKeyString) {
    const _matchPubKey = decrypt(matchPubKey);
    const match = await this.ioMethods.getMatch(_matchPubKey);
    if (match instanceof Error) {
      /** TODO: these need to be thrown to external callers so that we don't give people headaches
       */
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
      const endMatchResult = await this.ioMethods.removeMatch(_matchPubKey);
      if (endMatchResult instanceof Error) {
        return console.error(endMatchResult);
      }
    } else {
      const newUsersArr = newUsers.map(x => x.userPubKey);
      await this.ioMethods.removeUserRecords({
        matchPubKey: _matchPubKey,
        prevMatchState: match,
        newMatchState: {
          matchPubKey: _matchPubKey,
          secretKey: match.secretKey,
          users: newUsers
        },
        removedUsers: match.users.filter(x => !newUsersArr.includes(x.userPubKey))
      });
    }
    const solanaMatchPubKey = new PublicKey(_matchPubKey);
    const solanaUserPubKey = new PublicKey(userPubKey);
    const solanaUserTokenPubKey = new PublicKey(user.userTokenPubKey);
    const solanaUserMatchTokenPubKey = new PublicKey(user.userMatchTokenPubKey);
    const config = getConfig();
    const [ pda, nonce ] = await anchor.web3.PublicKey.findProgramAddress(
      [ solanaMatchPubKey.toBuffer(), solanaUserPubKey.toBuffer() ],
      await config.programId()
    );
    const leaveArgs: LeaveArgs = {
      accounts: {
        matchAuthority: solanaMatchPubKey,
        lamportRecipient: (await config.localWallet()).payer.publicKey,
        fromTempTokenAccount: solanaUserMatchTokenPubKey,
        toUserTokenAccount: solanaUserTokenPubKey,
        userAccount: solanaUserPubKey,
        programSigner: pda,
        tokenProgram: TOKEN_PROGRAM_ID
      }
    };
    try {
      const txn = await (await config.program()).rpc.leave(new BN(nonce), leaveArgs);
      console.log(txn);
      return txn;
    } catch (e) {
      console.error(e);
      return e;
    }
  }

  /** TODO: This needs an optional amount argument
   */
  async transfer(matchPubKey: PublicKeyString, fromTokenAccPubKey: TransferUserArgs, toTokenAccPubKey: TransferUserArgs) {
    const _matchPubKey = decrypt(matchPubKey);
    const match = await this.ioMethods.getMatch(_matchPubKey);
    if (match instanceof Error) {
      console.error(match);
      return;
    } else if (!match.users.some(x => x.userPubKey === fromTokenAccPubKey.userPubKey) || !match.users.some(x => x.userPubKey === toTokenAccPubKey.userPubKey)) {
      console.error("got a user in transfer which isn't in the match!");
      return;
    }
    const filteredUsers = match.users
      .filter(x => x.userPubKey === fromTokenAccPubKey.userPubKey || x.userPubKey === toTokenAccPubKey.userPubKey);
    if (filteredUsers.length !== 2) {
      console.error(`matched too many users for transfer! (this should never happen :\\)`);
      return;
    }
    const orderedFilteredUsers = filteredUsers[0].userPubKey === fromTokenAccPubKey.userPubKey ? filteredUsers : [ filteredUsers[1], filteredUsers[0] ];
    const [ fromToken, toToken ] = [
      fromTokenAccPubKey.type === "UserMatchToken" ? orderedFilteredUsers[0].userMatchTokenPubKey : orderedFilteredUsers[0].userTokenPubKey,
      toTokenAccPubKey.type === "UserMatchToken" ? orderedFilteredUsers[1].userMatchTokenPubKey : orderedFilteredUsers[1].userTokenPubKey
    ];

    // const { fromToken, toToken } = filteredUsers
    //   .reduce((obj, y) => {
    //     const isFrom = fromTokenAccPubKey.userPubKey === y.userPubKey;
    //     const isMatchToken = (isFrom ? fromTokenAccPubKey : toTokenAccPubKey).type === "UserMatchToken";
    //     const token = isMatchToken ? y.userMatchTokenPubKey : y.userTokenPubKey;
    //     const res = isFrom ? { fromToken: token } : { toToken: token };
    //     return {
    //       ...obj,
    //       ...res
    //     };
    //   }, { fromToken: "", toToken: "" });
    const solanaMatchPubKey = new PublicKey(_matchPubKey);
    const solanaUserPubKey = new PublicKey(orderedFilteredUsers[0].userPubKey);
    const config = getConfig();
    const [ pda, nonce ] = await anchor.web3.PublicKey.findProgramAddress(
      [ solanaMatchPubKey.toBuffer(), solanaUserPubKey.toBuffer() ],
      (await config.programId())
    );
    const transfer: TransferTokenArgs = {
      accounts: {
        fromTokenAccount: new PublicKey(fromToken),
        toTokenAccount: new PublicKey(toToken),
        matchAuthority: solanaMatchPubKey,
        userAccount: solanaUserPubKey,
        programSigner: pda,
        tokenProgram: TOKEN_PROGRAM_ID,
        mint: (await config.mintPubKey())
      }
    };
    try {
      const txn = await (await config.program()).rpc.transferToken(null, new BN(nonce), transfer);
      console.log(`txn: ${ txn }`);
    } catch (e) {
      console.error(e);
    }
  }

  async transferAllToWinner(matchPubKey: PublicKeyString, winner: PublicKeyString) {
    const _matchPubKey = decrypt(matchPubKey);
    const match = await this.ioMethods.getMatch(_matchPubKey);
    if (match instanceof Error) {
      console.error(match);
      return;
    }
    const solanaMatchPubKey = new PublicKey(_matchPubKey);
    const solanaWinner = match.users.reduce((a, b) => a.userPubKey === winner ? a : b);
    const solanaWinnerTokenAccountPubKey = new PublicKey(solanaWinner.userTokenPubKey);
    const config = getConfig();
    // const balanceBefore = (await (await config.connection()).getTokenAccountBalance(solanaWinnerTokenAccountPubKey)).value.uiAmount;
    const transfers = await Promise.all(match.users
      .filter(x => x.userPubKey !== winner)
      .map(async (x): Promise<[ number, TransferTokenArgs ]> => {
        const [ pda, nonce ] = await anchor.web3.PublicKey.findProgramAddress(
          [ solanaMatchPubKey.toBuffer(), new PublicKey(x.userPubKey).toBuffer() ],
          (await config.programId())
        );
        console.log(`PubKey: ${ x.userPubKey } | PDA: ${ pda } | Nonce: ${ nonce }`);
        return [ nonce, {
          accounts: {
            fromTokenAccount: new PublicKey(x.userMatchTokenPubKey),
            toTokenAccount: solanaWinnerTokenAccountPubKey,
            matchAuthority: solanaMatchPubKey,
            userAccount: new PublicKey(x.userPubKey),
            programSigner: pda,
            tokenProgram: TOKEN_PROGRAM_ID,
            mint: (await config.mintPubKey())
          }
        } ];
      }));
    for (const [ nonce, transfer ] of transfers) {
      try {
        const txn = await (await config.program()).rpc.transferToken(null, new BN(nonce), transfer);
        console.log(`txn: ${ txn }`);
      } catch (e) {
        console.error(e);
      }
    }
    // const balanceAfter = (await (await config.connection()).getTokenAccountBalance(solanaWinnerTokenAccountPubKey, "confirmed")).value.uiAmount;
    // return (balanceAfter != null ? balanceAfter : 0) - (balanceBefore != null ? balanceBefore : 0);
  }
}

export type RpcConnection = Cluster | string;

export interface SolanaGameServerConfig<M> {
  pathToWalletKeyPair: string;
  rpcConnection: RpcConnection;
  matchTypes: M[];
}

interface SolanaGameServerIOMethods<M> {
  writeMatchRecord: ({ matchPubKeyPair }: WriteMatchArgs<M>) => Promise<void>;
  writeUserRecord: ({ matchPubKey, userPubKey, userMatchTokenPubKey }: UserRecord) => Promise<void>;
  getMatchRecordByPubKey: ({ matchPubKey }: MatchArgs) => Promise<Result<MatchRecord>>;
  getMatchRecordsByMatchType: ({ matchType }: { matchType: M }) => Promise<Result<MatchRecord[]>>;
  getUserRecords: ({ matchPubKey }: MatchArgs) => Promise<Result<UserRecord[]>>;
  removeUserRecords: ({ prevMatchState, newMatchState, matchPubKey, removedUsers }: UpdateMatchArgs) => Promise<void>;
  removeMatch: ({ matchPubKey }: MatchArgs) => Promise<void>;
}

interface ResolvedIOMethods<M> extends Omit<SolanaGameServerIOMethods<M>, "getMatch" | "removeMatch" | "writeMatchRecord" | "updateMatch"> {
  writeMatchRecord: (args: WriteMatchArgs<M>) => Promise<void>;
  getMatch: (matchPubKey: PublicKeyString) => Promise<Result<Match>>;
  getMatchesByType: (matchType: M) => Promise<Result<MatchRecord[]>>;
  removeMatch: (matchPubKey: PublicKeyString) => Promise<Result<void>>;
  removeUserRecords: ({ prevMatchState, newMatchState }: UpdateMatchArgs) => Promise<void>;
  doesMatchExist: (matchPubKey: PublicKeyString) => Promise<boolean>;
}

const createSolanaGameServer = <M>(
  config: SolanaGameServerConfig<M>,
  ioMethods: SolanaGameServerIOMethods<typeof config["matchTypes"][number]>,
  passKey: string
): SolanaGameChainIo<typeof config["matchTypes"][number]> => {
  loadConfig(passKey, config);
  return new SolanaGameChainIo({
    ...ioMethods,
    async doesMatchExist(matchPubKey) {
      const matchResult = await catchWrapper(async () => (
        await ioMethods.getMatchRecordByPubKey({ matchPubKey })
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
    async getMatchesByType(matchType) {
      const matchesResult = await catchWrapper(async () =>
        await ioMethods.getMatchRecordsByMatchType({ matchType })
      );
      if (matchesResult instanceof Error) {
        return matchesResult;
      }
      return matchesResult;
    },
    async getMatch(matchPubKey) {
      return await catchWrapper(async () => {
        const matchRecord = await catchWrapper(async () => (
          await ioMethods.getMatchRecordByPubKey({ matchPubKey })
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
    }
  });
};

export default createSolanaGameServer;









