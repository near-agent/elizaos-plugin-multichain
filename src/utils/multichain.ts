import BigNumber from "bignumber.js";
import { BTCNetworkIds, NearNetworkIds } from "multichain-tools";
import { ChainSignaturesConfig } from "../types";
import { IAgentRuntime } from "@elizaos/core";

export const CHAIN_SIGNATURES_CONFIG: Record<NearNetworkIds, ChainSignaturesConfig> = {
    mainnet: {
        nearNetworkId: "mainnet",
        contract: "v1.signer",
    },
    testnet: {
        nearNetworkId: "testnet",
        contract: "v1.signer-prod.testnet",
    }
}

export type CHAIN_TYPE = "BTC" | "EVM";

export const CHAIN_SIGNATURES_DERIVATION_PATHS: Record<CHAIN_TYPE, string> = {
    "BTC": "bitcoin-1",
    "EVM": "evm-1",
}

export const MEMPOOL_API_URL: Record<Exclude<BTCNetworkIds, "regtest">, string> = {
    mainnet: "https://mempool.space/api",
    testnet: "https://mempool.space/testnet4/api", // use testnet4 as testnet3 will be deprecated
}

export function getDerivationPath(chainType: CHAIN_TYPE): string {
    return CHAIN_SIGNATURES_DERIVATION_PATHS[chainType];
}

export function getBitcoinConfig(runtime: IAgentRuntime) {
    const nearNetworkId = runtime.getSetting("NEAR_NETWORK") as NearNetworkIds ?? "testnet";
    const providerUrl = runtime.getSetting("BTC_PROVIDER_URL") 
        ?? (nearNetworkId === 'mainnet' ? MEMPOOL_API_URL.mainnet : MEMPOOL_API_URL.testnet);
    const network = runtime.getSetting("BTC_NETWORK") as BTCNetworkIds ?? "testnet";
    return {
        ...CHAIN_SIGNATURES_CONFIG[nearNetworkId],
        network,
        providerUrl,
    }
}

export function getEvmConfig(runtime: IAgentRuntime) {
    const nearNetworkId = runtime.getSetting("NEAR_NETWORK") as NearNetworkIds ?? "testnet";
    const providerUrl = runtime.getSetting("EVM_PROVIDER_URL") ?? "https://sepolia.drpc.org";
    return {
        ...CHAIN_SIGNATURES_CONFIG[nearNetworkId],
        providerUrl,
    }
}

export function parseAmount(
    n: BigNumber | string | number,
    decimals: number,
): BigNumber {
    return BigNumber(n).shiftedBy(decimals);
}

export function parseBTC(n: number): number {
    return parseAmount(n, 8).toNumber();
}

export function parseETH(n: number): number {
    return parseAmount(n, 18).toNumber();
}
