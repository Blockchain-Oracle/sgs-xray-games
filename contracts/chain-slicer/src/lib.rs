/*
    This file is part of xray-games project.
    Licensed under the MIT License.
    Author: Fred Kyung-jin Rezeau (오경진 吳景振) <hello@kyungj.in>
*/

#![no_std]

mod attestation;
mod circuit;
mod slicer;
mod storage;
mod types;
mod zk;

use soroban_sdk::{contract, contractclient, contractimpl, Address, Bytes, BytesN, Env};
use types::{Error, Game};

#[contractclient(name = "GameHubClient")]
pub trait GameHub {
    fn start_game(
        env: Env,
        game_id: Address,
        session_id: u32,
        player1: Address,
        player2: Address,
        player1_points: i128,
        player2_points: i128,
    );

    fn end_game(env: Env, session_id: u32, player1_won: bool);
}

#[contract]
pub struct ChainSlicerContract;

#[contractimpl]
impl ChainSlicerContract {
    pub fn __constructor(env: Env, admin: Address, game_hub: Address) {
        storage::set_admin(&env, &admin);
        storage::set_hub(&env, &game_hub);
    }

    pub fn start_game(env: Env, session_id: u32, player1: Address,
        player2: Address, player1_points: i128, player2_points: i128) -> Result<(), Error> {
        slicer::start_game(&env, session_id, player1, player2, player1_points, player2_points)
    }

    pub fn prove(env: Env, session_id: u32, player: Address,
        proof: Bytes, attestation: Bytes) -> Result<Address, Error> {
        slicer::prove(&env, session_id, player, proof, attestation)
    }

    pub fn get_game(env: Env, session_id: u32) -> Result<Game, Error> {
        storage::get_game(&env, session_id).ok_or(Error::GameNotFound)
    }

    pub fn get_admin(env: Env) -> Address {
        storage::get_admin(&env)
    }

    pub fn set_admin(env: Env, new_admin: Address) {
        slicer::set_admin(&env, new_admin)
    }

    pub fn get_hub(env: Env) -> Address {
        storage::get_hub(&env).expect("GameHub address not set")
    }

    pub fn set_hub(env: Env, new_hub: Address) {
        slicer::set_hub(&env, new_hub)
    }

    pub fn upgrade(env: Env, hash: BytesN<32>) -> Result<(), Error> {
        slicer::upgrade(&env, hash)
    }
}

#[cfg(test)]
mod test;
