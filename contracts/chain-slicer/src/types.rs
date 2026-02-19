/*
    This file is part of xray-games project.
    Licensed under the MIT License.
    Author: Fred Kyung-jin Rezeau (오경진 吳景振) <hello@kyungj.in>
*/

use soroban_sdk::{contracttype, contracterror, Address, BytesN, U256};

#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub enum Backend {
    Circom,
    Noir,
}

pub struct VerificationKeys {
    pub alpha: [u8; 64],
    pub beta: [u8; 128],
    pub gamma: [u8; 128],
    pub delta: [u8; 128],
    pub ic: &'static [[u8; 64]],
}

pub struct Attestation {
    pub seed: U256,
    pub hash_noir: BytesN<32>,
    pub hash_circom: BytesN<32>,
}

pub struct CircuitOutputs {
    pub level_hash: U256,
    pub polygon_count: u32,
    pub object_count: u32,
    pub partition_count: u32,
}

#[derive(Clone, Copy)]
pub struct GameParams {
    pub duration: u64,
    pub attestor: [u8; 32],
}

impl GameParams {
    pub const fn default() -> Self {
        Self {
            duration: 300,
            attestor: [
                0x02, 0x09, 0xa7, 0x07, 0xdd, 0xb9, 0x14, 0x65,
                0x28, 0xb1, 0xf2, 0x9c, 0xa5, 0x16, 0xb2, 0x5c,
                0x8b, 0x4b, 0x88, 0x58, 0x1c, 0xe8, 0x24, 0x66,
                0xec, 0xb4, 0x6b, 0xcf, 0x0b, 0x07, 0xf7, 0xbb,
            ],
        }
    }
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Game {
    pub player1: Address,
    pub player2: Address,
    pub player1_points: i128,
    pub player2_points: i128,
    pub player1_score: Option<u32>,
    pub player2_score: Option<u32>,
    pub winner: Option<Address>,
    pub seed: U256,
    pub nonce: u64,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    GameHubAddress,
    Attestor,
    Game(u32),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    NotInitialized = 1,
    GameNotFound = 6,
    NotPlayer = 7,
    GameAlreadyEnded = 8,
}

