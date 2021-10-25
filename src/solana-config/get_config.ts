import * as idl from "./unlucky.json";
import * as program_info from "./program_info.json";
import { Program } from "./contract_type";
import * as anchor from "@project-serum/anchor";
import { Provider } from "@project-serum/anchor";
import { Cluster, clusterApiUrl, Connection, PublicKey } from "@solana/web3.js";
import { NodeWallet } from "@project-serum/anchor/dist/cjs/provider";
import { isTypeOne } from "../utils/general";
import { RpcConnection, SolanaGameServerConfig } from "../index";

type IdlType = typeof idl;
type ProgramInfoType = typeof program_info;

// tslint:disable-next-line:no-unused-expression
export interface ConfigJson extends ProgramInfoType {
  idl: IdlType
}

const clusterKinds: string[] = [ 'devnet', 'testnet', 'mainnet-beta' ];
const getConnection = (rpcConnection: RpcConnection) => {
  if (isTypeOne<Cluster, string>(rpcConnection, clusterKinds.includes(rpcConnection))) {
    return new Connection(clusterApiUrl(rpcConnection), "processed");
  } else {
    return new Connection(rpcConnection, "processed");
  }
};

class MakeConfig {
  ["_mintKey"]: PublicKey;
  ["_wallet"]: NodeWallet;
  ["_rpcConnection"]: string;
  constructor(config: SolanaGameServerConfig) {
    this._rpcConnection = config.rpcConnection;
    process.env.ANCHOR_WALLET = config.pathToWalletKeyPair;
    this._wallet = NodeWallet.local();
    this._connection = getConnection(config.rpcConnection);
    this._provider = new anchor.Provider(
      this._connection,
      this._wallet,
      { commitment: "processed" }
    );
    anchor.setProvider(this._provider);
    this._programId = new PublicKey(program_info.programId);
    this._mintKey = new PublicKey(program_info.mintKey);
    this._configJson = {
      idl,
      programId: program_info.programId,
      mintKey: program_info.mintKey
    };
    // @ts-ignore
    this._program = new anchor.Program(idl, this._programId) as unknown as Program;
  }

  ["_programId"]: PublicKey;

  get programId(): PublicKey {
    return new PublicKey(this._programId);
  }

  ["_provider"]: Provider;

  get provider(): Provider {
    return this._provider;
  }

  ["_connection"]: Connection;

  get connection(): Connection {
    return this._connection;
  }

  ["_program"]: Program;

  get program(): Program {
    return this._program;
  }

  ["_configJson"]: ConfigJson;

  get configJson(): ConfigJson {
    return this._configJson;
  }

  get localWallet(): NodeWallet {
    return this._wallet;
  }

  get mintPubKey(): PublicKey {
    return new PublicKey(this._mintKey);
  }
}

export let config: MakeConfig | null = null;

export const getConfig = (config2?: SolanaGameServerConfig) => {
  if (config !== null) {
    return config;
  } else if (config2 != null) {
    config = new MakeConfig(config2);
    return config;
  }
  throw new Error("never initialized configuration!");
};

export const loadConfig = getConfig;


