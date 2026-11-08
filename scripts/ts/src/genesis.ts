/* eslint-disable no-console -- CLI script: progress output is the interface */
// Genesis: create the BACKSTOP mint and every protocol account on a cluster.
//
//   pnpm genesis:devnet                      (or --cluster localnet)
//
// Steps (mirror of the Rust test harness `full_genesis`, plus metadata, agent
// bounds, swap routes and the launchpad):
//   quote mint (test USDC unless --quote-mint) → engine mint (TransferHook +
//   metadata, no freeze) → hook config + reward ledger → full supply into the
//   pool vault, mint + metadata authority revoked → core market → AMM pool
//   (locked liquidity) → offer book → chests + Shield → agent authority +
//   bounds → mock swap routes (non-mainnet) → launchpad.
// Idempotent: rerunning skips accounts that already exist.

import { createHash } from "node:crypto";
import BN from "bn.js";
import {
  makePrograms,
  PROGRAM_IDS,
  TOKEN_2022,
  TOKEN_PROGRAM,
  USDC_MAINNET,
  WSOL,
  ata2022,
  ataClassic,
  pda,
} from "@backstop/sdk";
import {
  AuthorityType,
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMetadataPointerInstruction,
  createInitializeMint2Instruction,
  createInitializeTransferHookInstruction,
  createMintToInstruction,
  createSetAuthorityInstruction,
  createSyncNativeInstruction,
  ExtensionType,
  getMintLen,
  MINT_SIZE,
} from "@solana/spl-token";
import {
  createInitializeInstruction,
  createUpdateAuthorityInstruction,
  pack,
  type TokenMetadata,
} from "@solana/spl-token-metadata";
import { type Keypair, PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";

import {
  airdropIfNeeded,
  arg,
  cluster,
  connection,
  KeypairWallet,
  loadKeypair,
  persistentKeypair,
  Sender,
  writeOut,
} from "./common.js";

const SUPPLY = 1_000_000_000n * 10n ** 9n;
const USDC = 1_000_000n;
const bn = (v: bigint | number) => new BN(v.toString());
const sighash = (name: string) => createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);

export interface GenesisOut {
  cluster: string;
  mint: string;
  quoteMint: string;
  quoteAuthority?: string;
  governance: string;
  guardian: string;
  keeper: string;
  agent: string;
  quotePerSol: string;
  markets: { mint: string; quoteMint: string }[];
  createdAt: string;
}

async function exists(conn: ReturnType<typeof connection>, k: PublicKey) {
  return (await conn.getAccountInfo(k, "confirmed")) !== null;
}

async function main() {
  const c = cluster();
  const conn = connection(c);
  const deployer = loadKeypair(arg("deployer", process.env.DEPLOYER_KEYPAIR ?? "~/.config/solana/id.json")!);
  const tx = new Sender(conn, deployer);
  const programs = makePrograms(conn, new KeypairWallet(deployer));
  if (c === "mainnet-beta" && process.env.CONFIRM_MAINNET !== "I-UNDERSTAND-THIS-IS-MAINNET") {
    throw new Error("mainnet genesis requires CONFIRM_MAINNET=I-UNDERSTAND-THIS-IS-MAINNET");
  }
  await airdropIfNeeded(conn, deployer.publicKey, 20e9, c);

  // Roles: governance starts as the deployer and is handed to the Squads vault
  // with propose/accept_governance; service keys are separate.
  const governance = deployer;
  const guardian = arg("guardian") ? new PublicKey(arg("guardian")!) : persistentKeypair(c, "guardian").publicKey;
  const keeper = arg("keeper") ? new PublicKey(arg("keeper")!) : persistentKeypair(c, "keeper").publicKey;
  const agent = arg("agent") ? new PublicKey(arg("agent")!) : persistentKeypair(c, "agent").publicKey;
  const mintKp: Keypair = persistentKeypair(c, "backstop-mint");
  const mint = mintKp.publicKey;
  const quotePerSol = BigInt(arg("quote-per-sol", "150000000")!); // 150 USDC / SOL (manual oracle, non-mainnet)
  const liquidity = BigInt(arg("liquidity-usdc", "100000")!) * USDC;
  console.log(`BACKSTOP genesis on ${c}\n  deployer ${deployer.publicKey.toBase58()}\n  mint     ${mint.toBase58()}`);

  // ------------------------------------------------------------ quote mint
  let quoteMint: PublicKey;
  let quoteAuthority: Keypair | undefined;
  if (arg("quote-mint")) quoteMint = new PublicKey(arg("quote-mint")!);
  else if (c === "mainnet-beta") quoteMint = USDC_MAINNET;
  else {
    quoteAuthority = persistentKeypair(c, "test-usdc-authority");
    const qk = persistentKeypair(c, "test-usdc-mint");
    quoteMint = qk.publicKey;
    if (!(await exists(conn, quoteMint))) {
      const rent = await conn.getMinimumBalanceForRentExemption(MINT_SIZE);
      await tx.send(
        "test USDC mint",
        [
          SystemProgram.createAccount({
            fromPubkey: deployer.publicKey,
            newAccountPubkey: quoteMint,
            lamports: rent,
            space: MINT_SIZE,
            programId: TOKEN_PROGRAM,
          }),
          createInitializeMint2Instruction(quoteMint, 6, quoteAuthority.publicKey, null, TOKEN_PROGRAM),
        ],
        [qk],
      );
    }
  }

  // ----------------------------------------------------------- engine mint
  const meta: TokenMetadata = {
    mint,
    name: arg("name", "BACKSTOP")!,
    symbol: arg("symbol", "BSTP")!,
    uri: arg("uri", "https://backstop.example/token.json")!,
    additionalMetadata: [],
  };
  if (!(await exists(conn, mint))) {
    const space = getMintLen([ExtensionType.TransferHook, ExtensionType.MetadataPointer]);
    const metaLen = 4 + pack(meta).length + 64;
    const rent = await conn.getMinimumBalanceForRentExemption(space + metaLen);
    await tx.send(
      "engine mint (hook + metadata)",
      [
        SystemProgram.createAccount({
          fromPubkey: deployer.publicKey,
          newAccountPubkey: mint,
          lamports: rent,
          space,
          programId: TOKEN_2022,
        }),
        createInitializeTransferHookInstruction(mint, PublicKey.default, PROGRAM_IDS.hook, TOKEN_2022),
        createInitializeMetadataPointerInstruction(mint, null, mint, TOKEN_2022),
        createInitializeMint2Instruction(mint, 9, deployer.publicKey, null, TOKEN_2022),
        createInitializeInstruction({
          programId: TOKEN_2022,
          metadata: mint,
          updateAuthority: deployer.publicKey,
          mint,
          mintAuthority: deployer.publicKey,
          name: meta.name,
          symbol: meta.symbol,
          uri: meta.uri,
        }),
      ],
      [mintKp],
    );
  }

  // ------------------------------------------------------------- hook
  if (!(await exists(conn, pda.hookConfig(mint)))) {
    const ix = await programs.hook.methods
      .initialize({
        governance: governance.publicKey,
        genesisTs: bn(Math.floor(Date.now() / 1000)),
        epochSecs: bn(6 * 3600),
        tenureCapSecs: bn(90 * 86_400),
        tenureExtraBps: 20_000,
        absorbTenureBps: 4_000,
        directSellCap: bn(SUPPLY / 10_000n),
        linkMinAmount: bn(1_000_000_000n),
        linkWindowSecs: bn(86_400),
        directSellWindowSecs: bn(86_400),
      } as never)
      .accountsPartial({
        payer: deployer.publicKey,
        mintAuthority: deployer.publicKey,
        mint,
        config: pda.hookConfig(mint),
        extraMetas: pda.extraAccountMetas(mint),
        rewardState: pda.rewardState(mint),
        systemProgram: SystemProgram.programId,
      })
      .instruction();
    await tx.send("hook config", [ix]);
  }
  for (let i = 0; i < 6; i++) {
    const cfg = await programs.hook.account.hookConfig.fetch(pda.hookConfig(mint));
    if (cfg.rewardReady) break;
    const ix = await programs.hook.methods
      .growRewardState()
      .accountsPartial({
        payer: deployer.publicKey,
        config: pda.hookConfig(mint),
        rewardState: pda.rewardState(mint),
        systemProgram: SystemProgram.programId,
      })
      .instruction();
    await tx.send(`reward ledger grow ${i + 1}`, [ix]);
  }

  // ---------------------------------------------- supply → pool vault, revoke
  const pool = pda.pool(mint);
  const poolVault = ata2022(pool, mint);
  const mintInfo = await conn.getParsedAccountInfo(mint, "confirmed");
  const parsed = (mintInfo.value?.data as { parsed?: { info?: { mintAuthority?: string | null; supply?: string } } })
    .parsed?.info;
  if (parsed?.mintAuthority) {
    await tx.send("fixed supply → pool vault; revoke mint + metadata authority", [
      createAssociatedTokenAccountIdempotentInstruction(deployer.publicKey, poolVault, pool, mint, TOKEN_2022),
      createMintToInstruction(mint, poolVault, deployer.publicKey, SUPPLY, [], TOKEN_2022),
      createSetAuthorityInstruction(mint, deployer.publicKey, AuthorityType.MintTokens, null, [], TOKEN_2022),
      createUpdateAuthorityInstruction({
        programId: TOKEN_2022,
        metadata: mint,
        oldAuthority: deployer.publicKey,
        newAuthority: null,
      }),
    ]);
  }

  // ------------------------------------------------------------ market
  const market = pda.market(mint);
  const treasury = pda.treasury(mint);
  const swapProgram =
    c === "mainnet-beta"
      ? new PublicKey(arg("swap-program", "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4")!)
      : PROGRAM_IDS.mockSwap;
  const oracle =
    c === "mainnet-beta"
      ? { kind: 1, feed: new PublicKey(arg("pyth-feed")!), manualQuotePerSol: bn(0), maxStalenessSecs: 60 }
      : { kind: 0, feed: PublicKey.default, manualQuotePerSol: bn(quotePerSol), maxStalenessSecs: 120 };
  if (!(await exists(conn, market))) {
    const ix = await programs.core.methods
      .initMarket({
        governance: governance.publicKey,
        guardian,
        keeper,
        swapProgram,
        oracle,
        params: null,
        parent: PublicKey.default,
      } as never)
      .accountsPartial({
        payer: deployer.publicKey,
        authority: governance.publicKey,
        mint,
        hookConfig: pda.hookConfig(mint),
        quoteMint,
        market,
        treasury,
        feeVault: ataClassic(market, quoteMint),
        treasuryQuoteVault: ataClassic(treasury, quoteMint),
        parentVault: pda.parentVault(mint),
        quoteTokenProgram: TOKEN_PROGRAM,
        associatedTokenProgram: new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"),
        systemProgram: SystemProgram.programId,
      })
      .instruction();
    await tx.send("core market (mint verified on-chain)", [ix]);
  }

  // ---------------------------------------------------------- AMM pool
  if (!(await exists(conn, pool))) {
    const govQuote = ataClassic(governance.publicKey, quoteMint);
    const pre: TransactionInstruction[] = [
      createAssociatedTokenAccountIdempotentInstruction(
        deployer.publicKey,
        govQuote,
        governance.publicKey,
        quoteMint,
        TOKEN_PROGRAM,
      ),
    ];
    if (quoteAuthority)
      pre.push(createMintToInstruction(quoteMint, govQuote, quoteAuthority.publicKey, liquidity, [], TOKEN_PROGRAM));
    const ix = await programs.amm.methods
      .initPool(bn(liquidity))
      .accountsPartial({
        payer: deployer.publicKey,
        authority: governance.publicKey,
        market,
        mint,
        quoteMint,
        pool,
        ammBaseVault: poolVault,
        quoteVault: ataClassic(pool, quoteMint),
        payerQuote: govQuote,
        baseTokenProgram: TOKEN_2022,
        quoteTokenProgram: TOKEN_PROGRAM,
        associatedTokenProgram: new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"),
        systemProgram: SystemProgram.programId,
      })
      .instruction();
    await tx.send(
      `AMM pool (${liquidity / USDC} USDC locked forever)`,
      [...pre, ix],
      quoteAuthority ? [quoteAuthority] : [],
    );
  }

  // -------------------------------------------------------------- book
  const book = pda.book(mint);
  if (!(await exists(conn, book))) {
    const ix = await programs.offers.methods
      .initBook()
      .accountsPartial({
        payer: deployer.publicKey,
        authority: governance.publicKey,
        market,
        mint,
        quoteMint,
        book,
        escrowVault: ata2022(book, mint),
        baseTokenProgram: TOKEN_2022,
        associatedTokenProgram: new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"),
        systemProgram: SystemProgram.programId,
      })
      .instruction();
    await tx.send("offer book", [ix]);
  }

  // ------------------------------------------------------- chests + Shield
  const cm = pda.chestMarket(mint);
  if (!(await exists(conn, cm))) {
    const ra = pda.rewardsVaultAuthority(mint);
    const shield = pda.shield(mint);
    const ix = await programs.chest.methods
      .initChestMarket()
      .accountsPartial({
        payer: deployer.publicKey,
        authority: governance.publicKey,
        market,
        mint,
        quoteMint,
        chestMarket: cm,
        vault: ataClassic(cm, quoteMint),
        rewardsAuth: ra,
        holderRewardsVault: ataClassic(ra, quoteMint),
        shield,
        shieldQuoteVault: ataClassic(shield, quoteMint),
        shieldTokenVault: ata2022(shield, mint),
        shieldRewardsVault: pda.shieldRewardsVault(mint),
        baseTokenProgram: TOKEN_2022,
        quoteTokenProgram: TOKEN_PROGRAM,
        associatedTokenProgram: new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"),
        systemProgram: SystemProgram.programId,
      })
      .instruction();
    await tx.send("chests + Shield", [ix]);
  }

  // ------------------------------------------------- agent authority + bounds
  if (!(await exists(conn, pda.agent(mint)))) {
    const init = await programs.core.methods
      .initAgent(agent)
      .accountsPartial({
        governance: governance.publicKey,
        market,
        agentAuthority: pda.agent(mint),
        systemProgram: SystemProgram.programId,
      })
      .instruction();
    const bound = (param: string, min: bigint, max: bigint) =>
      programs.core.methods
        .setAgentBound({ [param]: {} } as never, true, bn(min), bn(max))
        .accountsPartial({ governance: governance.publicKey, market, agentAuthority: pda.agent(mint) })
        .instruction();
    await tx.send("agent authority + bounds", [
      init,
      await bound("yieldBufferBps", 1_500n, 3_000n),
      await bound("shieldPerOfferCap", 5_000n * USDC, 20_000n * USDC),
      await bound("shieldMaxShareBps", 3_000n, 5_000n),
    ]);
  }

  // ------------------------------------- mock swap routes (non-mainnet only)
  if (c !== "mainnet-beta") {
    const sol = 1_000_000_000n;
    for (const [mintIn, mintOut, num, den] of [
      [quoteMint, WSOL, sol, quotePerSol], // USDC → SOL at the oracle price
      [WSOL, quoteMint, quotePerSol, sol], // SOL → USDC
    ] as [PublicKey, PublicKey, bigint, bigint][]) {
      const mpool = PublicKey.findProgramAddressSync(
        [Buffer.from("mock_pool"), mintIn.toBuffer(), mintOut.toBuffer()],
        PROGRAM_IDS.mockSwap,
      )[0];
      if (await exists(conn, mpool)) continue;
      const data = Buffer.concat([
        sighash("init_pool"),
        bn(num).toArrayLike(Buffer, "le", 8),
        bn(den).toArrayLike(Buffer, "le", 8),
      ]);
      const init = new TransactionInstruction({
        programId: PROGRAM_IDS.mockSwap,
        keys: [
          { pubkey: deployer.publicKey, isSigner: true, isWritable: true },
          { pubkey: mintIn, isSigner: false, isWritable: false },
          { pubkey: mintOut, isSigner: false, isWritable: false },
          { pubkey: mpool, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data,
      });
      const outAta = ataClassic(mpool, mintOut);
      const fund: TransactionInstruction[] = [
        createAssociatedTokenAccountIdempotentInstruction(
          deployer.publicKey,
          ataClassic(mpool, mintIn),
          mpool,
          mintIn,
          TOKEN_PROGRAM,
        ),
        createAssociatedTokenAccountIdempotentInstruction(deployer.publicKey, outAta, mpool, mintOut, TOKEN_PROGRAM),
      ];
      if (mintOut.equals(WSOL))
        fund.push(
          SystemProgram.transfer({ fromPubkey: deployer.publicKey, toPubkey: outAta, lamports: 5n * sol }),
          createSyncNativeInstruction(outAta, TOKEN_PROGRAM),
        );
      else if (quoteAuthority)
        fund.push(
          createMintToInstruction(mintOut, outAta, quoteAuthority.publicKey, 1_000_000n * USDC, [], TOKEN_PROGRAM),
        );
      const mintsQuote = !mintOut.equals(WSOL) && quoteAuthority !== undefined;
      await tx.send(
        `mock swap ${mintIn.equals(WSOL) ? "SOL→USDC" : "USDC→SOL"}`,
        [init, ...fund],
        mintsQuote ? [quoteAuthority!] : [],
      );
    }
  }

  // ---------------------------------------------------------- launchpad
  if (!(await exists(conn, pda.launchpad()))) {
    const ix = await programs.launchpad.methods
      .initLaunchpad({
        childGuardian: guardian,
        childKeeper: keeper,
        swapProgram,
        oracle,
      } as never)
      .accountsPartial({
        governance: governance.publicKey,
        parentMarket: market,
        config: pda.launchpad(),
        systemProgram: SystemProgram.programId,
      })
      .instruction();
    await tx.send("launchpad", [ix]);
  }

  const out: GenesisOut = {
    cluster: c,
    mint: mint.toBase58(),
    quoteMint: quoteMint.toBase58(),
    quoteAuthority: quoteAuthority?.publicKey.toBase58(),
    governance: governance.publicKey.toBase58(),
    guardian: guardian.toBase58(),
    keeper: keeper.toBase58(),
    agent: agent.toBase58(),
    quotePerSol: quotePerSol.toString(),
    markets: [{ mint: mint.toBase58(), quoteMint: quoteMint.toBase58() }],
    createdAt: new Date().toISOString(),
  };
  writeOut(c, out);
  console.log(`\nGenesis complete → scripts/ts/out/${c}.json`);
  console.log(`MARKETS='${JSON.stringify(out.markets)}'`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
