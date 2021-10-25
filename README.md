# use-solana-game-contract-io
An interface for interoperating with the Solana program associated with a betting & gambling game platform which is yet unnamed.
Currently a work in progress / unfinished.

### Full examples:
[MariaDB](https://github.com/bigbizze/use-solana-game-contract-io/tree/master/examples/mariadb-example)

[Redis](https://github.com/bigbizze/use-solana-game-contract-io/tree/master/examples/redis-example)

### How to use
Specify the path to the server's wallet keypair, as well as configuration for how to write & read persisted data about matches (in the future not specifying this will default to creating a sqlite file)
```ts
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
```

Use the solanaGameServer instance to interact with the contract on the Solana blockchain

Create a new match and get an ID for it:
```ts
const matchPubKey = await solanaGameServer.createMatch();
```

Once a user has signed the txn to join the match using this match ID (matchPubKey) on the client, and has returned the user's public key, the public key for the user's token account for the relevant game token mint & the public key of a temporary token account for the match from the same mint, add them to the data store
```ts
await solanaGameServer.addSignedUserToMatch(joinSuccessArgs.matchPubKey, { userPubKey, userTokenPubKey, userMatchTokenPubKey })
```

Remove a user from the match
```ts
await solanaGameServer.leaveGame(matchPubKey, userPubKey);
```

End the game, transferring all of the tokens from the temporary match token accounts for the users in a match to the winner
```ts
const winnings = await solanaGameServer.endGame(matchPubKey, maybeIsWinner);
```



