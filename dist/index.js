import { elizaLogger, composeContext, generateObject, ModelClass } from '@elizaos/core';
import { Bitcoin, EVM, signAndSend } from 'multichain-tools';
import NodeCache from 'node-cache';
import BigNumber from 'bignumber.js';
import { KeyPair } from 'near-api-js';
import { z } from 'zod';

// src/providers/wallet.ts
var CHAIN_SIGNATURES_CONFIG = {
  mainnet: {
    nearNetworkId: "mainnet",
    contract: "v1.signer"
  },
  testnet: {
    nearNetworkId: "testnet",
    contract: "v1.signer-prod.testnet"
  }
};
var CHAIN_SIGNATURES_DERIVATION_PATHS = {
  "BTC": "bitcoin-1",
  "EVM": "evm-1"
};
var MEMPOOL_API_URL = {
  mainnet: "https://mempool.space/api",
  testnet: "https://mempool.space/testnet4/api"
  // use testnet4 as testnet3 will be deprecated
};
function getDerivationPath(chainType) {
  return CHAIN_SIGNATURES_DERIVATION_PATHS[chainType];
}
function getBitcoinConfig(runtime) {
  const nearNetworkId = runtime.getSetting("NEAR_NETWORK") ?? "testnet";
  const providerUrl = runtime.getSetting("BTC_PROVIDER_URL") ?? (nearNetworkId === "mainnet" ? MEMPOOL_API_URL.mainnet : MEMPOOL_API_URL.testnet);
  const network = runtime.getSetting("BTC_NETWORK") ?? "testnet";
  return {
    ...CHAIN_SIGNATURES_CONFIG[nearNetworkId],
    network,
    providerUrl
  };
}
function getEvmConfig(runtime) {
  const nearNetworkId = runtime.getSetting("NEAR_NETWORK") ?? "testnet";
  const providerUrl = runtime.getSetting("EVM_PROVIDER_URL") ?? "https://sepolia.drpc.org";
  return {
    ...CHAIN_SIGNATURES_CONFIG[nearNetworkId],
    providerUrl
  };
}
function parseAmount(n, decimals) {
  return BigNumber(n).shiftedBy(decimals);
}
function parseBTC(n) {
  return parseAmount(n, 8).toNumber();
}
function parseETH(n) {
  return parseAmount(n, 18).toNumber();
}

// src/providers/wallet.ts
var DerivedAddressProvider = class {
  constructor(accountId) {
    this.accountId = accountId;
    this.cache = new NodeCache({ stdTTL: 300 });
  }
  async get(runtime, _message, _state) {
    return this.getDerivedAddress(runtime);
  }
  async getDerivedAddress(runtime) {
    try {
      const cacheKey = `derived-addresses-${this.accountId}`;
      const cachedValue = this.cache.get(cacheKey);
      if (cachedValue) {
        elizaLogger.log("Cache hit for fetchPortfolioValue");
        return cachedValue;
      }
      const bitcoin = new Bitcoin(getBitcoinConfig(runtime));
      const { address: btcAddress } = await bitcoin.deriveAddressAndPublicKey(this.accountId, getDerivationPath("BTC"));
      const evm = new EVM(getEvmConfig(runtime));
      const { address: evmAddress } = await evm.deriveAddressAndPublicKey(this.accountId, getDerivationPath("EVM"));
      const addresses = {
        btc: btcAddress,
        evm: evmAddress
      };
      elizaLogger.info(`Chain Signatures derived addresses:`, addresses);
      this.cache.set(cacheKey, addresses);
      return addresses;
    } catch (error) {
      elizaLogger.error(`Error in derived address provider: ${error}`);
      return null;
    }
  }
};
var walletProvider = {
  get: async (runtime, _message, _state) => {
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
  }
};
var TransferSchema = z.object({
  recipient: z.string(),
  amount: z.string().or(z.number()),
  symbol: z.enum(["BTC", "ETH"])
});
function isTransferContent(_runtime, content) {
  return typeof content.recipient === "string" && (typeof content.amount === "string" || typeof content.amount === "number") && typeof content.symbol === "string";
}
var transferTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.

Example response:
\`\`\`json
{
    "recipient": "tb1qc3m2lp0e23f9s30ajh3fpj5qm2h4j2z50xev47",
    "amount": "0.001",
    "symbol: "BTC",
}
\`\`\`

{{recentMessages}}

Given the recent messages and wallet information below:

{{walletInfo}}

Extract the following information about the requested token transfer:
- Recipient address
- Amount to transfer
- Symbol of the token to transfer

Respond with a JSON markdown block containing only the extracted values.`;
async function transferBTC(runtime, recipient, amount) {
  const accountId = runtime.getSetting("NEAR_ADDRESS");
  const secretKey = runtime.getSetting("NEAR_WALLET_SECRET_KEY");
  if (!accountId || !secretKey) {
    throw new Error("NEAR wallet credentials not configured");
  }
  const config = getBitcoinConfig(runtime);
  const bitcoin = new Bitcoin(config);
  const derivationPath = getDerivationPath("BTC");
  const { address, publicKey } = await bitcoin.deriveAddressAndPublicKey(accountId, derivationPath);
  const response = await signAndSend.keyPair.signAndSendBTCTransaction({
    transaction: {
      to: recipient,
      value: parseBTC(Number(amount)).toFixed(),
      from: address,
      publicKey
    },
    chainConfig: {
      network: config.network,
      providerUrl: config.providerUrl,
      contract: config.contract
    },
    nearAuthentication: {
      accountId,
      networkId: config.nearNetworkId
    },
    derivationPath
  }, KeyPair.fromString(secretKey));
  if (response.success) {
    return response.transactionHash;
  } else {
    throw new Error(`Transfer BTC failed with error: ${response.errorMessage}`);
  }
}
async function transferEth(runtime, recipient, amount) {
  const accountId = runtime.getSetting("NEAR_ADDRESS");
  const secretKey = runtime.getSetting("NEAR_WALLET_SECRET_KEY");
  if (!accountId || !secretKey) {
    throw new Error("NEAR wallet credentials not configured");
  }
  const config = getEvmConfig(runtime);
  const evm = new EVM(config);
  const derivationPath = getDerivationPath("EVM");
  const { address } = await evm.deriveAddressAndPublicKey(accountId, derivationPath);
  const response = await signAndSend.keyPair.signAndSendEVMTransaction({
    transaction: {
      to: recipient,
      value: parseETH(Number(amount)).toFixed(),
      from: address
    },
    chainConfig: {
      providerUrl: config.providerUrl,
      contract: config.contract
    },
    nearAuthentication: {
      accountId,
      networkId: config.nearNetworkId
    },
    derivationPath
  }, KeyPair.fromString(secretKey));
  if (response.success) {
    return response.transactionHash;
  } else {
    throw new Error(`Transfer ETH failed with error: ${response.errorMessage}`);
  }
}
async function transfer(runtime, symbol, recipient, amount) {
  switch (symbol) {
    case "BTC":
      return transferBTC(runtime, recipient, amount);
    case "ETH":
      return transferEth(runtime, recipient, amount);
    default:
      throw new Error(`Unsupported symbol to transfer: ${symbol}`);
  }
}
var executeTransfer = {
  name: "MULTI_CHAIN_TRANSFER_TOKEN",
  similes: ["MULTI_CHAIN_SEND_TOKEN", "MULTI_CHAIN_PAY_TOKEN"],
  validate: async (_runtime, _message) => {
    return true;
  },
  description: "Transfer tokens to another account on the same chain",
  handler: async (runtime, message, state, _options, callback) => {
    let currentState;
    if (!state) {
      currentState = await runtime.composeState(message);
    } else {
      currentState = await runtime.updateRecentMessageState(state);
    }
    const transferContext = composeContext({
      state: currentState,
      template: transferTemplate
    });
    const { object: content } = await generateObject({
      runtime,
      context: transferContext,
      modelClass: ModelClass.SMALL,
      schema: TransferSchema
    });
    if (!isTransferContent(runtime, content)) {
      elizaLogger.error("Invalid content for MULTI_CHAIN_TRANSFER_TOKEN action:", content);
      if (callback) {
        callback({
          text: "Unable to process transfer request. Invalid content provided.",
          content: { error: "Invalid transfer content" }
        });
      }
      return false;
    }
    try {
      const txHash = await transfer(
        runtime,
        content.symbol,
        content.recipient,
        content.amount.toString()
      );
      if (callback) {
        callback({
          text: `Successfully transferred ${content.amount} ${content.symbol} to ${content.recipient}
Transaction: ${txHash}`,
          content: {
            success: true,
            signature: txHash,
            amount: content.amount,
            recipient: content.recipient
          }
        });
      }
      return true;
    } catch (error) {
      elizaLogger.error(`Error during ${content.symbol} transfer: ${error}`);
      if (callback) {
        callback({
          text: `Error transferring ${content.symbol}: ${error}`,
          content: { error }
        });
      }
      return false;
    }
  },
  examples: [
    [
      {
        user: "{{user1}}",
        content: {
          text: "Send 0.0001 BTC to tb1qc3m2lp0e23f9s30ajh3fpj5qm2h4j2z50xev47"
        }
      },
      {
        user: "{{user2}}",
        content: {
          text: "I'll send 0.0001 BTC now...",
          action: "MULTI_CHAIN_SEND_TOKEN"
        }
      },
      {
        user: "{{user2}}",
        content: {
          text: "Successfully sent 0.0001 BTC to tb1qc3m2lp0e23f9s30ajh3fpj5qm2h4j2z50xev47\nTransaction: ABC123XYZ"
        }
      }
    ]
  ]
};

// src/index.ts
var multichainPlugin = {
  name: "Multichain",
  description: "Multichain Plugin for Eliza",
  providers: [walletProvider],
  actions: [executeTransfer],
  evaluators: []
};
var index_default = multichainPlugin;

export { index_default as default, multichainPlugin };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map