import {
    type IAgentRuntime,
    type Memory,
    type Provider,
    type State,
    elizaLogger,
} from "@elizaos/core";
import { Bitcoin, type NearNetworkIds } from "multichain-tools";
import NodeCache from "node-cache";
import { BITCOIN_CONFIGS } from "../utils/multichain";

export class DerivedAddressProvider implements Provider {
    private cache: NodeCache;

    constructor(private accountId: string) {
        this.cache = new NodeCache({ stdTTL: 300 }); // Cache TTL set to 5 minutes
    }

    async get(
        runtime: IAgentRuntime,
        _message: Memory,
        _state?: State
    ): Promise<string | null> {
        return this.getDerivedAddress(runtime);
    }

    async getDerivedAddress(runtime: IAgentRuntime): Promise<string | null> {
        try {
            const cacheKey = `derived-address-bitcoin-${this.accountId}`;
            const cachedValue = this.cache.get<string>(cacheKey);
    
            if (cachedValue) {
                elizaLogger.log("Cache hit for fetchPortfolioValue");
                return cachedValue;
            }

            const networkId = runtime.getSetting("NEAR_NETWORK") as NearNetworkIds || "testnet";
            const bitcoin = new Bitcoin(BITCOIN_CONFIGS[networkId]);
            const { address } = await bitcoin.deriveAddressAndPublicKey(this.accountId, "bitcoin-1");

            this.cache.set(cacheKey, address);

            return address;
        } catch (error) {
            elizaLogger.error(`Error in derived address provider: ${error}`);
            return null;
        }
    }
}

const walletProvider: Provider = {
    get: async (
        runtime: IAgentRuntime,
        _message: Memory,
        _state?: State
    ): Promise<string | null> => {
        try {
            const accountId = runtime.getSetting("NEAR_ADDRESS");
            if (!accountId) {
                throw new Error("NEAR_ADDRESS not configured");
            }
            const provider = new DerivedAddressProvider(accountId);
            return await provider.get(runtime, _message, _state);
        } catch (error) {
            elizaLogger.error(`Error in get derived address provider: ${error}`);
            return null;
        }
    },
};

export { walletProvider };
