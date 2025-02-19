import {
    type IAgentRuntime,
    type Memory,
    type Provider,
    type State,
    elizaLogger,
} from "@elizaos/core";
import { Bitcoin, EVM } from "multichain-tools";
import NodeCache from "node-cache";
import { getBitcoinConfig, getDerivationPath, getEvmConfig } from "../utils/multichain";
import { DerivedAddresses } from "../types";

export class DerivedAddressProvider implements Provider {
    private cache: NodeCache;

    constructor(private accountId: string) {
        this.cache = new NodeCache({ stdTTL: 300 }); // Cache TTL set to 5 minutes
    }

    async get(
        runtime: IAgentRuntime,
        _message: Memory,
        _state?: State
    ): Promise<DerivedAddresses | null> {
        return this.getDerivedAddress(runtime);
    }

    async getDerivedAddress(runtime: IAgentRuntime): Promise<DerivedAddresses | null> {
        try {
            const cacheKey = `derived-addresses-${this.accountId}`;
            const cachedValue = this.cache.get<DerivedAddresses>(cacheKey);
    
            if (cachedValue) {
                elizaLogger.log("Cache hit for fetchPortfolioValue");
                return cachedValue;
            }

            // get BTC derived address
            const bitcoin = new Bitcoin(getBitcoinConfig(runtime));
            const { address: btcAddress } = await bitcoin.deriveAddressAndPublicKey(this.accountId, getDerivationPath("BTC"));

            // get EVM derived address
            const evm = new EVM(getEvmConfig(runtime));
            const { address: evmAddress } = await evm.deriveAddressAndPublicKey(this.accountId, getDerivationPath("EVM"));

            const addresses = {
                btc: btcAddress,
                evm: evmAddress,
            };
            elizaLogger.info(`Chain Signatures derived addresses:`, addresses);
            this.cache.set(cacheKey, addresses);

            return addresses;
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
    ): Promise<DerivedAddresses | null> => {
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
