import { useState, useEffect, useRef, useCallback } from 'react';
import { ChainSlicerService } from './chainSlicerService';
import { requestCache, createCacheKey } from '@/utils/requestCache';
import { useWallet } from '@/hooks/useWallet';
import { CHAIN_SLICER_CONTRACT } from '@/utils/constants';
import { getFundedSimulationSourceAddress } from '@/utils/simulationUtils';
import { devWalletService, DevWalletService } from '@/services/devWalletService';
import type { Game } from './bindings';
import { SlicerScene } from './SlicerEngine';

const createRandomSessionId = (): number => {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    let value = 0;
    const buffer = new Uint32Array(1);
    while (value === 0) {
      crypto.getRandomValues(buffer);
      value = buffer[0];
    }
    return value;
  }

  return (Math.floor(Math.random() * 0xffffffff) >>> 0) || 1;
};

// Create service instance with the contract ID
const chainSlicerService = new ChainSlicerService(CHAIN_SLICER_CONTRACT);

interface ChainSlicerGameProps {
  userAddress: string;
  currentEpoch: number;
  availablePoints: bigint;
  initialXDR?: string | null;
  initialSessionId?: number | null;
  onStandingsRefresh: () => void;
  onGameComplete: () => void;
}

export function ChainSlicerGame({
  userAddress,
  availablePoints,
  initialXDR,
  initialSessionId,
  onStandingsRefresh,
  onGameComplete
}: ChainSlicerGameProps) {
  const DEFAULT_POINTS = '0.1';
  const { getContractSigner, walletType } = useWallet();
  // Use a random session ID that fits in u32 (avoid 0 because UI validation treats <=0 as invalid)
  const [sessionId, setSessionId] = useState<number>(() => createRandomSessionId());
  const [player1Address, setPlayer1Address] = useState(userAddress);
  const [player1Points, setPlayer1Points] = useState(DEFAULT_POINTS);
  const [gamePhase, setGamePhase] = useState<'create' | 'play'>('create');
  const [gameState, setGameState] = useState<Game | null>(null);
  const [loading, setLoading] = useState(false);
  const [quickstartLoading, setQuickstartLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [createMode, setCreateMode] = useState<'create' | 'import' | 'load'>('create');
  const [exportedAuthEntryXDR, setExportedAuthEntryXDR] = useState<string | null>(null);
  const [importAuthEntryXDR, setImportAuthEntryXDR] = useState('');
  const [importSessionId, setImportSessionId] = useState('');
  const [importPlayer1, setImportPlayer1] = useState('');
  const [importPlayer1Points, setImportPlayer1Points] = useState('');
  const [importPlayer2Points, setImportPlayer2Points] = useState(DEFAULT_POINTS);
  const [loadSessionId, setLoadSessionId] = useState('');
  const [authEntryCopied, setAuthEntryCopied] = useState(false);
  const [shareUrlCopied, setShareUrlCopied] = useState(false);
  const [xdrParsing, setXdrParsing] = useState(false);
  const [xdrParseError, setXdrParseError] = useState<string | null>(null);
  const [xdrParseSuccess, setXdrParseSuccess] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<SlicerScene | null>(null);
  const [slicerLevel, setSlicerLevel] = useState({ current: 0, max: 5 });
  const [slicerStatus, setSlicerStatus] = useState<string>('idle');
  const [slicerTimer, setSlicerTimer] = useState<number>(90);
  const [turnPhase, setTurnPhase] = useState<string>('p1_play');
  const [currentPlayer, setCurrentPlayer] = useState<1 | 2>(1);
  const [p1Proofs, setP1Proofs] = useState<any[]>([]);
  const [p2Proofs, setP2Proofs] = useState<any[]>([]);
  const [p1Score, setP1Score] = useState<number>(0);
  const [p2Score, setP2Score] = useState<number>(0);
  const [provingStatus, setProvingStatus] = useState<'idle' | 'submitting' | 'proving' | 'done' | 'error'>('idle');
  const [provingJobId, setProvingJobId] = useState<string | null>(null);
  const [provingResult, setProvingResult] = useState<any>(null);
  const [provingError, setProvingError] = useState<string | null>(null);
  const [provingElapsed, setProvingElapsed] = useState(0);
  const provingStartRef = useRef<number>(0);
  const [contractResult, setContractResult] = useState<any>(null);

  const PROVE_ENDPOINT = 'https://api.xray.games';

  useEffect(() => {
    setPlayer1Address(userAddress);
  }, [userAddress]);

  useEffect(() => {
    if (createMode === 'import' && !importPlayer2Points.trim()) {
      setImportPlayer2Points(DEFAULT_POINTS);
    }
  }, [createMode, importPlayer2Points]);

  const POINTS_DECIMALS = 7;
  const isBusy = loading || quickstartLoading;
  const actionLock = useRef(false);
  const quickstartAvailable = walletType === 'dev'
    && DevWalletService.isDevModeAvailable()
    && DevWalletService.isPlayerAvailable(1)
    && DevWalletService.isPlayerAvailable(2);

  const runAction = async (action: () => Promise<void>) => {
    if (actionLock.current || isBusy) {
      return;
    }
    actionLock.current = true;
    try {
      await action();
    } finally {
      actionLock.current = false;
    }
  };

  const handleStartNewGame = () => {
    if (gameState?.winner) {
      onGameComplete();
    }

    actionLock.current = false;
    setGamePhase('create');
    setSessionId(createRandomSessionId());
    setGameState(null);
    setLoading(false);
    setQuickstartLoading(false);
    setError(null);
    setSuccess(null);
    setCreateMode('create');
    setExportedAuthEntryXDR(null);
    setImportAuthEntryXDR('');
    setImportSessionId('');
    setImportPlayer1('');
    setImportPlayer1Points('');
    setImportPlayer2Points(DEFAULT_POINTS);
    setLoadSessionId('');
    setAuthEntryCopied(false);
    setShareUrlCopied(false);
    setXdrParsing(false);
    setXdrParseError(null);
    setXdrParseSuccess(false);
    setPlayer1Address(userAddress);
    setPlayer1Points(DEFAULT_POINTS);
    setSlicerStatus('idle'); setSlicerTimer(90);
    setTurnPhase('p1_play'); setCurrentPlayer(1);
    setP1Proofs([]); setP2Proofs([]);
    setP1Score(0); setP2Score(0);
    setProvingStatus('idle'); setProvingJobId(null); setProvingResult(null);
    setProvingError(null); setProvingElapsed(0);
    setContractResult(null);
  };

  const parsePoints = (value: string): bigint | null => {
    try {
      const cleaned = value.replace(/[^\d.]/g, '');
      if (!cleaned || cleaned === '.') return null;

      const [whole = '0', fraction = ''] = cleaned.split('.');
      const paddedFraction = fraction.padEnd(POINTS_DECIMALS, '0').slice(0, POINTS_DECIMALS);
      return BigInt(whole + paddedFraction);
    } catch {
      return null;
    }
  };

  useEffect(() => {
    if (gamePhase !== 'play') return;
    const isPlayPhase = turnPhase === 'p1_play' || turnPhase === 'p2_play';
    const isWaitPhase = turnPhase === 'waiting_for_p1' || turnPhase === 'waiting_for_p2' || turnPhase === 'waiting_for_result' || turnPhase === 'p2_waiting';
    if (!isPlayPhase && !isWaitPhase) return;
    if (isPlayPhase && !gameState?.seed) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const player = (turnPhase === 'p2_play' || turnPhase === 'waiting_for_p2' || turnPhase === 'p2_waiting') ? 2 : 1;
    const scene = new SlicerScene(canvas, {
      onScoreUpdate: () => {},
      onLevelUpdate: (current, max) => { if (isPlayPhase) setSlicerLevel({ current, max }); },
      onPhaseEnd: (_player, proofs) => {
        if (!isPlayPhase) return;
        setSlicerStatus('ended');
        const totalScore = proofs.reduce((sum: number, p: any) => sum + (p.score || 0), 0);
        if (player === 1) { setP1Proofs(proofs); setP1Score(totalScore); }
        else { setP2Proofs(proofs); setP2Score(totalScore); }
        console.log(`[SLICER] P${player} phase ended. Score: ${totalScore}, Proofs:`, proofs);
      },
      onStatusUpdate: (status) => { if (isPlayPhase) setSlicerStatus(status); },
      onTimerUpdate: (t) => { if (isPlayPhase) setSlicerTimer(t); },
      onProofCollected: (_p, levelIdx) => {
        console.log(`[SLICER] Proof P${player} level ${levelIdx}`);
      },
    });
    sceneRef.current = scene;
    scene.startLoop();
    if (isPlayPhase) {
      scene.start(gameState!.seed.toString(), player as 1 | 2);
    }
    return () => { scene.destroy(); sceneRef.current = null; };
  }, [gamePhase, turnPhase]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    sceneRef.current?.handlePointerDown(e.clientX, e.clientY);
  }, []);
  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    sceneRef.current?.handlePointerMove(e.clientX, e.clientY);
  }, []);
  const handlePointerUp = useCallback(() => {
    sceneRef.current?.handlePointerUp();
  }, []);

  const P1_COLOR = '#6ee7b7';
  const P2_COLOR = '#fbbf24';

  const buildProvers = (proofs: any[]) => {
    return proofs
      .filter(p => p.attestation && p.proverToml)
      .map(p => ({
        index: p.levelIndex,
        prover: p.proverToml,
        attestation: p.attestation,
        score: p.score,
        scoreData: p.scoreData,
      }));
  };

  const submitPlayerProof = async (player: 1 | 2, proofs: any[]) => {
    setProvingStatus('submitting');
    setProvingError(null);
    setProvingResult(null);
    provingStartRef.current = Date.now();

    const provers = buildProvers(proofs);
    const hasValidProofs = provers.length > 0;

    try {
      if (!hasValidProofs) {
        console.log(`[PROVE] P${player} has no valid proofs, will submit empty to contract`);
        setProvingStatus('done');
        setProvingResult({ hasProof: false });
        return;
      }

      const seed = String(sessionId);
      const resp = await fetch(`${PROVE_ENDPOINT}/slicer/prove/2p`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player1: gameState?.player1 || userAddress,
          player2: gameState?.player2 || 'player2',
          seed,
          provers1: player === 1 ? provers : [],
          provers2: player === 2 ? provers : [],
        }),
      });

      const data = await resp.json();
      if (data.status !== 'ok' || !data.jobId) {
        throw new Error(data.error || 'Failed to submit proofs');
      }

      setProvingJobId(data.jobId);
      setProvingStatus('proving');
      console.log(`[PROVE] P${player} job submitted:`, data.jobId);
    } catch (err) {
      console.error(`[PROVE] P${player} submit error:`, err);
      setProvingStatus('done');
      setProvingResult({ hasProof: false, error: err instanceof Error ? err.message : 'Prove failed' });
    }
  };

  useEffect(() => {
    if (provingStatus !== 'proving' || !provingJobId) return;

    const poll = async () => {
      try {
        const resp = await fetch(`${PROVE_ENDPOINT}/slicer/prove/2p/${provingJobId}`);
        const data = await resp.json();
        if (data.status !== 'ok') return;

        setProvingResult(data);

        if (data.jobStatus === 'complete') {
          setProvingStatus('done');
          console.log('[PROVE] Complete:', data);
        }
      } catch (err) {
        console.error('[PROVE] Poll error:', err);
      }
    };

    const interval = setInterval(poll, 3000);
    poll();
    return () => clearInterval(interval);
  }, [provingStatus, provingJobId]);

  useEffect(() => {
    if (provingStatus !== 'proving' && provingStatus !== 'submitting') return;
    const interval = setInterval(() => {
      setProvingElapsed(Math.floor((Date.now() - provingStartRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [provingStatus]);

  useEffect(() => {
    if (provingStatus !== 'done') return;
    if (turnPhase === 'p1_proving') {
      setTurnPhase('p1_submitting');
    } else if (turnPhase === 'p2_proving') {
      setTurnPhase('verifying');
    }
  }, [provingStatus, turnPhase]);

  useEffect(() => {
    if (turnPhase !== 'p1_submitting') return;
    let cancelled = false;
    const startTime = Date.now();

    const doSubmitP1 = async () => {
      let submitError: string | null = null;
      try {
        console.log('[CONTRACT] Submitting P1 proof to contract...');
        let signer;
        const playerAddress = gameState?.player1 || userAddress;
        if (walletType === 'dev' && DevWalletService.isDevModeAvailable() && devWalletService.hasAddress(playerAddress)) {
          const original = devWalletService.getCurrentPlayer();
          await devWalletService.initPlayer(1);
          const devAddr1 = devWalletService.getPublicKey();
          await devWalletService.initPlayer(2);
          const devAddr2 = devWalletService.getPublicKey();
          const devPlayer = devAddr1 === playerAddress ? 1 : devAddr2 === playerAddress ? 2 : (original ?? 1);
          await devWalletService.initPlayer(devPlayer);
          signer = devWalletService.getSigner();
          console.log(`[CONTRACT] Switched dev wallet to ${devPlayer} (${devWalletService.getPublicKey()}) for contract player1`);
        } else {
          signer = getContractSigner();
          console.log(`[CONTRACT] Using wallet signer for contract player1: ${playerAddress}`);
        }
        const p1Data = provingResult?.player1;
        const proofHex = p1Data?.proofHex || null;
        const attestationHex = p1Data?.attestationHex || null;
        console.log(`[CONTRACT] P1 proof: ${proofHex ? proofHex.length / 2 + ' bytes' : 'empty'}, attestation: ${attestationHex ? attestationHex.length / 2 + ' bytes' : 'empty'}`);
        await chainSlicerService.submitProof(sessionId, playerAddress, proofHex, attestationHex, signer);

        console.log('[CONTRACT] P1 prove tx submitted successfully');
      } catch (err) {
        console.error('[CONTRACT] P1 submit error:', err);
        submitError = err instanceof Error ? err.message : 'Failed to submit P1 proof';
      }
      const elapsed = Date.now() - startTime;
      if (elapsed < 2000) {
        await new Promise(resolve => setTimeout(resolve, 2000 - elapsed));
      }

      if (cancelled) return;

      if (submitError) {
        console.error('[CONTRACT] P1 prove failed, cannot proceed:', submitError);
        setProvingError(submitError);
        setError(`P1 contract submission failed: ${submitError}`);
        return;
      }
      setTurnPhase('waiting_for_p2');
      setProvingStatus('idle'); setProvingJobId(null);
      setProvingError(null); setProvingElapsed(0); setSlicerStatus('idle'); setSlicerTimer(90);
    };

    doSubmitP1();
    return () => { cancelled = true; };
  }, [turnPhase]);

  useEffect(() => {
    if (turnPhase !== 'verifying') return;
    let cancelled = false;
    const startTime = Date.now();

    const doVerify = async () => {
      let submitError: string | null = null;
      try {
        console.log('[CONTRACT] Submitting P2 proof to contract...');
        let signer;
        const playerAddress = gameState?.player2 || userAddress;
        if (walletType === 'dev' && DevWalletService.isDevModeAvailable() && devWalletService.hasAddress(playerAddress)) {
          const original = devWalletService.getCurrentPlayer();
          await devWalletService.initPlayer(1);
          const devAddr1 = devWalletService.getPublicKey();
          await devWalletService.initPlayer(2);
          const devAddr2 = devWalletService.getPublicKey();
          const devPlayer = devAddr1 === playerAddress ? 1 : devAddr2 === playerAddress ? 2 : (original ?? 1);
          await devWalletService.initPlayer(devPlayer);
          signer = devWalletService.getSigner();
          console.log(`[CONTRACT] Switched dev wallet to ${devPlayer} (${devWalletService.getPublicKey()}) for contract player2`);
        } else {
          signer = getContractSigner();
          console.log(`[CONTRACT] Using wallet signer for contract player2: ${playerAddress}`);
        }
        const p2Data = provingResult?.player2;
        const proofHex = p2Data?.proofHex || null;
        const attestationHex = p2Data?.attestationHex || null;
        console.log(`[CONTRACT] P2 proof: ${proofHex ? proofHex.length / 2 + ' bytes' : 'empty'}, attestation: ${attestationHex ? attestationHex.length / 2 + ' bytes' : 'empty'}`);
        await chainSlicerService.submitProof(sessionId, playerAddress, proofHex, attestationHex, signer);
        console.log('[CONTRACT] P2 prove tx submitted — winner determined');
      } catch (err) {
        console.error('[CONTRACT] P2 submit error:', err);
        submitError = err instanceof Error ? err.message : 'Failed to submit P2 proof';
      }

      const elapsed = Date.now() - startTime;
      if (elapsed < 2000) {
        await new Promise(resolve => setTimeout(resolve, 2000 - elapsed));
      }

      if (cancelled) return;

      if (submitError) {
        console.error('[CONTRACT] P2 prove failed:', submitError);
        setProvingError(submitError);
        setError(`P2 contract submission failed: ${submitError}`);
      }
      setTurnPhase('finished');
      await fetchContractResult();
    };

    doVerify();
    return () => { cancelled = true; };
  }, [turnPhase]);

  const fetchContractResult = async () => {
    try {
      const game = await chainSlicerService.getGame(sessionId);
      setGameState(game);
      setContractResult(game);
      if (game?.winner) onStandingsRefresh();
    } catch (err) {
      console.error('[CONTRACT] Failed to fetch result:', err);
      setContractResult({ error: 'Failed to fetch result' });
    }
  };

  const handleGenerateProof = () => {
    const player = currentPlayer;
    const proofs = player === 1 ? p1Proofs : p2Proofs;
    setTurnPhase(player === 1 ? 'p1_proving' : 'p2_proving');
    submitPlayerProof(player, proofs);
  };

  const handleP2TakeSeat = () => {
    setCurrentPlayer(2);
    setTurnPhase('p2_play');
    setSlicerStatus('idle');
  };

  const loadGameState = async () => {
    try {
      // Always fetch latest game state to avoid stale cached results after transactions.
      const game = await chainSlicerService.getGame(sessionId);
      setGameState(game);
    } catch (err) {
      // Game doesn't exist yet
      setGameState(null);
    }
  };

  useEffect(() => {
    if (gamePhase !== 'create') {
      loadGameState();
      const interval = setInterval(loadGameState, 5000); // Poll every 5 seconds
      return () => clearInterval(interval);
    }
  }, [sessionId, gamePhase]);

  // Sync turnPhase from contract game state (for 2-window / prod flow).
  // When the polled game state changes, advance turnPhase so the remote
  // player's UI reacts to the other player's actions.
  //
  // New waiting phases for 2-window flow:
  //   waiting_for_p1 — P2's screen while P1 is playing/proving/submitting
  //   waiting_for_p2 — P1's screen while P2 is playing/proving/submitting
  //   waiting_for_result — Both screens while waiting for winner after both proved
  useEffect(() => {
    if (gamePhase !== 'play' || !gameState) return;

    const amPlayer1 = gameState.player1 === userAddress;
    const amPlayer2 = gameState.player2 === userAddress;
    const p1Proved = gameState.player1_score !== undefined && gameState.player1_score !== null;
    const p2Proved = gameState.player2_score !== undefined && gameState.player2_score !== null;
    const hasWinner = gameState.winner !== undefined && gameState.winner !== null;

    // --- Finished: winner exists (always applies, even over protected phases) ---
    if (hasWinner) {
      if (turnPhase !== 'finished') {
        console.log('[SYNC] Game has a winner, transitioning to finished');
        setTurnPhase('finished');
        setContractResult(gameState);
        fetchContractResult();
      }
      return;
    }

    // Never let stale poll data override these local phases —
    // the local code already set them and the poll just hasn't caught up yet
    const protectedPhases = ['finished', 'verifying', 'waiting_for_result', 'p2_proving', 'p2_submitting'];
    if (protectedPhases.includes(turnPhase)) return;

    // --- Both proved but no winner yet (contract hasn't resolved) ---
    if (p1Proved && p2Proved) {
      if (turnPhase !== 'finished' && turnPhase !== 'waiting_for_result') {
        console.log('[SYNC] Both players proved, waiting for result');
        setTurnPhase('waiting_for_result');
      }
      return;
    }

    // --- P1 proved, P2 hasn't ---
    if (p1Proved && !p2Proved) {
      if (amPlayer1) {
        // I'm P1 and I've proved — wait for P2
        // Don't override if I'm still in my own submitting phase
        if (turnPhase !== 'waiting_for_p2' && turnPhase !== 'p1_submitting') {
          console.log('[SYNC] I am P1, proved — waiting for P2');
          setTurnPhase('waiting_for_p2');
        }
      } else if (amPlayer2) {
        // I'm P2 and P1 has proved — show "take seat" unless I'm already active
        if (turnPhase !== 'p2_waiting' && turnPhase !== 'p2_play' && turnPhase !== 'p2_proving' && turnPhase !== 'p2_submitting' && turnPhase !== 'verifying') {
          console.log('[SYNC] P1 proved, I am P2 — transitioning to p2_waiting');
          setCurrentPlayer(2);
          setTurnPhase('p2_waiting');
        }
      }
      return;
    }

    // --- Neither proved yet (according to poll — may have latency) ---
    if (!p1Proved && !p2Proved) {
      if (amPlayer1) {
        // I'm P1 — don't override if I'm actively playing, proving, submitting, or already waiting
        if (turnPhase !== 'p1_play' && turnPhase !== 'p1_proving' && turnPhase !== 'p1_submitting' && turnPhase !== 'waiting_for_p2') {
          setCurrentPlayer(1);
          setTurnPhase('p1_play');
        }
      } else if (amPlayer2) {
        // I'm P2 — P1 hasn't played yet, show waiting screen
        if (turnPhase !== 'waiting_for_p1') {
          console.log('[SYNC] I am P2, P1 has not proved — waiting for P1');
          setTurnPhase('waiting_for_p1');
        }
      }
    }
  }, [gameState, gamePhase, userAddress, turnPhase]);

  // Auto-refresh standings when game completes
  useEffect(() => {
    if (turnPhase === 'finished' && gameState?.winner) {
      console.log('Game completed! Refreshing standings and dashboard data...');
      onStandingsRefresh();
    }
  }, [turnPhase, gameState?.winner]);

  // Handle initial values from URL deep linking or props
  // Expected URL formats:
  //   - With auth entry: ?game=chain-slicer&auth=AAAA... (Session ID, P1 address, P1 points parsed from auth entry)
  //   - With session ID: ?game=chain-slicer&session-id=123 (Load existing game)
  // Note: GamesCatalog cleans URL params, so we prioritize props over URL
  useEffect(() => {
    // Priority 1: Check initialXDR prop (from GamesCatalog after URL cleanup)
    if (initialXDR) {
      console.log('[Deep Link] Using initialXDR prop from GamesCatalog');

      try {
        const parsed = chainSlicerService.parseAuthEntry(initialXDR);
        const sessionId = parsed.sessionId;

        console.log('[Deep Link] Parsed session ID from initialXDR:', sessionId);

        // Check if game already exists (both players have signed)
        chainSlicerService.getGame(sessionId)
          .then((game) => {
            if (game) {
              // Game exists! Load it directly instead of going to import mode
              console.log('[Deep Link] Game already exists, loading directly to play phase');
              console.log('[Deep Link] Game data:', game);

              // Auto-load the game - bypass create phase entirely
              setGameState(game);
              setGamePhase('play');
              setSessionId(sessionId); // Set session ID for the game
            } else {
              // Game doesn't exist yet, go to import mode
              console.log('[Deep Link] Game not found, entering import mode');
              setCreateMode('import');
              setImportAuthEntryXDR(initialXDR);
              setImportSessionId(sessionId.toString());
              setImportPlayer1(parsed.player1);
              setImportPlayer1Points((Number(parsed.player1Points) / 10_000_000).toString());
              setImportPlayer2Points('0.1');
            }
          })
          .catch((err) => {
            console.error('[Deep Link] Error checking game existence:', err);
            console.error('[Deep Link] Error details:', {
              message: err?.message,
              stack: err?.stack,
              sessionId: sessionId,
            });
            // If we can't check, default to import mode
            setCreateMode('import');
            setImportAuthEntryXDR(initialXDR);
            setImportSessionId(parsed.sessionId.toString());
            setImportPlayer1(parsed.player1);
            setImportPlayer1Points((Number(parsed.player1Points) / 10_000_000).toString());
            setImportPlayer2Points('0.1');
          });
      } catch (err) {
        console.log('[Deep Link] Failed to parse initialXDR, will retry on import');
        setCreateMode('import');
        setImportAuthEntryXDR(initialXDR);
        setImportPlayer2Points('0.1');
      }
      return; // Exit early - we processed initialXDR
    }

    // Priority 2: Check URL parameters (for direct navigation without GamesCatalog)
    const urlParams = new URLSearchParams(window.location.search);
    const authEntry = urlParams.get('auth');
    const urlSessionId = urlParams.get('session-id');

    if (authEntry) {
      // Simplified URL format - only auth entry is needed
      // Session ID, Player 1 address, and points are parsed from auth entry
      console.log('[Deep Link] Auto-populating game from URL with auth entry');

      // Try to parse auth entry to get session ID
      try {
        const parsed = chainSlicerService.parseAuthEntry(authEntry);
        const sessionId = parsed.sessionId;

        console.log('[Deep Link] Parsed session ID from URL auth entry:', sessionId);

        // Check if game already exists (both players have signed)
        chainSlicerService.getGame(sessionId)
          .then((game) => {
            if (game) {
              // Game exists! Load it directly instead of going to import mode
              console.log('[Deep Link] Game already exists (URL), loading directly to play phase');
              console.log('[Deep Link] Game data:', game);

              // Auto-load the game - bypass create phase entirely
              setGameState(game);
              setGamePhase('play');
              setSessionId(sessionId); // Set session ID for the game
            } else {
              // Game doesn't exist yet, go to import mode
              console.log('[Deep Link] Game not found (URL), entering import mode');
              setCreateMode('import');
              setImportAuthEntryXDR(authEntry);
              setImportSessionId(sessionId.toString());
              setImportPlayer1(parsed.player1);
              setImportPlayer1Points((Number(parsed.player1Points) / 10_000_000).toString());
              setImportPlayer2Points('0.1');
            }
          })
          .catch((err) => {
            console.error('[Deep Link] Error checking game existence (URL):', err);
            console.error('[Deep Link] Error details:', {
              message: err?.message,
              stack: err?.stack,
              sessionId: sessionId,
            });
            // If we can't check, default to import mode
            setCreateMode('import');
            setImportAuthEntryXDR(authEntry);
            setImportSessionId(parsed.sessionId.toString());
            setImportPlayer1(parsed.player1);
            setImportPlayer1Points((Number(parsed.player1Points) / 10_000_000).toString());
            setImportPlayer2Points('0.1');
          });
      } catch (err) {
        console.log('[Deep Link] Failed to parse auth entry from URL, will retry on import');
        setCreateMode('import');
        setImportAuthEntryXDR(authEntry);
        setImportPlayer2Points('0.1');
      }
    } else if (urlSessionId) {
      // Load existing game by session ID
      console.log('[Deep Link] Auto-populating game from URL with session ID');
      setCreateMode('load');
      setLoadSessionId(urlSessionId);
    } else if (initialSessionId !== null && initialSessionId !== undefined) {
      console.log('[Deep Link] Auto-populating session ID from prop:', initialSessionId);
      setCreateMode('load');
      setLoadSessionId(initialSessionId.toString());
    }
  }, [initialXDR, initialSessionId]);

  // Auto-parse Auth Entry XDR when pasted
  useEffect(() => {
    // Only parse if in import mode and XDR is not empty
    if (createMode !== 'import' || !importAuthEntryXDR.trim()) {
      // Reset parse states when XDR is cleared
      if (!importAuthEntryXDR.trim()) {
        setXdrParsing(false);
        setXdrParseError(null);
        setXdrParseSuccess(false);
        setImportSessionId('');
        setImportPlayer1('');
        setImportPlayer1Points('');
      }
      return;
    }

    // Auto-parse the XDR
    const parseXDR = async () => {
      setXdrParsing(true);
      setXdrParseError(null);
      setXdrParseSuccess(false);

      try {
        console.log('[Auto-Parse] Parsing auth entry XDR...');
        const gameParams = chainSlicerService.parseAuthEntry(importAuthEntryXDR.trim());

        // Check if user is trying to import their own auth entry (self-play prevention)
        if (gameParams.player1 === userAddress) {
          throw new Error('You cannot play against yourself. This auth entry was created by you (Player 1).');
        }

        // Successfully parsed - auto-fill fields
        setImportSessionId(gameParams.sessionId.toString());
        setImportPlayer1(gameParams.player1);
        setImportPlayer1Points((Number(gameParams.player1Points) / 10_000_000).toString());
        setXdrParseSuccess(true);
        console.log('[Auto-Parse] Successfully parsed auth entry:', {
          sessionId: gameParams.sessionId,
          player1: gameParams.player1,
          player1Points: (Number(gameParams.player1Points) / 10_000_000).toString(),
        });
      } catch (err) {
        console.error('[Auto-Parse] Failed to parse auth entry:', err);
        const errorMsg = err instanceof Error ? err.message : 'Invalid auth entry XDR';
        setXdrParseError(errorMsg);
        // Clear auto-filled fields on error
        setImportSessionId('');
        setImportPlayer1('');
        setImportPlayer1Points('');
      } finally {
        setXdrParsing(false);
      }
    };

    // Debounce parsing to avoid parsing on every keystroke
    const timeoutId = setTimeout(parseXDR, 500);
    return () => clearTimeout(timeoutId);
  }, [importAuthEntryXDR, createMode, userAddress]);

  const handlePrepareTransaction = async () => {
    await runAction(async () => {
      try {
        setLoading(true);
        setError(null);
        setSuccess(null);

        const p1Points = parsePoints(player1Points);

        if (!p1Points || p1Points <= 0n) {
          throw new Error('Enter a valid points amount');
        }

        const signer = getContractSigner();

        // Use placeholder values for Player 2 (they'll rebuild with their own values).
        // We still need a real, funded account as the transaction source for build/simulation.
        const placeholderPlayer2Address = await getFundedSimulationSourceAddress([player1Address, userAddress]);
        const placeholderP2Points = p1Points; // Same as P1 for simulation

        console.log('Preparing transaction for Player 1 to sign...');
        console.log('Using placeholder Player 2 values for simulation only');
        const authEntryXDR = await chainSlicerService.prepareStartGame(
          sessionId,
          player1Address,
          placeholderPlayer2Address,
          p1Points,
          placeholderP2Points,
          signer
        );

        console.log('Transaction prepared successfully! Player 1 has signed their auth entry.');
        setExportedAuthEntryXDR(authEntryXDR);
        setSuccess('Auth entry signed! Copy the auth entry XDR or share URL below and send it to Player 2. Waiting for them to sign...');

        // Start polling for the game to be created by Player 2
        const pollInterval = setInterval(async () => {
          try {
            // Try to load the game
            const game = await chainSlicerService.getGame(sessionId);
            if (game) {
              console.log('Game found! Player 2 has finalized the transaction. Transitioning to play phase...');
              clearInterval(pollInterval);

              // Update game state
              setGameState(game);
              setExportedAuthEntryXDR(null);
              setSuccess('Game created! Player 2 has signed and submitted.');
              setGamePhase('play');

              // Refresh dashboard to show updated available points (locked in game)
              onStandingsRefresh();

              // Clear success message after 2 seconds
              setTimeout(() => setSuccess(null), 2000);
            } else {
              console.log('Game not found yet, continuing to poll...');
            }
          } catch (err) {
            // Game doesn't exist yet, keep polling
            console.log('Polling for game creation...', err instanceof Error ? err.message : 'checking');
          }
        }, 3000); // Poll every 3 seconds

        // Stop polling after 5 minutes
        setTimeout(() => {
          clearInterval(pollInterval);
          console.log('Stopped polling after 5 minutes');
        }, 300000);
      } catch (err) {
        console.error('Prepare transaction error:', err);
        // Extract detailed error message
        let errorMessage = 'Failed to prepare transaction';
        if (err instanceof Error) {
          errorMessage = err.message;

          // Check for common errors
          if (err.message.includes('insufficient')) {
            errorMessage = `Insufficient points: ${err.message}. Make sure you have enough points for this game.`;
          } else if (err.message.includes('auth')) {
            errorMessage = `Authorization failed: ${err.message}. Check your wallet connection.`;
          }
        }

        setError(errorMessage);

        // Keep the component in 'create' phase so user can see the error and retry
      } finally {
        setLoading(false);
      }
    });
  };

  const handleQuickStart = async () => {
    await runAction(async () => {
      try {
        setQuickstartLoading(true);
        setError(null);
        setSuccess(null);
        if (walletType !== 'dev') {
          throw new Error('Quickstart only works with dev wallets in the Games Library.');
        }

        if (!DevWalletService.isDevModeAvailable() || !DevWalletService.isPlayerAvailable(1) || !DevWalletService.isPlayerAvailable(2)) {
          throw new Error('Quickstart requires both dev wallets. Run "bun run setup" and connect a dev wallet.');
        }

        const p1Points = parsePoints(player1Points);
        if (!p1Points || p1Points <= 0n) {
          throw new Error('Enter a valid points amount');
        }

        const originalPlayer = devWalletService.getCurrentPlayer();
        let player1AddressQuickstart = '';
        let player2AddressQuickstart = '';
        let player1Signer: ReturnType<typeof devWalletService.getSigner> | null = null;
        let player2Signer: ReturnType<typeof devWalletService.getSigner> | null = null;

        try {
          await devWalletService.initPlayer(1);
          player1AddressQuickstart = devWalletService.getPublicKey();
          player1Signer = devWalletService.getSigner();

          await devWalletService.initPlayer(2);
          player2AddressQuickstart = devWalletService.getPublicKey();
          player2Signer = devWalletService.getSigner();
        } finally {
          if (originalPlayer) {
            await devWalletService.initPlayer(originalPlayer);
          }
        }

        if (!player1Signer || !player2Signer) {
          throw new Error('Quickstart failed to initialize dev wallet signers.');
        }

        if (player1AddressQuickstart === player2AddressQuickstart) {
          throw new Error('Quickstart requires two different dev wallets.');
        }

        const quickstartSessionId = createRandomSessionId();
        setSessionId(quickstartSessionId);
        setPlayer1Address(player1AddressQuickstart);
        setCreateMode('create');
        setExportedAuthEntryXDR(null);
        setImportAuthEntryXDR('');
        setImportSessionId('');
        setImportPlayer1('');
        setImportPlayer1Points('');
        setImportPlayer2Points(DEFAULT_POINTS);
        setLoadSessionId('');

        const placeholderPlayer2Address = await getFundedSimulationSourceAddress([
          player1AddressQuickstart,
          player2AddressQuickstart,
        ]);

        const authEntryXDR = await chainSlicerService.prepareStartGame(
          quickstartSessionId,
          player1AddressQuickstart,
          placeholderPlayer2Address,
          p1Points,
          p1Points,
          player1Signer
        );

        const fullySignedTxXDR = await chainSlicerService.importAndSignAuthEntry(
          authEntryXDR,
          player2AddressQuickstart,
          p1Points,
          player2Signer
        );

        await chainSlicerService.finalizeStartGame(
          fullySignedTxXDR,
          player2AddressQuickstart,
          player2Signer
        );

        try {
          const game = await chainSlicerService.getGame(quickstartSessionId);
          setGameState(game);
        } catch (err) {
          console.log('Quickstart game not available yet:', err);
        }
        setGamePhase('play');
        onStandingsRefresh();
        setSuccess('Quickstart complete! Both players signed and the game is ready.');
        setTimeout(() => setSuccess(null), 2000);
      } catch (err) {
        console.error('Quickstart error:', err);
        setError(err instanceof Error ? err.message : 'Quickstart failed');
      } finally {
        setQuickstartLoading(false);
      }
    });
  };

  const handleImportTransaction = async () => {
    await runAction(async () => {
      try {
        setLoading(true);
        setError(null);
        setSuccess(null);
        // Validate required inputs (only auth entry and player 2 points)
        if (!importAuthEntryXDR.trim()) {
          throw new Error('Enter auth entry XDR from Player 1');
        }
        if (!importPlayer2Points.trim()) {
          throw new Error('Enter your points amount (Player 2)');
        }

        // Parse Player 2's points
        const p2Points = parsePoints(importPlayer2Points);
        if (!p2Points || p2Points <= 0n) {
          throw new Error('Invalid Player 2 points');
        }

        // Parse auth entry to extract game parameters
        // The auth entry contains: session_id, player1, player1_points
        console.log('Parsing auth entry to extract game parameters...');
        const gameParams = chainSlicerService.parseAuthEntry(importAuthEntryXDR.trim());

        console.log('Extracted from auth entry:', {
          sessionId: gameParams.sessionId,
          player1: gameParams.player1,
          player1Points: gameParams.player1Points.toString(),
        });

        // Auto-populate read-only fields from parsed auth entry (for display)
        setImportSessionId(gameParams.sessionId.toString());
        setImportPlayer1(gameParams.player1);
        setImportPlayer1Points((Number(gameParams.player1Points) / 10_000_000).toString());

        // Verify the user is Player 2 (prevent self-play)
        if (gameParams.player1 === userAddress) {
          throw new Error('Invalid game: You cannot play against yourself (you are Player 1 in this auth entry)');
        }

        // Additional validation: Ensure Player 2 address is different from Player 1
        // (In case user manually edits the Player 2 field)
        if (userAddress === gameParams.player1) {
          throw new Error('Cannot play against yourself. Player 2 must be different from Player 1.');
        }

        const signer = getContractSigner();

        // Step 1: Import Player 1's signed auth entry and rebuild transaction
        // New simplified API - only needs: auth entry, player 2 address, player 2 points
        console.log('Importing Player 1 auth entry and rebuilding transaction...');
        const fullySignedTxXDR = await chainSlicerService.importAndSignAuthEntry(
          importAuthEntryXDR.trim(),
          userAddress, // Player 2 address (current user)
          p2Points,
          signer
        );

        // Step 2: Player 2 finalizes and submits (they are the transaction source)
        console.log('Simulating and submitting transaction...');
        await chainSlicerService.finalizeStartGame(
          fullySignedTxXDR,
          userAddress,
          signer
        );

        // If we get here, transaction succeeded! Now update state.
        console.log('Transaction submitted successfully! Updating state...');
        setSessionId(gameParams.sessionId);
        setSuccess('Game created successfully! Both players signed.');

        // Clear import fields
        setImportAuthEntryXDR('');
        setImportSessionId('');
        setImportPlayer1('');
        setImportPlayer1Points('');
        setImportPlayer2Points(DEFAULT_POINTS);

        // Load the newly created game state using the known sessionId directly
        // (React state update from setSessionId above won't be visible yet in this render cycle)
        try {
          const game = await chainSlicerService.getGame(gameParams.sessionId);
          setGameState(game);
        } catch (err) {
          console.log('Game state not available yet after import:', err);
        }

        setGamePhase('play');

        // Refresh dashboard to show updated available points (locked in game)
        onStandingsRefresh();

        // Clear success message after 2 seconds
        setTimeout(() => setSuccess(null), 2000);
      } catch (err) {
        console.error('Import transaction error:', err);
        // Extract detailed error message if available
        let errorMessage = 'Failed to import and sign transaction';
        if (err instanceof Error) {
          errorMessage = err.message;

          // Check for common Soroban errors
          if (err.message.includes('simulation failed')) {
            errorMessage = `Simulation failed: ${err.message}. Check that you have enough Points and the game parameters are correct.`;
          } else if (err.message.includes('transaction failed')) {
            errorMessage = `Transaction failed: ${err.message}. The game could not be created on the blockchain.`;
          }
        }

        setError(errorMessage);

        // Keep the component in 'create' phase so user can see the error and retry
        // Don't change gamePhase or clear any fields - let the user see what went wrong
      } finally {
        setLoading(false);
      }
    });
  };

  const handleLoadExistingGame = async () => {
    await runAction(async () => {
      try {
        setLoading(true);
        setError(null);
        setSuccess(null);
        const parsedSessionId = parseInt(loadSessionId.trim());
        if (isNaN(parsedSessionId) || parsedSessionId <= 0) {
          throw new Error('Enter a valid session ID');
        }

        // Try to load the game (use cache to prevent duplicate calls)
        const game = await requestCache.dedupe(
          createCacheKey('game-state', parsedSessionId),
          () => chainSlicerService.getGame(parsedSessionId),
          5000
        );

        // Verify game exists and user is one of the players
        if (!game) {
          throw new Error('Game not found');
        }

        if (game.player1 !== userAddress && game.player2 !== userAddress) {
          throw new Error('You are not a player in this game');
        }

        // Load successful - update session ID and transition to game
        setSessionId(parsedSessionId);
        setGameState(game);
        setLoadSessionId('');

        // Determine game phase based on game state
        if (game.winner !== null && game.winner !== undefined) {
          setGamePhase('play');
          setTurnPhase('finished');
          setContractResult(game);
          setSuccess('Game loaded — already complete.');
        } else {
          setGamePhase('play');
          setSuccess('Game loaded!');
        }

        // Clear success message after 2 seconds
        setTimeout(() => setSuccess(null), 2000);
      } catch (err) {
        console.error('Load game error:', err);
        setError(err instanceof Error ? err.message : 'Failed to load game');
      } finally {
        setLoading(false);
      }
    });
  };

  const copyAuthEntryToClipboard = async () => {
    if (exportedAuthEntryXDR) {
      try {
        await navigator.clipboard.writeText(exportedAuthEntryXDR);
        setAuthEntryCopied(true);
        setTimeout(() => setAuthEntryCopied(false), 2000);
      } catch (err) {
        console.error('Failed to copy auth entry XDR:', err);
        setError('Failed to copy to clipboard');
      }
    }
  };

  const copyShareGameUrlWithAuthEntry = async () => {
    if (exportedAuthEntryXDR) {
      try {
        // Build URL with only Player 1's info and auth entry
        // Player 2 will specify their own points when they import
        const params = new URLSearchParams({
          'game': 'chain-slicer',
          'auth': exportedAuthEntryXDR,
        });

        const shareUrl = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
        await navigator.clipboard.writeText(shareUrl);
        setShareUrlCopied(true);
        setTimeout(() => setShareUrlCopied(false), 2000);
      } catch (err) {
        console.error('Failed to copy share URL:', err);
        setError('Failed to copy to clipboard');
      }
    }
  };

  const copyShareGameUrlWithSessionId = async () => {
    if (loadSessionId) {
      try {
        const shareUrl = `${window.location.origin}${window.location.pathname}?game=chain-slicer&session-id=${loadSessionId}`;
        await navigator.clipboard.writeText(shareUrl);
        setShareUrlCopied(true);
        setTimeout(() => setShareUrlCopied(false), 2000);
      } catch (err) {
        console.error('Failed to copy share URL:', err);
        setError('Failed to copy to clipboard');
      }
    }
  };

  const isPlayer1 = gameState && gameState.player1 === userAddress;
  const isPlayer2 = gameState && gameState.player2 === userAddress;
  // Format timer as M:SS
  const formatTimer = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const isCanvasActive = (turnPhase === 'p1_play' || turnPhase === 'p2_play') &&
    (slicerStatus === 'playing' || slicerStatus === 'loading');

  const hasOverlay = slicerStatus === 'ended' || turnPhase === 'p1_proving' || turnPhase === 'p1_submitting'
    || turnPhase === 'p2_waiting' || turnPhase === 'p2_proving' || turnPhase === 'p2_submitting'
    || turnPhase === 'verifying' || turnPhase === 'finished'
    || turnPhase === 'waiting_for_p1' || turnPhase === 'waiting_for_p2' || turnPhase === 'waiting_for_result';

  return (
    <div className="bg-white/70 backdrop-blur-xl rounded-2xl p-8 shadow-xl border-2 border-purple-200">
      <div className="flex items-center mb-6">
        <div>
          <p className="text-xs text-gray-500 font-mono mt-1">
            Session ID: {sessionId}
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-gradient-to-r from-red-50 to-pink-50 border-2 border-red-200 rounded-xl">
          <p className="text-sm font-semibold text-red-700">{error}</p>
        </div>
      )}

      {success && (
        <div className="mb-6 p-4 bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl">
          <p className="text-sm font-semibold text-green-700">{success}</p>
        </div>
      )}

      {/* CREATE GAME PHASE */}
      {gamePhase === 'create' && (
        <div className="space-y-6">
          {/* Mode Toggle */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 p-2 bg-gray-100 rounded-xl">
            <button
              onClick={() => {
                setCreateMode('create');
                setExportedAuthEntryXDR(null);
                setImportAuthEntryXDR('');
                setImportSessionId('');
                setImportPlayer1('');
                setImportPlayer1Points('');
                setImportPlayer2Points(DEFAULT_POINTS);
                setLoadSessionId('');
              }}
              className={`flex-1 py-3 px-4 rounded-lg font-bold text-sm transition-all ${
                createMode === 'create'
                  ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              Create & Export
            </button>
            <button
              onClick={() => {
                setCreateMode('import');
                setExportedAuthEntryXDR(null);
                setLoadSessionId('');
              }}
              className={`flex-1 py-3 px-4 rounded-lg font-bold text-sm transition-all ${
                createMode === 'import'
                  ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              Import Auth Entry
            </button>
            <button
              onClick={() => {
                setCreateMode('load');
                setExportedAuthEntryXDR(null);
                setImportAuthEntryXDR('');
                setImportSessionId('');
                setImportPlayer1('');
                setImportPlayer1Points('');
                setImportPlayer2Points(DEFAULT_POINTS);
              }}
              className={`flex-1 py-3 px-4 rounded-lg font-bold text-sm transition-all ${
                createMode === 'load'
                  ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-lg'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              Load Existing Game
            </button>
          </div>

          <div className="p-4 bg-gradient-to-r from-yellow-50 to-orange-50 border-2 border-yellow-200 rounded-xl">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-yellow-900">⚡ Quickstart (Dev)</p>
                <p className="text-xs font-semibold text-yellow-800">
                  Creates and signs for both dev wallets in one click. Works only in the Games Library.
                </p>
              </div>
              <button
                onClick={handleQuickStart}
                disabled={isBusy || !quickstartAvailable}
                className="px-4 py-3 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 disabled:from-gray-200 disabled:to-gray-300 disabled:text-gray-500 transition-all shadow-md hover:shadow-lg transform hover:scale-105 disabled:transform-none"
              >
                {quickstartLoading ? 'Quickstarting...' : '⚡ Quickstart Game'}
              </button>
            </div>
          </div>

          {createMode === 'create' ? (
            <div className="space-y-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                Your Address (Player 1)
              </label>
              <input
                type="text"
                value={player1Address}
                onChange={(e) => setPlayer1Address(e.target.value.trim())}
                placeholder="G..."
                className="w-full px-4 py-3 rounded-xl bg-white border-2 border-gray-200 focus:outline-none focus:border-purple-400 focus:ring-4 focus:ring-purple-100 text-sm font-medium text-gray-700"
              />
              <p className="text-xs font-semibold text-gray-600 mt-1">
                Pre-filled from your connected wallet. If you change it, you must be able to sign as that address.
              </p>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                Your Points
              </label>
              <input
                type="text"
                value={player1Points}
                onChange={(e) => setPlayer1Points(e.target.value)}
                placeholder="0.1"
                className="w-full px-4 py-3 rounded-xl bg-white border-2 border-gray-200 focus:outline-none focus:border-purple-400 focus:ring-4 focus:ring-purple-100 text-sm font-medium"
              />
              <p className="text-xs font-semibold text-gray-600 mt-1">
                Available: {(Number(availablePoints) / 10000000).toFixed(2)} Points
              </p>
            </div>

            <div className="p-3 bg-blue-50 border-2 border-blue-200 rounded-xl">
              <p className="text-xs font-semibold text-blue-800">
                ℹ️ Player 2 will specify their own address and points when they import your auth entry. You only need to prepare and export your signature.
              </p>
            </div>
          </div>

          <div className="pt-4 border-t-2 border-gray-100 space-y-4">
            <p className="text-xs font-semibold text-gray-600">
              Session ID: {sessionId}
            </p>

            {!exportedAuthEntryXDR ? (
              <button
                onClick={handlePrepareTransaction}
                disabled={isBusy}
                className="w-full py-4 rounded-xl font-bold text-white text-sm bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 disabled:from-gray-200 disabled:to-gray-300 disabled:text-gray-500 transition-all shadow-lg hover:shadow-xl transform hover:scale-105 disabled:transform-none"
              >
                {loading ? 'Preparing...' : 'Prepare & Export Auth Entry'}
              </button>
            ) : (
              <div className="space-y-3">
                <div className="p-4 bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl">
                  <p className="text-xs font-bold uppercase tracking-wide text-green-700 mb-2">
                    Auth Entry XDR (Player 1 Signed)
                  </p>
                  <div className="bg-white p-3 rounded-lg border border-green-200 mb-3">
                    <code className="text-xs font-mono text-gray-700 break-all">
                      {exportedAuthEntryXDR}
                    </code>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      onClick={copyAuthEntryToClipboard}
                      className="py-3 rounded-lg bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-bold text-sm transition-all shadow-md hover:shadow-lg transform hover:scale-105"
                    >
                      {authEntryCopied ? '✓ Copied!' : '📋 Copy Auth Entry'}
                    </button>
                    <button
                      onClick={copyShareGameUrlWithAuthEntry}
                      className="py-3 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white font-bold text-sm transition-all shadow-md hover:shadow-lg transform hover:scale-105"
                    >
                      {shareUrlCopied ? '✓ Copied!' : '🔗 Share URL'}
                    </button>
                  </div>
                </div>
                <p className="text-xs text-gray-600 text-center font-semibold">
                  Copy the auth entry XDR or share URL with Player 2 to complete the transaction
                </p>
              </div>
            )}
          </div>
            </div>
          ) : createMode === 'import' ? (
            /* IMPORT MODE */
            <div className="space-y-4">
              <div className="p-4 bg-gradient-to-br from-blue-50 to-cyan-50 border-2 border-blue-200 rounded-xl">
                <p className="text-sm font-semibold text-blue-800 mb-2">
                  📥 Import Auth Entry from Player 1
                </p>
                <p className="text-xs text-gray-700 mb-4">
                  Paste the auth entry XDR from Player 1. Session ID, Player 1 address, and their points will be auto-extracted. You only need to enter your points amount.
                </p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1 flex items-center gap-2">
                      Auth Entry XDR
                      {xdrParsing && (
                        <span className="text-blue-500 text-xs animate-pulse">Parsing...</span>
                      )}
                      {xdrParseSuccess && (
                        <span className="text-green-600 text-xs">✓ Parsed successfully</span>
                      )}
                      {xdrParseError && (
                        <span className="text-red-600 text-xs">✗ Parse failed</span>
                      )}
                    </label>
                    <textarea
                      value={importAuthEntryXDR}
                      onChange={(e) => setImportAuthEntryXDR(e.target.value)}
                      placeholder="Paste Player 1's signed auth entry XDR here..."
                      rows={4}
                      className={`w-full px-4 py-3 rounded-xl bg-white border-2 focus:outline-none focus:ring-4 text-xs font-mono resize-none transition-colors ${
                        xdrParseError
                          ? 'border-red-300 focus:border-red-400 focus:ring-red-100'
                          : xdrParseSuccess
                          ? 'border-green-300 focus:border-green-400 focus:ring-green-100'
                          : 'border-blue-200 focus:border-blue-400 focus:ring-blue-100'
                      }`}
                    />
                    {xdrParseError && (
                      <p className="text-xs text-red-600 font-semibold mt-1">
                        {xdrParseError}
                      </p>
                    )}
                  </div>
                  {/* Auto-populated fields from auth entry (read-only) */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1">Session ID (auto-filled)</label>
                      <input
                        type="text"
                        value={importSessionId}
                        readOnly
                        placeholder="Auto-filled from auth entry"
                        className="w-full px-4 py-2 rounded-xl bg-gray-50 border-2 border-gray-200 text-xs font-mono text-gray-600 cursor-not-allowed"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1">Player 1 Points (auto-filled)</label>
                      <input
                        type="text"
                        value={importPlayer1Points}
                        readOnly
                        placeholder="Auto-filled from auth entry"
                        className="w-full px-4 py-2 rounded-xl bg-gray-50 border-2 border-gray-200 text-xs text-gray-600 cursor-not-allowed"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Player 1 Address (auto-filled)</label>
                    <input
                      type="text"
                      value={importPlayer1}
                      readOnly
                      placeholder="Auto-filled from auth entry"
                      className="w-full px-4 py-2 rounded-xl bg-gray-50 border-2 border-gray-200 text-xs font-mono text-gray-600 cursor-not-allowed"
                    />
                  </div>
                  {/* User inputs */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1">Player 2 (You)</label>
                      <input
                        type="text"
                        value={userAddress}
                        readOnly
                        className="w-full px-4 py-2 rounded-xl bg-gray-50 border-2 border-gray-200 text-xs font-mono text-gray-600 cursor-not-allowed"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Your Points *</label>
                      <input
                        type="text"
                        value={importPlayer2Points}
                        onChange={(e) => setImportPlayer2Points(e.target.value)}
                        placeholder="e.g., 0.1"
                        className="w-full px-4 py-2 rounded-xl bg-white border-2 border-blue-200 focus:outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100 text-xs"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={handleImportTransaction}
                disabled={isBusy || !importAuthEntryXDR.trim() || !importPlayer2Points.trim()}
                className="w-full py-4 rounded-xl font-bold text-white text-lg bg-gradient-to-r from-blue-500 via-cyan-500 to-teal-500 hover:from-blue-600 hover:via-cyan-600 hover:to-teal-600 disabled:from-gray-200 disabled:to-gray-300 disabled:text-gray-500 transition-all shadow-xl hover:shadow-2xl transform hover:scale-105 disabled:transform-none"
              >
                {loading ? 'Importing & Signing...' : 'Import & Sign Auth Entry'}
              </button>
            </div>
          ) : createMode === 'load' ? (
            /* LOAD EXISTING GAME MODE */
            <div className="space-y-4">
              <div className="p-4 bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl">
                <p className="text-sm font-semibold text-green-800 mb-2">
                  🎮 Load Existing Game by Session ID
                </p>
                <p className="text-xs text-gray-700 mb-4">
                  Enter a session ID to load and continue an existing game. You must be one of the players.
                </p>
                <input
                  type="text"
                  value={loadSessionId}
                  onChange={(e) => setLoadSessionId(e.target.value)}
                  placeholder="Enter session ID (e.g., 123456789)"
                  className="w-full px-4 py-3 rounded-xl bg-white border-2 border-green-200 focus:outline-none focus:border-green-400 focus:ring-4 focus:ring-green-100 text-sm font-mono"
                />
              </div>

              <div className="p-4 bg-gradient-to-br from-yellow-50 to-amber-50 border-2 border-yellow-200 rounded-xl">
                <p className="text-xs font-bold text-yellow-800 mb-2">
                  Requirements
                </p>
                <ul className="text-xs text-gray-700 space-y-1 list-disc list-inside">
                  <li>You must be Player 1 or Player 2 in the game</li>
                  <li>Game must be active (not completed)</li>
                  <li>Valid session ID from an existing game</li>
                </ul>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={handleLoadExistingGame}
                  disabled={isBusy || !loadSessionId.trim()}
                  className="py-4 rounded-xl font-bold text-white text-lg bg-gradient-to-r from-green-500 via-emerald-500 to-teal-500 hover:from-green-600 hover:via-emerald-600 hover:to-teal-600 disabled:from-gray-200 disabled:to-gray-300 disabled:text-gray-500 transition-all shadow-xl hover:shadow-2xl transform hover:scale-105 disabled:transform-none"
                >
                  {loading ? 'Loading...' : '🎮 Load Game'}
                </button>
                <button
                  onClick={copyShareGameUrlWithSessionId}
                  disabled={!loadSessionId.trim()}
                  className="py-4 rounded-xl font-bold text-white text-lg bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 disabled:from-gray-200 disabled:to-gray-300 disabled:text-gray-500 transition-all shadow-xl hover:shadow-2xl transform hover:scale-105 disabled:transform-none"
                >
                  {shareUrlCopied ? '✓ Copied!' : '🔗 Share Game'}
                </button>
              </div>
              <p className="text-xs text-gray-600 text-center font-semibold">
                Load the game to continue playing, or share the URL with another player
              </p>
            </div>
          ) : null}
        </div>
      )}
      {gamePhase === 'play' && (
        <div style={{
          position: 'relative', width: '100%', height: 'calc(100vh - 160px)', minHeight: '400px',
          background: '#0d0d14', borderRadius: 14, overflow: 'hidden',
        }}>
          <canvas ref={canvasRef}
            style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none', cursor: 'crosshair',
              filter: hasOverlay ? 'blur(3px)' : 'none', transition: 'filter 0.4s ease' }}
            onPointerDown={handlePointerDown} onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp} />
          <a href="https://xray.games" target="_blank" rel="noopener noreferrer"
            style={{ position: 'absolute', bottom: 12, right: 14, zIndex: 20,
              padding: '4px 12px', borderRadius: 8,
              background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255,255,255,0.08)',
              fontFamily: "'Rajdhani', sans-serif", fontSize: '0.65rem', fontWeight: 600,
              letterSpacing: '0.08em', color: 'rgba(255,255,255,0.7)',
              textDecoration: 'none', transition: 'color 0.2s, border-color 0.2s',
              pointerEvents: 'auto' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.35)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}>
            xray.games
          </a>
          <button
            onClick={() => {
              const el = canvasRef.current?.parentElement;
              if (!el) return;
              if (document.fullscreenElement) { document.exitFullscreen(); }
              else { el.requestFullscreen().catch(() => {}); }
            }}
            style={{ position: 'absolute', top: 14, right: 14, zIndex: 20,
              width: 32, height: 32, borderRadius: 8, cursor: 'pointer',
              background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255,255,255,0.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'border-color 0.2s, background 0.2s',
              pointerEvents: 'auto', padding: 0 }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; e.currentTarget.style.background = 'rgba(0,0,0,0.4)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.background = 'rgba(0,0,0,0.25)'; }}
            title="Toggle fullscreen">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 5V2h3M11 2h3v3M14 11v3h-3M5 14H2v-3" />
            </svg>
          </button>
          {isCanvasActive && (
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
              <div style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
                padding: '6px 24px', background: 'rgba(0,0,0,0.2)', backdropFilter: 'blur(12px)',
                borderRadius: 24, border: `1.5px solid ${currentPlayer === 1 ? P1_COLOR : P2_COLOR}30` }}>
                <span style={{ fontWeight: 700, fontSize: '0.95rem', letterSpacing: '0.12em',
                  color: currentPlayer === 1 ? P1_COLOR : P2_COLOR }}>
                  PLAYER {currentPlayer}
                </span>
              </div>
              <div style={{ position: 'absolute', top: 16, left: 16, padding: '5px 14px',
                background: 'rgba(0,0,0,0.2)', backdropFilter: 'blur(12px)', borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.04)', display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ fontFamily:'Rajdhani', fontSize: '0.8rem', fontWeight: 600, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em' }}>
                  {slicerLevel.current}/{slicerLevel.max}
                </span>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.06em', fontFamily: 'Rajdhani',
                  color: slicerTimer < 15 ? '#ef4444' : slicerTimer < 30 ? '#fbbf24' : 'rgba(255,255,255,0.5)' }}>
                  {formatTimer(slicerTimer)}
                </span>
              </div>
            </div>
          )}

          {hasOverlay && (
            <style>{`
              .ov-panel {
                display: flex; flex-direction: column; align-items: center; gap: 18px;
                padding: 40px 52px; min-width: 320px;
                background: rgba(12, 12, 20, 0.25);
                backdrop-filter: blur(28px); -webkit-backdrop-filter: blur(28px);
                border-radius: 28px;
                border: 1px solid rgba(255,255,255,0.08);
                box-shadow: 0 12px 48px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06);
                font-family: 'Rajdhani', sans-serif;
              }
              .ov-label {
                font-size: 0.7rem; font-weight: 600; color: rgba(255,255,255,0.3);
                text-transform: uppercase; letter-spacing: 0.2em;
              }
              .ov-title {
                margin: 0; font-size: 1.5rem; font-weight: 800; letter-spacing: -0.02em;
              }
              .ov-subtitle {
                font-size: 0.85rem; color: rgba(255,255,255,0.3); text-align: center; line-height: 1.6;
              }
              .ov-btn {
                padding: 12px 36px; border-radius: 16px; cursor: pointer;
                background: rgba(255,255,255,0.07);
                backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
                border: 1px solid rgba(255,255,255,0.12);
                font-size: 0.9rem; font-weight: 700; letter-spacing: 0.06em;
                box-shadow: 0 4px 20px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.08);
                transition: all 0.25s ease;
              }
              .ov-btn:hover {
                background: rgba(255,255,255,0.12);
                border-color: rgba(255,255,255,0.2);
                box-shadow: 0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.12);
              }
              .ov-spinner {
                position: relative; width: 44px; height: 44px;
              }
              .ov-spinner::before, .ov-spinner::after {
                content: ''; position: absolute; inset: 0; border-radius: 50%;
              }
              .ov-spinner::before {
                border: 2px solid rgba(255,255,255,0.06);
              }
              .ov-spinner::after {
                border: 2px solid transparent;
                animation: spin 1s linear infinite;
              }
              .ov-spinner.p1::after { border-top-color: ${P1_COLOR}; }
              .ov-spinner.p2::after { border-top-color: ${P2_COLOR}; }
              .ov-spinner.neutral::after { border-top-color: rgba(255,255,255,0.5); }
              .ov-elapsed {
                font-size: 0.8rem; color: rgba(255,255,255,0.25);
                font-family: 'Rajdhani', sans-serif;
              }
              .ov-score-row {
                display: flex; align-items: center; gap: 16px; width: 100%;
                padding: 12px 20px; border-radius: 14px;
                background: rgba(255,255,255,0.03);
                border: 1px solid rgba(255,255,255,0.06);
              }
              .ov-score-label { font-size: 0.85rem; font-weight: 700; }
              .ov-score-val { font-size: 1.1rem; font-weight: 800; margin-left: auto; font-family: 'Rajdhani', sans-serif; }
              @keyframes spin { to { transform: rotate(360deg); } }
              @keyframes pulse { 0%, 100% { transform: scale(1); opacity: 0.3; } 50% { transform: scale(1.3); opacity: 0; } }
              @keyframes winnerGlow { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }
              @keyframes confettiDrift {
                0% { transform: translateY(-10px) rotate(0deg); opacity: 1; }
                100% { transform: translateY(20px) rotate(180deg); opacity: 0; }
              }
            `}</style>
          )}
          {slicerStatus === 'ended' && (turnPhase === 'p1_play' || turnPhase === 'p2_play') && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.15)' }}>
              <div className="ov-panel">
                <span className="ov-label">Levels Complete</span>
                <h2 className="ov-title" style={{ fontFamily:'Rajdhani', color: currentPlayer === 1 ? P1_COLOR : P2_COLOR }}>
                  Player {currentPlayer}
                </h2>
                <button className="ov-btn" onClick={handleGenerateProof}
                  style={{ fontFamily:'Rajdhani', color: currentPlayer === 1 ? P1_COLOR : P2_COLOR, borderColor: `${currentPlayer === 1 ? P1_COLOR : P2_COLOR}30` }}>
                  GENERATE PROOF
                </button>
              </div>
            </div>
          )}
          {(turnPhase === 'p1_proving' || turnPhase === 'p2_proving') && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.15)' }}>
              <div className="ov-panel">
                <div className={`ov-spinner ${currentPlayer === 1 ? 'p1' : 'p2'}`} />
                <h2 className="ov-title" style={{ fontFamily:'Rajdhani', color: '#fff' }}>
                  Generating ZK Proof
                </h2>
                <span style={{ fontSize: '0.9rem', fontWeight: 600, color: currentPlayer === 1 ? P1_COLOR : P2_COLOR }}>
                  Player {currentPlayer}
                </span>
                <span className="ov-elapsed">{provingElapsed}s</span>
                <span className="ov-subtitle">This may take up to 2 minutes</span>
              </div>
            </div>
          )}
          {turnPhase === 'p1_submitting' && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.15)' }}>
              <div className="ov-panel">
                <div className="ov-spinner p1" />
                <h2 className="ov-title" style={{ fontFamily:'Rajdhani', color: '#fff' }}>Submitting to Contract</h2>
                <span style={{ fontSize: '0.9rem', fontWeight: 600, color: P1_COLOR }}>Player 1</span>
              </div>
            </div>
          )}
          {turnPhase === 'p2_waiting' && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.15)' }}>
              <div className="ov-panel" style={{ gap: 22 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <circle cx="9" cy="9" r="8" stroke={P1_COLOR} strokeWidth="1.5"/>
                    <path d="M5.5 9.5L7.5 11.5L12.5 6.5" stroke={P1_COLOR} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: P1_COLOR }}>Player 1 Submitted</span>
                </div>
                <h2 className="ov-title" style={{ fontFamily:'Rajdhani', color: P2_COLOR }}>Player 2</h2>
                <button className="ov-btn" onClick={handleP2TakeSeat}
                  style={{ fontFamily:'Rajdhani', color: P2_COLOR, borderColor: `${P2_COLOR}30` }}>
                  START PLAYING
                </button>
              </div>
            </div>
          )}
          {turnPhase === 'verifying' && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.15)' }}>
              <div className="ov-panel">
                <div className="ov-spinner p1" />
                <h2 className="ov-title" style={{ fontFamily:'Rajdhani', color: '#fff' }}>Verifying on Chain</h2>
                <span className="ov-subtitle">Submitting proofs to smart contract</span>
              </div>
            </div>
          )}
          {turnPhase === 'waiting_for_p1' && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.15)' }}>
              <div className="ov-panel">
                <div className="ov-spinner p1" />
                <h2 className="ov-title" style={{ fontFamily:'Rajdhani', color: '#fff' }}>Waiting for Player 1</h2>
                <span className="ov-subtitle">Player 1 is playing their turn...</span>
              </div>
            </div>
          )}
          {turnPhase === 'waiting_for_p2' && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.15)' }}>
              <div className="ov-panel">
                <div className="ov-spinner p2" />
                <h2 className="ov-title" style={{ fontFamily:'Rajdhani', color: '#fff' }}>Waiting for Player 2</h2>
                <span className="ov-subtitle">Player 2 is playing their turn...</span>
              </div>
            </div>
          )}
          {turnPhase === 'waiting_for_result' && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.15)' }}>
              <div className="ov-panel">
                <div className="ov-spinner neutral" />
                <h2 className="ov-title" style={{ fontFamily:'Rajdhani', color: '#fff' }}>Calculating Results</h2>
                <span className="ov-subtitle">Both players submitted, waiting for contract...</span>
              </div>
            </div>
          )}
          {turnPhase === 'finished' && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.15)' }}>
              {!contractResult ? (
                <div className="ov-panel">
                  <div className="ov-spinner neutral" />
                  <span className="ov-subtitle">Fetching result...</span>
                </div>
              ) : contractResult.error ? (
                <div className="ov-panel">
                  <span style={{ fontSize: '1rem', fontWeight: 700, color: '#ef4444' }}>{contractResult.error}</span>
                  <button className="ov-btn" onClick={fetchContractResult} style={{ fontFamily:'Rajdhani', color: 'rgba(255,255,255,0.6)' }}>Retry</button>
                </div>
              ) : (() => {
                const contractP1Score = contractResult?.player1_score ?? null;
                const contractP2Score = contractResult?.player2_score ?? null;
                const displayP1Score = contractP1Score !== null ? contractP1Score : p1Score;
                const displayP2Score = contractP2Score !== null ? contractP2Score : p2Score;
                const contractWinner = contractResult?.winner;
                const p1Won = contractWinner
                  ? contractWinner === gameState?.player1
                  : displayP1Score > displayP2Score;
                const winnerColor = p1Won ? P1_COLOR : P2_COLOR;
                const winnerNum = p1Won ? 1 : 2;
                const loserNum = p1Won ? 2 : 1;
                return (
                  <div className="ov-panel" style={{ gap: 0, padding: '44px 52px', minWidth: 360 }}>
                    <div style={{ fontSize: '3.5rem', lineHeight: 1, marginBottom: 8,
                      filter: `drop-shadow(0 0 20px ${winnerColor}60)`,
                      animation: 'winnerGlow 2s ease-in-out infinite' }}>
                      🏆
                    </div>
                    <span className="ov-label" style={{ marginBottom: 4 }}>Winner</span>
                    <h2 style={{ fontFamily:'Rajdhani', margin: 0, fontSize: '2rem', fontWeight: 900, color: winnerColor,
                      textShadow: `0 0 40px ${winnerColor}40`, letterSpacing: '-0.02em' }}>
                      Player {winnerNum}
                    </h2>
                    <div style={{ width: '80%', height: 1, background: 'rgba(255,255,255,0.06)', margin: '20px 0' }} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
                      <div className="ov-score-row" style={{ borderColor: p1Won ? `${P1_COLOR}25` : 'rgba(255,255,255,0.06)' }}>
                        <span className="ov-score-label" style={{ color: P1_COLOR }}>Player 1</span>
                        {p1Won && <span style={{ fontSize: '0.65rem', fontWeight: 700, color: P1_COLOR, padding: '2px 8px',
                          background: `${P1_COLOR}15`, borderRadius: 6 }}>WIN</span>}
                        <span className="ov-score-val" style={{ color: p1Won ? P1_COLOR : 'rgba(255,255,255,0.4)' }}>{displayP1Score}</span>
                      </div>
                      <div className="ov-score-row" style={{ borderColor: !p1Won ? `${P2_COLOR}25` : 'rgba(255,255,255,0.06)' }}>
                        <span className="ov-score-label" style={{ color: P2_COLOR }}>Player 2</span>
                        {!p1Won && <span style={{ fontSize: '0.65rem', fontWeight: 700, color: P2_COLOR, padding: '2px 8px',
                          background: `${P2_COLOR}15`, borderRadius: 6 }}>WIN</span>}
                        <span className="ov-score-val" style={{ color: !p1Won ? P2_COLOR : 'rgba(255,255,255,0.4)' }}>{displayP2Score}</span>
                      </div>
                    </div>
                    <button className="ov-btn" onClick={handleStartNewGame}
                      style={{ fontFamily:'Rajdhani', color: 'rgba(255,255,255,0.5)', marginTop: 20 }}>
                      CLOSE
                    </button>
                  </div>
                );
              })()}
            </div>
          )}

          <style>{`
            @keyframes spin { to { transform: rotate(360deg); } }
            @keyframes pulse { 0%, 100% { transform: scale(1); opacity: 0.3; } 50% { transform: scale(1.3); opacity: 0; } }
            @keyframes fadeInOut { 0% { opacity: 0; } 15% { opacity: 1; } 75% { opacity: 1; } 100% { opacity: 0; } }
          `}</style>
        </div>
      )}

    </div>
  );
}
