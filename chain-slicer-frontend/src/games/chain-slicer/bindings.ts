import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}





export interface Game {
  nonce: u64;
  player1: string;
  player1_points: i128;
  player1_score: Option<u32>;
  player2: string;
  player2_points: i128;
  player2_score: Option<u32>;
  seed: u256;
  timestamp: u64;
  winner: Option<string>;
}

export const Errors = {
  1: {message:"NotInitialized"},
  6: {message:"GameNotFound"},
  7: {message:"NotPlayer"},
  8: {message:"GameAlreadyEnded"}
}

export type Backend = {tag: "Circom", values: void} | {tag: "Noir", values: void};

export type DataKey = {tag: "Admin", values: void} | {tag: "GameHubAddress", values: void} | {tag: "Attestor", values: void} | {tag: "Game", values: readonly [u32]};

export interface Client {
  /**
   * Construct and simulate a prove transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  prove: ({session_id, player, proof, attestation}: {session_id: u32, player: string, proof: Buffer, attestation: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<string>>>

  /**
   * Construct and simulate a get_hub transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_hub: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a set_hub transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_hub: ({new_hub}: {new_hub: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a upgrade transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  upgrade: ({hash}: {hash: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_game transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_game: ({session_id}: {session_id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Game>>>

  /**
   * Construct and simulate a get_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_admin: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a set_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_admin: ({new_admin}: {new_admin: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a start_game transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  start_game: ({session_id, player1, player2, player1_points, player2_points}: {session_id: u32, player1: string, player2: string, player1_points: i128, player2_points: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
        /** Constructor/Initialization Args for the contract's `__constructor` method */
        {admin, game_hub}: {admin: string, game_hub: string},
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({admin, game_hub}, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAAAAAAAAAAAAAFcHJvdmUAAAAAAAAEAAAAAAAAAApzZXNzaW9uX2lkAAAAAAAEAAAAAAAAAAZwbGF5ZXIAAAAAABMAAAAAAAAABXByb29mAAAAAAAADgAAAAAAAAALYXR0ZXN0YXRpb24AAAAADgAAAAEAAAPpAAAAEwAAAAM=",
        "AAAAAAAAAAAAAAAHZ2V0X2h1YgAAAAAAAAAAAQAAABM=",
        "AAAAAAAAAAAAAAAHc2V0X2h1YgAAAAABAAAAAAAAAAduZXdfaHViAAAAABMAAAAA",
        "AAAAAAAAAAAAAAAHdXBncmFkZQAAAAABAAAAAAAAAARoYXNoAAAD7gAAACAAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAAAAAAAAIZ2V0X2dhbWUAAAABAAAAAAAAAApzZXNzaW9uX2lkAAAAAAAEAAAAAQAAA+kAAAfQAAAABEdhbWUAAAAD",
        "AAAAAAAAAAAAAAAJZ2V0X2FkbWluAAAAAAAAAAAAAAEAAAAT",
        "AAAAAAAAAAAAAAAJc2V0X2FkbWluAAAAAAAAAQAAAAAAAAAJbmV3X2FkbWluAAAAAAAAEwAAAAA=",
        "AAAAAAAAAAAAAAAKc3RhcnRfZ2FtZQAAAAAABQAAAAAAAAAKc2Vzc2lvbl9pZAAAAAAABAAAAAAAAAAHcGxheWVyMQAAAAATAAAAAAAAAAdwbGF5ZXIyAAAAABMAAAAAAAAADnBsYXllcjFfcG9pbnRzAAAAAAALAAAAAAAAAA5wbGF5ZXIyX3BvaW50cwAAAAAACwAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAAAAAAANX19jb25zdHJ1Y3RvcgAAAAAAAAIAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAIZ2FtZV9odWIAAAATAAAAAA==",
        "AAAAAQAAAAAAAAAAAAAABEdhbWUAAAAKAAAAAAAAAAVub25jZQAAAAAAAAYAAAAAAAAAB3BsYXllcjEAAAAAEwAAAAAAAAAOcGxheWVyMV9wb2ludHMAAAAAAAsAAAAAAAAADXBsYXllcjFfc2NvcmUAAAAAAAPoAAAABAAAAAAAAAAHcGxheWVyMgAAAAATAAAAAAAAAA5wbGF5ZXIyX3BvaW50cwAAAAAACwAAAAAAAAANcGxheWVyMl9zY29yZQAAAAAAA+gAAAAEAAAAAAAAAARzZWVkAAAADAAAAAAAAAAJdGltZXN0YW1wAAAAAAAABgAAAAAAAAAGd2lubmVyAAAAAAPoAAAAEw==",
        "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAABAAAAAAAAAAOTm90SW5pdGlhbGl6ZWQAAAAAAAEAAAAAAAAADEdhbWVOb3RGb3VuZAAAAAYAAAAAAAAACU5vdFBsYXllcgAAAAAAAAcAAAAAAAAAEEdhbWVBbHJlYWR5RW5kZWQAAAAI",
        "AAAAAgAAAAAAAAAAAAAAB0JhY2tlbmQAAAAAAgAAAAAAAAAAAAAABkNpcmNvbQAAAAAAAAAAAAAAAAAETm9pcg==",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAABAAAAAAAAAAAAAAABUFkbWluAAAAAAAAAAAAAAAAAAAOR2FtZUh1YkFkZHJlc3MAAAAAAAAAAAAAAAAACEF0dGVzdG9yAAAAAQAAAAAAAAAER2FtZQAAAAEAAAAE" ]),
      options
    )
  }
  public readonly fromJSON = {
    prove: this.txFromJSON<Result<string>>,
        get_hub: this.txFromJSON<string>,
        set_hub: this.txFromJSON<null>,
        upgrade: this.txFromJSON<Result<void>>,
        get_game: this.txFromJSON<Result<Game>>,
        get_admin: this.txFromJSON<string>,
        set_admin: this.txFromJSON<null>,
        start_game: this.txFromJSON<Result<void>>
  }
}