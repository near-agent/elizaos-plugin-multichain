import type { Plugin } from "@elizaos/core";
import { walletProvider } from "./providers/wallet";
import { executeTransfer } from "./actions/transfer";

export const multichainPlugin: Plugin = {
    name: "Multichain",
    description: "Multichain Plugin for Eliza",
    providers: [walletProvider],
    actions: [executeTransfer],
    evaluators: [],
};

export default multichainPlugin;
