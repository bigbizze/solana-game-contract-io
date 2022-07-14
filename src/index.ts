import asyncRedis from "async-redis";
import { Option, Result } from "./shared-types";
import { makeNewStringKeypair } from "./utils/keypair";
import createSolanaGameServer, { Match, MatchArgs, MatchRecord, UpdateMatchArgs, UserRecord, SolanaGameChainIo } from "./solana-game-contract-io";

/** exporting this because their .d.ts files are a disaster */
export { asyncRedis };

export { makeNewStringKeypair };

export { Option, Result, Match, MatchArgs, MatchRecord, UpdateMatchArgs, UserRecord, SolanaGameChainIo }

export default createSolanaGameServer;
