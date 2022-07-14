// import * as idl from "./unlucky.json";
// import * as program_info from "./program_info.json";
import { Program } from "./contract_type";
import * as anchor from "@project-serum/anchor";
import { Provider } from "@project-serum/anchor";
import { Cluster, clusterApiUrl, Connection, PublicKey } from "@solana/web3.js";
import { NodeWallet } from "@project-serum/anchor/dist/cjs/provider";
import { isTypeOne, sleep } from "../utils/general";
import fetch from "node-fetch";
import { loadEncrypt } from "../utils/encrypt";
import { RpcConnection, SolanaGameServerConfig } from "../solana-game-contract-io";

type ProgramInfoType = {
  programId: string;
  mintKey: string
};

// tslint:disable-next-line:no-unused-expression
export interface ConfigJson extends ProgramInfoType {
  idl: any;
}

const clusterKinds: string[] = [ 'devnet', 'testnet', 'mainnet-beta' ];
const getConnection = (rpcConnection: RpcConnection) => {
  if (isTypeOne<Cluster, string>(rpcConnection, clusterKinds.includes(rpcConnection))) {
    return new Connection(clusterApiUrl(rpcConnection), "processed");
  } else {
    return new Connection(rpcConnection, "processed");
  }
};

let configJson: ConfigJson | null = null;

async function reqSpec(attempts = 0): Promise<ConfigJson> {
  try {
    const res = await fetch("https://raw.githubusercontent.com/bigbizze/solana-gamble-game-config/master/solana-gamble-game-config.json"); // TODO: parameterize this
    if (res.ok) {
      return JSON.parse(await res.text());
    }
  } catch (e) {
    if (attempts > 15) {
      throw e;
    }
    await new Promise(r => setTimeout(r, 1000 * (attempts + 1)));
    return await this.reqSpec(attempts + 1);
  }
}

reqSpec()
  .then(res => configJson = res)
  .catch(e => console.error(e));

class MakeConfig<M> {
  ["_mintKey"]: PublicKey;
  ["_wallet"]: NodeWallet;
  ["_rpcConnection"]: string;
  ["_programId"]: PublicKey;
  ["_provider"]: Provider;
  ["_connection"]: Connection;
  ["_program"]: Program;
  ["_configJson"]: ConfigJson;

  constructor(config: SolanaGameServerConfig<M>) {
    this.buildConfig(config)
      .catch(e => console.log(e));
  }

  async buildConfig(config: SolanaGameServerConfig<M>) {
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
    await this._waitForConfig();
    const { idl, programId, mintKey } = configJson;
    this._programId = new PublicKey(programId);
    this._mintKey = new PublicKey(mintKey);
    this._configJson = {
      idl,
      programId,
      mintKey
    };
    // @ts-ignore
    this._program = new anchor.Program(idl, this._programId) as unknown as Program;
  }

  async ["_waitForConfig"]() {
    while (configJson === null) {
      await sleep(200);
    }
  }

  async programId(): Promise<PublicKey> {
    await this._waitForConfig();
    return new PublicKey(this._programId);
  }

  async provider(): Promise<Provider> {
    await this._waitForConfig();
    return this._provider;
  }

  async connection(): Promise<Connection> {
    await this._waitForConfig();
    return this._connection;
  }

  async program(): Promise<Program> {
    await this._waitForConfig();
    return this._program;
  }

  async configJson(): Promise<ConfigJson> {
    await this._waitForConfig();
    return this._configJson;
  }

  async localWallet(): Promise<NodeWallet> {
    await this._waitForConfig();
    return this._wallet;
  }

  async mintPubKey(): Promise<PublicKey> {
    await this._waitForConfig();
    return new PublicKey(this._mintKey);
  }
}

export let config: MakeConfig<any> | null = null;

export const getConfig = <M>(gamePassword?: string, config2?: SolanaGameServerConfig<M>) => {
  if (config !== null) {
    return config;
  } else if (config2 != null && gamePassword != null) {
    loadEncrypt(gamePassword);
    config = new MakeConfig(config2);
    return config;
  }
  throw new Error("never initialized configuration!");
};

export const loadConfig = getConfig;


