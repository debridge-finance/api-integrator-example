import 'dotenv/config';
import * as TronWebNS from 'tronweb';
import { createDebridgeBridgeOrder } from '../../utils/deBridge/createDeBridgeOrder';
import { deBridgeOrderInput } from '../../types';

async function main() {
  // --- ENV: TRON_RPC_URL must be https://api.trongrid.io --- 
  const privateKey = process.env.SIGNER_PK!;
  const tronFullnode = process.env.TRON_RPC_URL!;
  const tronGridKey = process.env.TRONGRID_API_KEY; // optional

  if (!privateKey || !tronFullnode) {
    throw new Error('Missing env: SIGNER_PK and TRON_RPC_URL are required.');
  }

  const tronWeb = new TronWebNS.TronWeb({
    fullHost: tronFullnode,
    headers: tronGridKey ? { 'TRON-PRO-API-KEY': tronGridKey } : undefined,
    privateKey,
  });

  const senderBase58 = tronWeb.defaultAddress.base58;
  const senderHex41 = tronWeb.defaultAddress.hex;
  console.log(`Sender: ${senderBase58} (${senderHex41})`);

  // === Build order for native TRX (sentinel T9yD14...) ===
  const TRX_SENTINEL = 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb';
  const amountSun = 20 * 1e6; // 2 TRX

  const orderInput: deBridgeOrderInput = {
    srcChainId: '100000026',
    srcChainTokenIn: TRX_SENTINEL,               // required by your API for native TRX
    srcChainTokenInAmount: String(amountSun),
    dstChainId: '7565164',
    dstChainTokenOut: '11111111111111111111111111111111',
    dstChainTokenOutRecipient: '862oLANNqhdXyUCwLJPBqUHrScrqNR4yoGWGTxjZftKs',
    account: senderBase58.toString(),
    srcChainOrderAuthorityAddress: senderBase58.toString(),
    dstChainOrderAuthorityAddress: '862oLANNqhdXyUCwLJPBqUHrScrqNR4yoGWGTxjZftKs',
  };

  const preBal = await tronWeb.trx.getBalance(senderBase58);
  console.log(`\nPre-tx TRX balance: ${(preBal / 1e6).toFixed(6)} TRX`);

  const order = await createDebridgeBridgeOrder(orderInput);
  if (!order?.tx?.to) throw new Error('Invalid order: missing tx.to');
  if (!order?.tx?.data || order.tx.data.length < 10) {
    // If there’s no calldata, this should be a pure native transfer; you can use sendTransaction.
    throw new Error('Order tx.data missing/too short for a contract call on Tron.');
  }
  if (!order?.tx?.value) throw new Error('Invalid order: missing tx.value');

  const feeLimit = 2000000; // 2 million SUN
  const inputData = order.tx.data.startsWith('0x') ? order.tx.data.substring(2) : order.tx.data;

  const unsignedTransaction = await tronWeb.transactionBuilder.triggerSmartContract(
    order.tx.to.replace(/^0x/, '41'), // 21 byte format (prefix + address)
    '', // Omit - the calldata is passed in the data field,
    {
      callValue: Number(order.tx.value || 0), // in SUN
      input: inputData,
      feeLimit
    },
    [], // empty parameters array
    tronWeb.address.fromPrivateKey(privateKey) || "" // signer
  );

  const signedTransaction = await tronWeb.trx.sign(unsignedTransaction.transaction, privateKey);

  // Send it. We get the tx immediately because the Tron API is used
  const receipt = await tronWeb.trx.sendRawTransaction(signedTransaction);

  console.log(receipt);

  const postBal = await tronWeb.trx.getBalance(senderBase58);
  console.log(`\nPost-tx TRX balance: ${(postBal / 1e6).toFixed(6)} TRX`);
  console.log('\n--- Done ---');
}

main().catch((e) => {
  console.error('\n🚨 FATAL ERROR:', e);
  process.exitCode = 1;
});
