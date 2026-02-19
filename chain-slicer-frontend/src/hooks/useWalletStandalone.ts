import { useCallback, useEffect } from 'react';
import {
  isConnected as freighterIsConnected,
  requestAccess as freighterRequestAccess,
  getAddress as freighterGetAddress,
  signTransaction as freighterSignTransaction,
  signAuthEntry as freighterSignAuthEntry,
} from '@stellar/freighter-api';
import { useWalletStore } from '../store/walletSlice';
import { NETWORK, NETWORK_PASSPHRASE } from '../utils/constants';
import type { ContractSigner } from '../types/signer';
import type { WalletError } from '@stellar/stellar-sdk/contract';

const WALLET_ID = 'freighter';

function toWalletError(error?: { message: string; code: number }): WalletError | undefined {
  if (!error) return undefined;
  return { message: error.message, code: error.code };
}

export function useWalletStandalone() {
  const {
    publicKey,
    walletId,
    walletType,
    isConnected,
    isConnecting,
    network,
    networkPassphrase,
    error,
    setWallet,
    setConnecting,
    setNetwork,
    setError,
    disconnect: storeDisconnect,
  } = useWalletStore();

  const isWalletAvailable = typeof window !== 'undefined';

  const connect = useCallback(async () => {
    if (typeof window === 'undefined') {
      setError('Wallet connection is only available in the browser.');
      return;
    }

    try {
      setConnecting(true);
      setError(null);

      const connResult = await freighterIsConnected();
      if (!connResult.isConnected) {
        throw new Error('Freighter extension is not installed or not connected.');
      }

      const accessResult = await freighterRequestAccess();
      if (accessResult.error) {
        throw new Error(accessResult.error);
      }

      const address = accessResult.address;
      if (!address) {
        throw new Error('No wallet address returned from Freighter.');
      }

      setWallet(address, WALLET_ID, 'wallet');
      setNetwork(NETWORK, NETWORK_PASSPHRASE);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect wallet';
      setError(message);
      throw err;
    } finally {
      setConnecting(false);
    }
  }, [setWallet, setConnecting, setError, setNetwork]);

  const refresh = useCallback(async () => {
    try {
      if (typeof window === 'undefined') return;
      const addrResult = await freighterGetAddress();
      if (addrResult.address) {
        setWallet(addrResult.address, WALLET_ID, 'wallet');
        setNetwork(NETWORK, NETWORK_PASSPHRASE);
      }
    } catch {
      // ignore refresh failures
    }
  }, [setWallet, setNetwork]);

  const disconnect = useCallback(() => {
    storeDisconnect();
  }, [storeDisconnect]);

  const connectDev = useCallback(async (_playerNumber?: 1 | 2) => {
    setError('Dev wallets are not available in standalone mode.');
    throw new Error('Dev wallets are not available in standalone mode.');
  }, [setError]);

  const switchPlayer = useCallback(async (_playerNumber?: 1 | 2) => {
    setError('Dev wallets are not available in standalone mode.');
    throw new Error('Dev wallets are not available in standalone mode.');
  }, [setError]);

  const isDevModeAvailable = useCallback(() => false, []);

  const isDevPlayerAvailable = useCallback(() => false, []);

  const getCurrentDevPlayer = useCallback(() => null, []);

  const getContractSigner = useCallback((): ContractSigner => {
    if (!isConnected || !publicKey) {
      throw new Error('Wallet not connected');
    }

    return {
      signTransaction: async (
        xdr: string,
        opts?: { networkPassphrase?: string; address?: string; submit?: boolean; submitUrl?: string }
      ) => {
        try {
          const result = await freighterSignTransaction(xdr, {
            networkPassphrase: opts?.networkPassphrase || networkPassphrase || NETWORK_PASSPHRASE,
            address: opts?.address || publicKey,
          });

          if (result.error) {
            throw new Error(result.error);
          }

          return {
            signedTxXdr: result.signedTxXdr || xdr,
            signerAddress: result.signerAddress || publicKey,
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to sign transaction';
          return {
            signedTxXdr: xdr,
            signerAddress: publicKey,
            error: toWalletError({ message, code: -1 }),
          };
        }
      },

      signAuthEntry: async (authEntry: string, opts?: { networkPassphrase?: string; address?: string }) => {
        try {
          const result = await freighterSignAuthEntry(authEntry, {
            address: opts?.address || publicKey,
          });

          if (result.error) {
            throw new Error(result.error);
          }

          if (!result.signedAuthEntry) {
            throw new Error('Freighter returned empty signedAuthEntry');
          }

          return {
            signedAuthEntry: result.signedAuthEntry,
            signerAddress: result.signerAddress || publicKey,
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to sign auth entry';
          return {
            signedAuthEntry: authEntry,
            signerAddress: publicKey,
            error: toWalletError({ message, code: -1 }),
          };
        }
      },
    };
  }, [isConnected, publicKey, networkPassphrase]);

  useEffect(() => {
    const bootstrap = async () => {
      if (typeof window === 'undefined') return;

      try {
        const connResult = await freighterIsConnected();
        if (!connResult.isConnected) return;

        const addrResult = await freighterGetAddress();
        if (addrResult.address) {
          setWallet(addrResult.address, WALLET_ID, 'wallet');
          setNetwork(NETWORK, NETWORK_PASSPHRASE);
        }
      } catch {
        // ignore bootstrap failures
      }
    };

    bootstrap().catch(() => undefined);
  }, [setWallet, setNetwork, storeDisconnect]);

  return {
    publicKey,
    walletId,
    walletType,
    isConnected,
    isConnecting,
    network,
    networkPassphrase,
    error,
    isWalletAvailable,

    connect,
    refresh,
    disconnect,
    getContractSigner,
    connectDev,
    switchPlayer,
    isDevModeAvailable,
    isDevPlayerAvailable,
    getCurrentDevPlayer,
  };
}