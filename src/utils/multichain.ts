import BigNumber from "bignumber.js";
import { BTCNetworkIds, ChainSignatureContracts, NearNetworkIds } from "multichain-tools";

export interface BitcoinConfig {
    nearNetworkId: NearNetworkIds;
    network: BTCNetworkIds;
    providerUrl: string;
    contract: ChainSignatureContracts;
}

export const BITCOIN_CONFIGS: Record<NearNetworkIds, BitcoinConfig> = {
    mainnet: {
        nearNetworkId: "mainnet",
        network: "mainnet",
        providerUrl: "https://mempool.space/api",
        contract: "v1.signer",
    },
    testnet: {
        nearNetworkId: "testnet",
        network: "testnet",
        providerUrl: "https://mempool.space/testnet4/api",
        contract: "v1.signer-prod.testnet",
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
