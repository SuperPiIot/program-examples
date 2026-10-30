import {
    type Address,
    appendTransactionMessageInstruction,
    createTransactionMessage,
    generateKeyPairSigner,
    getAddressEncoder,
    getProgramDerivedAddress,
    type Instruction,
    type KeyPairSigner,
    lamports,
    pipe,
    setTransactionMessageFeePayerSigner,
    signTransactionMessageWithSigners,
    unwrapOption,
} from '@solana/kit';
import { findAssociatedTokenPda, getMintDecoder, getTokenDecoder, TOKEN_PROGRAM_ADDRESS } from '@solana-program/token';
import { assert } from 'chai';
import { FailedTransactionMetadata, LiteSVM } from 'litesvm';
import {
    createCreateAmmInstruction,
    createCreatePoolInstruction,
    createDepositLiquidityInstruction,
    createSwapExactTokensForTokensInstruction,
    createWithdrawLiquidityInstruction,
} from '../ts';

const addressEncoder = getAddressEncoder();

describe('Token Swap', () => {
    const svm = new LiteSVM();
    let programId: Address;
    let payer: KeyPairSigner;
    let tokenMintKeypair1: KeyPairSigner;
    let tokenMintKeypair2: KeyPairSigner;
    let ammKeypair: KeyPairSigner;
    let poolKeypair: KeyPairSigner;

    before(async () => {
        programId = (await generateKeyPairSigner()).address;
        svm.addProgramFromFile(programId, 'tests/fixtures/token_swap_program.so');

        payer = await generateKeyPairSigner();
        svm.airdrop(payer.address, lamports(10_000_000_000n));

        tokenMintKeypair1 = await generateKeyPairSigner();
        tokenMintKeypair2 = await generateKeyPairSigner();
        ammKeypair = await generateKeyPairSigner();
        poolKeypair = await generateKeyPairSigner();
    });

    async function sendTransaction(ix: Instruction) {
        const transactionMessage = pipe(
            createTransactionMessage({ version: 0 }),
            m => setTransactionMessageFeePayerSigner(payer, m),
            m => svm.setTransactionMessageLifetimeUsingLatestBlockhash(m),
            m => appendTransactionMessageInstruction(ix, m),
        );
        const signedTx = await signTransactionMessageWithSigners(transactionMessage);
        const result = svm.sendTransaction(signedTx);
        assert(!(result instanceof FailedTransactionMetadata), `transaction failed: ${result.toString()}`);
    }

    it('Create AMM!', async () => {
        const ix = createCreateAmmInstruction(
            ammKeypair,
            payer.address,
            programId,
        );

        await sendTransaction(ix);

        const ammInfo = svm.getAccount(ammKeypair.address);
        assert(ammInfo.exists, 'amm account not created');
    });

    it('Create Pool!', async () => {
        const ix = createCreatePoolInstruction(
            poolKeypair,
            payer.address,
            ammKeypair.address,
            tokenMintKeypair1.address,
            tokenMintKeypair2.address,
            payer,
            programId,
        );

        await sendTransaction(ix);

        const poolInfo = svm.getAccount(poolKeypair.address);
        assert(poolInfo.exists, 'pool account not created');
    });

    it('Deposit Liquidity!', async () => {
        const ix = createDepositLiquidityInstruction(
            poolKeypair.address,
            payer.address,
            tokenMintKeypair1.address,
            tokenMintKeypair2.address,
            payer,
            programId,
            100n,
            100n,
        );

        await sendTransaction(ix);

        const poolInfo = svm.getAccount(poolKeypair.address);
        assert(poolInfo.exists, 'pool account not updated');
    });

    it('Swap Exact Tokens For Tokens!', async () => {
        const ix = createSwapExactTokensForTokensInstruction(
            poolKeypair.address,
            payer.address,
            tokenMintKeypair1.address,
            tokenMintKeypair2.address,
            payer,
            programId,
            50n,
        );

        await sendTransaction(ix);

        const poolInfo = svm.getAccount(poolKeypair.address);
        assert(poolInfo.exists, 'pool account not updated');
    });

    it('Withdraw Liquidity!', async () => {
        const ix = createWithdrawLiquidityInstruction(
            poolKeypair.address,
            payer.address,
            tokenMintKeypair1.address,
            tokenMintKeypair2.address,
            payer,
            programId,
            50n,
        );

        await sendTransaction(ix);

        const poolInfo = svm.getAccount(poolKeypair.address);
        assert(poolInfo.exists, 'pool account not updated');
    });
});