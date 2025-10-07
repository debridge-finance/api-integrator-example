import {
  clusterApiUrl,
  ComputeBudgetProgram,
  Connection,
  Keypair,
  MessageV0,
  PACKET_DATA_SIZE,
  PublicKey,
  TransactionInstruction,
  VersionedTransaction
} from "@solana/web3.js";
import { constants, findAssociatedTokenAddress, helpers, spl, txs, programs } from "@debridge-finance/solana-utils";
import { ChainId, Solana } from "@debridge-finance/dln-client";
import bs58 from "bs58";
import { getEnvConfig } from "../../utils";

interface IOrderFromApi {
  orderId: { stringValue: string; bytesArrayValue: string };
  affiliateFee: { beneficiarySrc: { stringValue: string } };
  giveOfferWithMetadata: { tokenAddress: { stringValue: string } };
}

async function getUnlockedOrders({
  chainIds,
  beneficiaryAddress,
  ref,
}: { chainIds: number[]; beneficiaryAddress: PublicKey; ref?: string; }): Promise<IOrderFromApi[]> {
  const MAX = 100; // Max 100 records per request
  let n = 0;
  let lastOrders = [];
  lastOrders.length = MAX;
  let allOrders: IOrderFromApi[] = [];

  try {
    for (; ;) {
      const response = await fetch("https://stats-api.dln.trade/api/Orders/filteredList", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          giveChainIds: chainIds,
          takeChainIds: [],
          orderStates: ["ClaimedUnlock"],
          filter: beneficiaryAddress.toString(),
          referralCode: ref,
          skip: n * MAX,
          take: MAX,
        }),
      }).then((r) => r.json());

      n += 1;
      lastOrders = response.orders;
      allOrders = [...allOrders, ...response.orders];

      if (!lastOrders.length) {
        break;
      }
    }
  } catch (e) {
    console.error(e);
  }

  allOrders = allOrders.filter(
    (order) => order.affiliateFee.beneficiarySrc.stringValue === beneficiaryAddress.toString(),
  );

  return allOrders;
}

function buildWithdrawAffiliateFeeIx(client: Solana.DlnClient, orderId: Buffer, beneficiary: PublicKey, tokenMint: PublicKey, tokenProgram?: PublicKey) {
    const discriminator = [143, 79, 158, 208, 125, 51, 86, 85];
    tokenProgram = tokenProgram ?? new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
    const ix = new TransactionInstruction({
        keys: [
            { isSigner: true, isWritable: true, pubkey: beneficiary },
            { isSigner: false, isWritable: true, pubkey: findAssociatedTokenAddress(beneficiary, tokenMint, tokenProgram)[0] },
            { isSigner: false, isWritable: true, pubkey: client.source.accountsResolver.getGiveOrderStateAccount(orderId)[0] },
            { isSigner: false, isWritable: true, pubkey: client.source.accountsResolver.getGiveOrderWalletAddress(orderId)[0] },
            { isSigner: false, isWritable: false, pubkey: tokenMint },
            { isSigner: false, isWritable: false, pubkey: tokenProgram },
        ],
        programId: client.source.program.programId,
        data: Buffer.concat([Uint8Array.from(discriminator), Uint8Array.from(orderId)]),
    });

    return ix;
}

async function getWithdrawAffiliateFeeInstructions(client: Solana.DlnClient, orders: IOrderFromApi[]): Promise<{ instructions: TransactionInstruction[], orderIds: string[] }> {
  const orderIds: string[] = [];
  const instructions: TransactionInstruction[] = [];
  const chunks: PublicKey[][] = [];

  const wallets = orders.map(
    ({ orderId }) =>
      client.source.accountsResolver.getGiveOrderWalletAddress(Buffer.from(JSON.parse(orderId.bytesArrayValue)))[0],
  );

  for (let i = 0; i < wallets.length; i += 1000) {
    chunks.push(wallets.slice(i, i + 1000)); // 1000 wallets per request
  }

  const accounts = (
    await Promise.all(chunks.map((chunk) => client.connection.getMultipleAccountsInfo(chunk)))
  ).flat();

  for (const [i, order] of orders.entries()) {
    const account = spl.parseSplAccount(accounts[i]!.data);

    if (account?.amount) {
        instructions.push(
            buildWithdrawAffiliateFeeIx(
                client,
                Buffer.from(JSON.parse(order.orderId.bytesArrayValue)), 
                new PublicKey(order.affiliateFee.beneficiarySrc.stringValue), 
                new PublicKey(order.giveOfferWithMetadata.tokenAddress.stringValue),
                account.owner
            )
        )
      orderIds.push(order.orderId.stringValue);
    }
  }

  return { instructions, orderIds };
}

function splitInstructions(
  payer: PublicKey,
  data: { instructions: TransactionInstruction[], orderIds: string[] }
): { ixPacks: TransactionInstruction[][], orderIdsPacks: string[][] } {
  const { instructions, orderIds } = data;

  const defaultArgs = {
    payerKey: payer,
    recentBlockhash: constants.FAKE_BLOCKHASH,
  };

  const baseInstructions = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 30_000 }),
  ];

  const ixPacks = [];
  const orderIdsPacks = [];
  let subIxPack = [...baseInstructions];
  let subOrderIdsPacks: string[] = [];

  const compileTransaction = (instructions: TransactionInstruction[]) =>
    new VersionedTransaction(
      MessageV0.compile({
        instructions,
        ...defaultArgs,
      }),
    );

  const checkSize = (instructions: TransactionInstruction[]) =>
    txs.getTransactionSize(compileTransaction(instructions));

  for (const [i, instruction] of data.instructions.entries()) {
    const size = checkSize([...subIxPack, instruction]);

    if (size && size <= PACKET_DATA_SIZE) {
      subIxPack.push(instruction);
      subOrderIdsPacks.push(orderIds[i]);
    } else {
      ixPacks.push(subIxPack);
      orderIdsPacks.push(subOrderIdsPacks);
      subIxPack = [...baseInstructions, instruction];
      subOrderIdsPacks = [orderIds[i]];
    }
  }

  if (subIxPack.length > baseInstructions.length) {
    ixPacks.push(subIxPack);
    orderIdsPacks.push(subOrderIdsPacks);
  }

  return { ixPacks, orderIdsPacks };
}

async function main() {
  const { solPrivateKey, solRpcUrl } = getEnvConfig();

  const beneficiaryPubkey = "862oLANNqhdXyUCwLJPBqUHrScrqNR4yoGWGTxjZftKs"; // Put your public key here

  try {
    Keypair.fromSecretKey(bs58.decode(solPrivateKey));
    new PublicKey(beneficiaryPubkey);
  } catch (err) {
    console.error("Format: withdrawAffiliateFee <base58 signature PrivateKey> <beneficiary PubKey> [rpc]");
    console.error(err.message);
    process.exit();
  }

  const connection = new Connection(solRpcUrl ?? clusterApiUrl("mainnet-beta"));
  const client = new Solana.DlnClient(
    connection,
    programs.dlnSrc,
    programs.dlnDst,
    programs.deBridge,
    programs.settings,
  );
  const keypair = Keypair.fromSecretKey(bs58.decode(solPrivateKey));
  const wallet = new helpers.Wallet(keypair);

  const orders = await getUnlockedOrders({
    chainIds: [ChainId.Solana],
    beneficiaryAddress: new PublicKey(beneficiaryPubkey),
  });

  console.log(`Unclaimed orders: ${orders.length}`);

  const ordersData = await getWithdrawAffiliateFeeInstructions(client, orders);
  const { ixPacks, orderIdsPacks } = splitInstructions(keypair.publicKey, ordersData);

  const txs = ixPacks.map(
    (instructions) =>
      new VersionedTransaction(
        MessageV0.compile({
          instructions,
          payerKey: keypair.publicKey,
          recentBlockhash: constants.FAKE_BLOCKHASH,
        }),
      ),
  );

  console.log(`Total instructions: ${ordersData.instructions.length}, total transactions: ${txs.length}`);
  console.log('Withdrawal started...');

  for (const [i, tx] of txs.entries()) {
    const [id] = await helpers.sendAll(connection, wallet, tx, {
      blockhashCommitment: "finalized",
      simulationCommtiment: "confirmed",
    });
    console.log("-------------------------------");
    console.log("Orders batch:", orderIdsPacks[i]);
    console.log(`Tx: ${id}`);
    await helpers.sleep(5000);
  }

  console.log('Done');
}

main().catch(console.error);
