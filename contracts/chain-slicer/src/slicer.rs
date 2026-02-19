/*
    This file is part of xray-games project.
    Licensed under the MIT License.
    Author: Fred Kyung-jin Rezeau (오경진 吳景振) <hello@kyungj.in>
*/

use crate::attestation::verify_attestation;
use crate::circuit;
use crate::storage;
use crate::types::{Error, Game, Backend, GameParams};
use crate::zk::{verify_groth16, SeedGenerator};
use crate::GameHubClient;
use soroban_sdk::{Address, Bytes, BytesN, Env, IntoVal, vec};

const PARAMS: GameParams = GameParams::default();

pub(crate) fn verify(env: &Env, game: &Game, proof: &Bytes, attestation_data: &Bytes) -> u32 {
    if proof.len() == 0 || attestation_data.len() == 0 {
        return 0;
    }

    let attestor = BytesN::from_array(env, &PARAMS.attestor);
    let verified = verify_attestation(env, attestation_data, &attestor);
    if verified.seed != game.seed {
        return 0;
    }

    let (raw, public_inputs, outputs) = circuit::extract(env, proof);
    let hash: BytesN<32> = outputs.level_hash.to_be_bytes().try_into().unwrap();
    let backend = circuit::get_backend(&hash, &verified);
    match backend {
        Backend::Circom => {
            if !verify_groth16(env, &circuit::KEYS, &raw, &public_inputs) {
                return 0;
            }
        }
        Backend::Noir => {
            storage::get_admin(env).require_auth();
        }
    }

    calculate_score(outputs.polygon_count, outputs.object_count, outputs.partition_count)
}

pub(crate) fn calculate_score(polygons: u32, objects: u32, partitions: u32) -> u32 {
    let base = polygons * 30 + objects * 8;
    let bonus = if partitions > objects {
        (partitions - objects) * 15
    } else {
        0
    };
    base + bonus
}

pub fn start_game(env: &Env, session_id: u32, player1: Address,
    player2: Address, player1_points: i128, player2_points: i128) -> Result<(), Error> {
    if !storage::has_admin(env) {
        return Err(Error::NotInitialized);
    }

    if player1 == player2 {
        panic!("Cannot play against yourself: Player 1 and Player 2 must be different addresses");
    }

    player1.require_auth_for_args(
        vec![env, session_id.into_val(env), player1_points.into_val(env)],
    );
    player2.require_auth_for_args(
        vec![env, session_id.into_val(env), player2_points.into_val(env)],
    );

    if let Some(hub_addr) = storage::get_hub(env) {
        let game_hub = GameHubClient::new(env, &hub_addr);
        game_hub.start_game(
            &env.current_contract_address(),
            &session_id,
            &player1,
            &player2,
            &player1_points,
            &player2_points,
        );
    }

    let nonce: u64 = env.prng().gen();
    let generator = SeedGenerator::new(env);
    let seed = generator.generate(&player1, nonce);
    let now = env.ledger().timestamp();
    let game = Game {
        player1,
        player2,
        player1_points,
        player2_points,
        player1_score: None,
        player2_score: None,
        winner: None,
        seed,
        nonce,
        timestamp: now,
    };

    storage::set_game(env, session_id, &game);
    Ok(())
}

pub fn prove(env: &Env, session_id: u32, player: Address,
    proof: Bytes, attestation: Bytes) -> Result<Address, Error> {
    if !storage::has_admin(env) {
        return Err(Error::NotInitialized);
    }

    let mut game = storage::get_game(env, session_id).ok_or(Error::GameNotFound)?;
    if game.winner.is_some() {
        return Err(Error::GameAlreadyEnded);
    }

    let now = env.ledger().timestamp();
    let duration = PARAMS.duration;
    if game.player1_score.is_none() {
        let expired = now > game.timestamp + duration;
        if !expired {
            if player != game.player1 {
                return Err(Error::NotPlayer);
            }
            player.require_auth();
            game.player1_score = Some(verify(env, &game, &proof, &attestation));
        } else {
            game.player1_score = Some(0);
        }

        game.timestamp = now;
        storage::set_game(env, session_id, &game);
        return Ok(game.player1.clone());
    }

    if game.player2_score.is_none() {
        let expired = now > game.timestamp + duration;
        if !expired {
            if player != game.player2 {
                return Err(Error::NotPlayer);
            }
            player.require_auth();
            game.player2_score = Some(verify(env, &game, &proof, &attestation));
        } else {
            game.player2_score = Some(0);
        }

        let p1 = game.player1_score.unwrap();
        let p2 = game.player2_score.unwrap();
        let p1_won = p1 > p2;
        let winner = if p1_won { 
            game.player1.clone()
        } else {
            game.player2.clone()
        };
        game.winner = Some(winner.clone());
        storage::set_game(env, session_id, &game);
        if let Some(hub_addr) = storage::get_hub(env) {
            let game_hub = GameHubClient::new(env, &hub_addr);
            game_hub.end_game(&session_id, &p1_won);
        }
        return Ok(winner);
    }

    Err(Error::GameAlreadyEnded)
}

pub fn set_admin(env: &Env, new_admin: Address) {
    let admin = storage::get_admin(env);
    admin.require_auth();
    storage::set_admin(env, &new_admin);
}

pub fn set_hub(env: &Env, new_hub: Address) {
    let admin = storage::get_admin(env);
    admin.require_auth();
    storage::set_hub(env, &new_hub);
}

pub fn upgrade(env: &Env, hash: BytesN<32>) -> Result<(), Error> {
    let admin = storage::get_admin(env);
    admin.require_auth();
    env.deployer().update_current_contract_wasm(hash);
    storage::extend_ttl(env);
    Ok(())
}
