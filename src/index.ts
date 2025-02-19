import type { Plugin } from "@elizaos/core";
import { walletProvider } from "./providers/wallet";
import { executeBtcTransfer } from "./actions/transfer";

export const multichainPlugin: Plugin = {
    name: "Multichain",
    description: "Multichain Plugin for Eliza",
    providers: [walletProvider],
    actions: [executeBtcTransfer],
    evaluators: [],
};

export default multichainPlugin;
