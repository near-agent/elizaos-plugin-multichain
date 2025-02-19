import type { IAgentRuntime } from "@elizaos/core";
import { z } from "zod";

// Add ENV variable at the top
let ENV = "testnet";

export const nearEnvSchema = z.object({
    NEAR_WALLET_SECRET_KEY: z.string().min(1, "Wallet secret key is required"),
    NEAR_ADDRESS: z.string().min(1, "Near address is required"),
    NEAR_RPC_URL: z.string().min(1, "RPC URL is required"),
    networkId: z.string().default("testnet"),
    nodeUrl: z.string(),
    walletUrl: z.string(),
    explorerUrl: z.string(),
});

export type NearConfig = z.infer<typeof nearEnvSchema>;

export function getConfig(
    env: string | undefined | null = ENV ||
        process.env.NEAR_ENV
) {
    ENV = env || "testnet";
    switch (env) {
        case "mainnet":
            return {
                networkId: "mainnet",
                nodeUrl: "https://rpc.mainnet.near.org",
                walletUrl: "https://wallet.near.org",
                explorerUrl: "https://nearblocks.io",
            };
        case "testnet":
            return {
                networkId: "testnet",
                nodeUrl: "https://rpc.testnet.near.org",
                walletUrl: "https://wallet.testnet.near.org",
                explorerUrl: "https://testnet.nearblocks.io",
            };
        default:
            return {
                networkId: "mainnet",
                nodeUrl: "https://rpc.mainnet.near.org",
                walletUrl: "https://wallet.near.org",
                explorerUrl: "https://nearblocks.io",
            };
    }
}

export async function validateNearConfig(
    runtime: IAgentRuntime
): Promise<NearConfig> {
    try {
        const envConfig = getConfig(
            runtime.getSetting("NEAR_ENV") ?? undefined
        );
        const config = {
            NEAR_WALLET_SECRET_KEY:
                runtime.getSetting("NEAR_WALLET_SECRET_KEY") ||
                process.env.NEAR_WALLET_SECRET_KEY,
            NEAR_ADDRESS:
                runtime.getSetting("NEAR_ADDRESS") || process.env.NEAR_ADDRESS,
            NEAR_RPC_URL: runtime.getSetting("NEAR_RPC_URL") || process.env.NEAR_RPC_URL,
            ...envConfig, // Spread the environment-specific config
        };

        return nearEnvSchema.parse(config);
    } catch (error) {
        if (error instanceof z.ZodError) {
            const errorMessages = error.errors
                .map((err) => `${err.path.join(".")}: ${err.message}`)
                .join("\n");
            throw new Error(
                `Near configuration validation failed:\n${errorMessages}`
            );
        }
        throw error;
    }
}
