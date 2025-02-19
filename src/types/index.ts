import { ChainSignatureContracts, NearNetworkIds } from "multichain-tools";

export interface DerivedAddresses {
    btc?: string;
    evm?: string;
}

export interface ChainSignaturesConfig {
    nearNetworkId: NearNetworkIds;
    contract: ChainSignatureContracts;
}
