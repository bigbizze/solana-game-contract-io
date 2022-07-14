
import { getFirstRow, with_db } from "./db/utils";
import createSolanaGameServer, { MatchArgs, MatchRecord, UpdateMatchArgs, UserRecord } from "../../src";
import { Result } from "../../src";

export const solanaGameServer = createSolanaGameServer({
  pathToWalletKeyPair: `${ require("app-root-path").path }/kp.json`,
  rpcConnection: "devnet"
}, {
  writeMatchRecord: async ({ matchPubKeyPair: { publicKey, secretKey } }) => {
    await with_db(conn => (
      conn.query(`
        INSERT INTO solana.match(matchPubKey, secretKey)
        VALUE(?, ?);
      `.trim(), [ publicKey, secretKey ])
    ));
  },
  writeUserRecord: async (userRecord: UserRecord): Promise<void> => {
    await with_db(conn => (
      conn.query(`
        INSERT INTO solana.user(matchPubKey, userPubKey, userTokenPubKey, userMatchTokenPubKey)
        VALUE(?, ?, ?, ?)
      `.trim(), [ userRecord.matchPubKey, userRecord.userPubKey, userRecord.userTokenPubKey, userRecord.userMatchTokenPubKey ])
    ));
  },
  getMatchRecord: async ({ matchPubKey }: MatchArgs): Promise<Result<MatchRecord>> => {
    const match = await with_db(async conn => {
      const rows = await conn.query(`
        SELECT * FROM solana.match
        WHERE matchPubKey = ?
        LIMIT 1
      `.trim(), [ matchPubKey ]);
      return getFirstRow<MatchRecord>(rows);
    });
    if (!match) {
      return new Error(`got null for getMatchRecord`);
    }
    return {
      matchPubKey: match.matchPubKey,
      secretKey: match.secretKey
    };
  },
  getUserRecords: async ({ matchPubKey }: MatchArgs): Promise<Result<UserRecord[]>> => {
    const users = await with_db<UserRecord[]>(async conn => (
      await conn.query(`
        SELECT * FROM solana.user
        WHERE matchPubKey = ?
      `.trim(), [ matchPubKey ])
    ));
    if (!Array.isArray(users) || users.length === 0) {
      return new Error(`got no users for getUserRecords`);
    }
    return users;
  },
  removeUserRecords: async ({ removedUsers }: UpdateMatchArgs): Promise<void> => {
    await with_db(async conn => {
      const questions = Array.from(Array(removedUsers.length), () => "?").join(", ");
      const removed = removedUsers.map(x => x.userPubKey);
      await conn.query(`
        DELETE FROM solana.user
        WHERE userPubKey in (${questions})
      `.trim(), [ ...removed ]);
    });
  },
  removeMatch: async ({ matchPubKey }: MatchArgs): Promise<void> => {
    await with_db(conn => (
      conn.query(`
        DELETE FROM solana.match
        WHERE matchPubKey = ?
      `.trim(), [ matchPubKey ])
    ));
  }
});

