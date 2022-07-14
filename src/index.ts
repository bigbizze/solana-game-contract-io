import asyncRedis from "async-redis";
import { Option, Result } from "./shared-types";
import { makeNewStringKeypair } from "./utils/keypair";
import createSolanaGameServer, { Match, MatchArgs, MatchRecord, UpdateMatchArgs, UserRecord } from "./solana-game-contract-io";

export { asyncRedis, Option, Result, makeNewStringKeypair, Match, MatchArgs, MatchRecord, UpdateMatchArgs, UserRecord }

export default createSolanaGameServer;
