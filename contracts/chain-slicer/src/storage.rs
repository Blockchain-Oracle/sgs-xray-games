/*
    This file is part of xray-games project.
    Licensed under the MIT License.
    Author: Fred Kyung-jin Rezeau (오경진 吳景振) <hello@kyungj.in>
*/

use crate::types::{DataKey, Game};
use soroban_sdk::{Address, Env};

const GAME_TTL_LEDGERS: u32 = 518_400;

pub fn has_admin(env: &Env) -> bool {
    env.storage().instance().has(&DataKey::Admin)
}

pub fn get_admin(env: &Env) -> Address {
    env.storage().instance().get(&DataKey::Admin).unwrap()
}

pub fn set_admin(env: &Env, admin: &Address) {
    env.storage().instance().set(&DataKey::Admin, admin);
}

pub fn get_hub(env: &Env) -> Option<Address> {
    env.storage().instance().get(&DataKey::GameHubAddress)
}

pub fn set_hub(env: &Env, hub: &Address) {
    env.storage()
        .instance()
        .set(&DataKey::GameHubAddress, hub);
}

pub fn get_game(env: &Env, session_id: u32) -> Option<Game> {
    env.storage()
        .temporary()
        .get(&DataKey::Game(session_id))
}

pub fn set_game(env: &Env, session_id: u32, game: &Game) {
    let key = DataKey::Game(session_id);
    env.storage().temporary().set(&key, game);
    env.storage()
        .temporary()
        .extend_ttl(&key, GAME_TTL_LEDGERS, GAME_TTL_LEDGERS);
}

pub fn extend_ttl(env: &Env) {
    let max_ttl = env.storage().max_ttl();
    let threshold = max_ttl.saturating_sub(120_960);
    env.storage().instance().extend_ttl(threshold, max_ttl);
}
