import {
    type ActionExample,
    type Content,
    type HandlerCallback,
    type IAgentRuntime,
    type Memory,
    ModelClass,
    type State,
    elizaLogger,
    type Action,
    composeContext,
    generateObject,
} from "@elizaos/core";
import type { KeyPairString } from "near-api-js/lib/utils";
import { Bitcoin, EVM, signAndSend } from "multichain-tools";
import { KeyPair } from "near-api-js";
import { z, type ZodType } from "zod";
import { getBitcoinConfig, getDerivationPath, getEvmConfig, parseBTC, parseETH } from "../utils/multichain";

export interface TransferContent extends Content {
    recipient: string;
    amount: string | number;
    symbol: string;
}

export const TransferSchema: ZodType = z.object({
    recipient: z.string(),
    amount: z.string().or(z.number()),
    symbol: z.enum(["BTC", "ETH"]),
});

function isTransferContent(
    _runtime: IAgentRuntime,
    content: unknown
): content is TransferContent {
    return (
        typeof (content as TransferContent).recipient === "string" &&
        (typeof (content as TransferContent).amount === "string" ||
            typeof (content as TransferContent).amount === "number") &&
        typeof (content as TransferContent).symbol === "string"
    );
}

const transferTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.

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

async function transferBTC(
    runtime: IAgentRuntime,
    recipient: string,
    amount: string
): Promise<string> {
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
            publicKey: publicKey,
        },
        chainConfig: {
            network: config.network,
            providerUrl: config.providerUrl,
            contract: config.contract,
        },
        nearAuthentication: {
            accountId: accountId,
            networkId: config.nearNetworkId,
        },
        derivationPath,
    }, KeyPair.fromString(secretKey as KeyPairString));

    if (response.success) {
        return response.transactionHash;
    } else {
        throw new Error(`Transfer BTC failed with error: ${response.errorMessage}`);
    }
}

async function transferEth(
    runtime: IAgentRuntime,
    recipient: string,
    amount: string
): Promise<string> {
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
            from: address,
        },
        chainConfig: {
            providerUrl: config.providerUrl,
            contract: config.contract,
        },
        nearAuthentication: {
            accountId: accountId,
            networkId: config.nearNetworkId,
        },
        derivationPath,
    }, KeyPair.fromString(secretKey as KeyPairString));

    if (response.success) {
        return response.transactionHash;
    } else {
        throw new Error(`Transfer ETH failed with error: ${response.errorMessage}`);
    }
}

async function transfer(
    runtime: IAgentRuntime,
    symbol: string,
    recipient: string,
    amount: string
): Promise<string> {
    switch (symbol) {
        case "BTC":
            return transferBTC(runtime, recipient, amount);
        case "ETH":
            return transferEth(runtime, recipient, amount);
        default:
            throw new Error(`Unsupported symbol to transfer: ${symbol}`);
    }
}

export const executeTransfer: Action = {
    name: "MULTI_CHAIN_TRANSFER_TOKEN",
    similes: ["MULTI_CHAIN_SEND_TOKEN", "MULTI_CHAIN_PAY_TOKEN"],
    validate: async (_runtime: IAgentRuntime, _message: Memory) => {
        return true; // Add your validation logic here
    },
    description: "Transfer tokens to another account on the same chain",
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: { [key: string]: unknown },
        callback?: HandlerCallback
    ): Promise<boolean> => {
        // Initialize or update state
        let currentState: State;

        if (!state) {
            currentState = (await runtime.composeState(message)) as State;
        } else {
            currentState = await runtime.updateRecentMessageState(state);
        }

        // Compose transfer context
        const transferContext = composeContext({
            state: currentState,
            template: transferTemplate,
        });

        // Generate transfer content
        const { object: content } = await generateObject({
            runtime,
            context: transferContext,
            modelClass: ModelClass.SMALL,
            schema: TransferSchema,
        });

        // Validate transfer content
        if (!isTransferContent(runtime, content)) {
            elizaLogger.error("Invalid content for MULTI_CHAIN_TRANSFER_TOKEN action:", content);
            if (callback) {
                callback({
                    text: "Unable to process transfer request. Invalid content provided.",
                    content: { error: "Invalid transfer content" },
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
                    text: `Successfully transferred ${content.amount} ${content.symbol} to ${content.recipient}\nTransaction: ${txHash}`,
                    content: {
                        success: true,
                        signature: txHash,
                        amount: content.amount,
                        recipient: content.recipient,
                    },
                });
            }

            return true;
        } catch (error) {
            elizaLogger.error(`Error during ${content.symbol} transfer: ${error}`);
            if (callback) {
                callback({
                    text: `Error transferring ${content.symbol}: ${error}`,
                    content: { error: error },
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
                    text: "Send 0.0001 BTC to tb1qc3m2lp0e23f9s30ajh3fpj5qm2h4j2z50xev47",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "I'll send 0.0001 BTC now...",
                    action: "MULTI_CHAIN_SEND_TOKEN",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Successfully sent 0.0001 BTC to tb1qc3m2lp0e23f9s30ajh3fpj5qm2h4j2z50xev47\nTransaction: ABC123XYZ",
                },
            },
        ],
    ] as ActionExample[][],
} as Action;
