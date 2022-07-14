import asyncRedis from "async-redis";
import { Option } from "../../src";
import { makeNewStringKeypair } from "../../src";
import promise_then_catch from "promise-then-catch/lib";
import createSolanaGameServer, { Match, MatchArgs, MatchRecord, UpdateMatchArgs, UserRecord } from "../../src";

const redisClient = asyncRedis.createClient(
  process.env.REDIS_URL ? process.env.REDIS_URL : "redis://216.128.179.112:6379"
);

const gameServer = createSolanaGameServer({
  pathToWalletKeyPair: `${ require("app-root-path").path }/kp.json`,
  rpcConnection: "devnet"
}, {
  writeMatchRecord: async ({ matchPubKeyPair: { publicKey, secretKey } }) => {
    const match: Match = {
      matchPubKey: publicKey,
      secretKey: secretKey,
      users: []
    };
    await redisClient.set(publicKey, JSON.stringify(match));
  },
  writeUserRecord: async (userRecord: UserRecord): Promise<void> => {
    const matchRecord = await redisClient.get(userRecord.matchPubKey);
    const match: Match = JSON.parse(matchRecord);
    if (!match.users.some(x => x.userPubKey === userRecord.userPubKey)) {
      const newMatch: Match = {
        ...match,
        users: [
          ...match.users,
          userRecord
        ]
      };
      await redisClient.set(userRecord.matchPubKey, JSON.stringify(newMatch));
    }
  },
  getMatchRecord: async ({ matchPubKey }: MatchArgs): Promise<Option<MatchRecord>> => {
    const matchRecord = await redisClient.get(matchPubKey);
    if (matchRecord != null) {
      const match = JSON.parse(matchRecord) as Match;
      return {
        matchPubKey: match.matchPubKey,
        secretKey: match.secretKey
      };
    }
  },
  getUserRecords: async ({ matchPubKey }: MatchArgs): Promise<UserRecord[]> => {
    const matchRecord = await redisClient.get(matchPubKey);
    const match = JSON.parse(matchRecord) as Match;
    return match.users;
  },
  removeUserRecords: async ({ matchPubKey, newMatchState }: UpdateMatchArgs): Promise<void> => {
    await redisClient.set(matchPubKey, JSON.stringify(newMatchState));
  },
  removeMatch: async ({ matchPubKey }: MatchArgs): Promise<void> => {
    await redisClient.del(matchPubKey);
  }
});

const test_stuff = async () => {
  const matchPubKey = await gameServer.createMatch();

  // do stuff

  const user = makeNewStringKeypair();
  const userToken = makeNewStringKeypair();
  const userMatchToken = makeNewStringKeypair();
  await gameServer.addSignedUserToMatch(matchPubKey, {
    userPubKey: user.publicKey,
    userTokenPubKey: userToken.publicKey,
    userMatchTokenPubKey: userMatchToken.publicKey,
  });

  // leave

  await gameServer.leaveGame(matchPubKey, user.publicKey);

};

if (require.main === module) {
  promise_then_catch(test_stuff);
}
