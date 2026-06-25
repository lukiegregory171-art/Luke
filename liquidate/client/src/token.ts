/**
 * OPTIONAL, DEVNET-ONLY, NON-WAGERING (M5). Isolated, feature-flagged module for
 * read-only display of a Solana **devnet** SPL token balance, used solely to
 * unlock cosmetic skins. There is no signing, no transfer, no staking, no
 * wagering, no real value, and no mainnet — devnet tokens are worthless test
 * tokens. Nothing in the match or economy depends on this; with the flag off it
 * is never imported into the game flow.
 *
 * The balance is fetched read-only via the public devnet JSON-RPC (no library,
 * no private keys). "Connect wallet" only reads a public key from Phantom (if
 * present); you can also just paste a devnet address.
 */

const RPC =
  (import.meta.env.VITE_SOLANA_RPC as string | undefined) ?? 'https://api.devnet.solana.com';
const MINT = (import.meta.env.VITE_TOKEN_MINT as string | undefined) ?? '';

/** Feature flag — off unless the build sets VITE_TOKEN=1. */
export const TOKEN_ENABLED = (import.meta.env.VITE_TOKEN as string | undefined) === '1';
export const TOKEN_CONFIGURED = TOKEN_ENABLED && MINT.length > 0;

interface PhantomProvider {
  isPhantom?: boolean;
  connect(): Promise<{ publicKey: { toString(): string } }>;
}
declare global {
  interface Window {
    solana?: PhantomProvider;
  }
}

interface RpcTokenResponse {
  result?: {
    value?: {
      account: { data: { parsed: { info: { tokenAmount: { uiAmount: number | null } } } } };
    }[];
  };
}

/** Read-only connect: returns the wallet's public key (no signing), or null. */
export async function connectPhantom(): Promise<string | null> {
  const provider = window.solana;
  if (!provider?.isPhantom) return null;
  const res = await provider.connect();
  return res.publicKey.toString();
}

/** Read the owner's devnet balance of the configured SPL token (read-only). */
export async function fetchTokenBalance(owner: string): Promise<number> {
  if (!MINT) return 0;
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getTokenAccountsByOwner',
      params: [owner, { mint: MINT }, { encoding: 'jsonParsed' }],
    }),
  });
  const json = (await res.json()) as RpcTokenResponse;
  let total = 0;
  for (const acc of json.result?.value ?? []) {
    total += acc.account.data.parsed.info.tokenAmount.uiAmount ?? 0;
  }
  return total;
}
