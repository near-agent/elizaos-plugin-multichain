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
import { Bitcoin, NearNetworkIds, signAndSend } from "multichain-tools";
import { KeyPair } from "near-api-js";
import { z, type ZodType } from "zod";
import { BITCOIN_CONFIGS, parseBTC } from "../utils/multichain";

export interface TransferContent extends Content {
    recipient: string;
    amount: string | number;
}

export const BtcTransferSchema: ZodType = z.object({
    recipient: z.string(),
    amount: z.string().or(z.number()),
});

function isTransferContent(
    _runtime: IAgentRuntime,
    content: unknown
): content is TransferContent {
    return (
        typeof (content as TransferContent).recipient === "string" &&
        (typeof (content as TransferContent).amount === "string" ||
            typeof (content as TransferContent).amount === "number")
    );
}

const transferTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.

Example response:
\`\`\`json
{
    "recipient": "tb1qc3m2lp0e23f9s30ajh3fpj5qm2h4j2z50xev47",
    "amount": "0.001",
}
\`\`\`

{{recentMessages}}

Given the recent messages and wallet information below:

{{walletInfo}}

Extract the following information about the requested token transfer:
- Recipient address (BTC account)
- Amount to transfer

Respond with a JSON markdown block containing only the extracted values.`;

async function transferBTC(
    runtime: IAgentRuntime,
    recipient: string,
    amount: string
): Promise<string> {
    const accountId = runtime.getSetting("NEAR_ADDRESS");
    const secretKey = runtime.getSetting("NEAR_WALLET_SECRET_KEY");

    if (!accountId || !secretKey) {
        throw new Error("BTC wallet credentials not configured");
    }

    const networkId = runtime.getSetting("NEAR_NETWORK") as NearNetworkIds || "testnet";
    const bitcoinConfig = BITCOIN_CONFIGS[networkId];
    const bitcoin = new Bitcoin(bitcoinConfig);

    const derivationPath = "bitcoin-1";
    const { address, publicKey } = await bitcoin.deriveAddressAndPublicKey(accountId, derivationPath);

    const response = await signAndSend.keyPair.signAndSendBTCTransaction({
        transaction: {
            to: recipient,
            value: parseBTC(Number(amount)).toFixed(),
            from: address,
            publicKey: publicKey,
        },
        chainConfig: {
            network: bitcoinConfig.network,
            providerUrl: bitcoinConfig.providerUrl,
            contract: bitcoinConfig.contract,
        },
        nearAuthentication: {
            accountId: accountId,
            networkId: bitcoinConfig.nearNetworkId,
        },
        derivationPath,
    }, KeyPair.fromString(secretKey as KeyPairString));

    if (response.success) {
        return response.transactionHash;
    } else {
        throw new Error(`Transfer BTC failed with error: ${response.errorMessage}`);
    }
}

export const executeBtcTransfer: Action = {
    name: "SEND_BTC",
    similes: ["TRANSFER_BTC", "PAY_BTC"],
    validate: async (_runtime: IAgentRuntime, _message: Memory) => {
        return true; // Add your validation logic here
    },
    description: "Transfer BTC to another account",
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
            schema: BtcTransferSchema,
        });

        // Validate transfer content
        if (!isTransferContent(runtime, content)) {
            elizaLogger.error("Invalid content for TRANSFER_BTC action:", content);
            if (callback) {
                callback({
                    text: "Unable to process transfer request. Invalid content provided.",
                    content: { error: "Invalid transfer content" },
                });
            }
            return false;
        }

        try {
            const txHash = await transferBTC(
                runtime,
                content.recipient,
                content.amount.toString()
            );

            if (callback) {
                callback({
                    text: `Successfully transferred ${content.amount} BTC to ${content.recipient}\nTransaction: ${txHash}`,
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
            elizaLogger.error(`Error during BTC transfer: ${error}`);
            if (callback) {
                callback({
                    text: `Error transferring BTC: ${error}`,
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
                    action: "SEND_BTC",
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
