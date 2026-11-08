/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/backstop_amm.json`.
 */
export type BackstopAmm = {
  "address": "8m9GWYsGaqmGECJnN6kipQXiaJfk8t2MhS8U5LugUw8b",
  "metadata": {
    "name": "backstopAmm",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "BACKSTOP constant-product AMM with protocol-owned liquidity, fee routing to core and an on-chain TWAP oracle."
  },
  "instructions": [
    {
      "name": "buy",
      "discriminator": [
        102,
        6,
        61,
        18,
        1,
        218,
        235,
        234
      ],
      "accounts": [
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "market",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                146,
                194,
                197,
                175,
                129,
                72,
                192,
                202,
                160,
                255,
                104,
                41,
                156,
                110,
                33,
                20,
                233,
                213,
                21,
                55,
                155,
                172,
                76,
                53,
                47,
                36,
                86,
                111,
                206,
                239,
                29,
                156
              ]
            }
          }
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "mint",
          "relations": [
            "market",
            "pool"
          ]
        },
        {
          "name": "quoteMint"
        },
        {
          "name": "baseVault",
          "writable": true,
          "relations": [
            "pool"
          ]
        },
        {
          "name": "quoteVault",
          "writable": true,
          "relations": [
            "pool"
          ]
        },
        {
          "name": "feeVault",
          "writable": true,
          "relations": [
            "market"
          ]
        },
        {
          "name": "userBase",
          "writable": true
        },
        {
          "name": "userQuote",
          "writable": true
        },
        {
          "name": "baseTokenProgram",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "quoteTokenProgram"
        }
      ],
      "args": [
        {
          "name": "quoteIn",
          "type": "u64"
        },
        {
          "name": "minBaseOut",
          "type": "u64"
        }
      ],
      "returns": "u64"
    },
    {
      "name": "buyWithTicket",
      "discriminator": [
        117,
        66,
        237,
        106,
        225,
        192,
        144,
        69
      ],
      "accounts": [
        {
          "name": "escrowAuthority",
          "docs": [
            "`backstop-offers` book PDA (escrow authority) — only reachable via CPI."
          ],
          "signer": true
        },
        {
          "name": "trader"
        },
        {
          "name": "market",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                146,
                194,
                197,
                175,
                129,
                72,
                192,
                202,
                160,
                255,
                104,
                41,
                156,
                110,
                33,
                20,
                233,
                213,
                21,
                55,
                155,
                172,
                76,
                53,
                47,
                36,
                86,
                111,
                206,
                239,
                29,
                156
              ]
            }
          }
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "mint",
          "relations": [
            "market",
            "pool"
          ]
        },
        {
          "name": "quoteMint"
        },
        {
          "name": "baseVault",
          "writable": true,
          "relations": [
            "pool"
          ]
        },
        {
          "name": "quoteVault",
          "writable": true,
          "relations": [
            "pool"
          ]
        },
        {
          "name": "feeVault",
          "writable": true,
          "relations": [
            "market"
          ]
        },
        {
          "name": "source",
          "docs": [
            "Sell: escrow vault (base). Ticket buy: buyer's quote account."
          ],
          "writable": true
        },
        {
          "name": "destination",
          "docs": [
            "Sell: seller's quote account. Ticket buy: buyer's base account."
          ],
          "writable": true
        },
        {
          "name": "sourceAuthority",
          "docs": [
            "Ticket buy: the buyer (signer, owner of `source`). Sell: unused (= escrow authority)."
          ],
          "signer": true
        },
        {
          "name": "baseTokenProgram",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "quoteTokenProgram"
        }
      ],
      "args": [
        {
          "name": "quoteIn",
          "type": "u64"
        },
        {
          "name": "minBaseOut",
          "type": "u64"
        },
        {
          "name": "maxBaseOut",
          "type": "u64"
        }
      ],
      "returns": "u64"
    },
    {
      "name": "initPool",
      "docs": [
        "Create the pool. The base vault (ATA of the pool PDA) must already hold",
        "the market's liquidity supply; `quote_amount` is seeded by the caller."
      ],
      "discriminator": [
        116,
        233,
        199,
        204,
        115,
        159,
        171,
        36
      ],
      "accounts": [
        {
          "name": "payer",
          "docs": [
            "Funds the quote seed liquidity and rent."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "authority",
          "docs": [
            "Market governance (root markets) or the launchpad PDA (children)."
          ],
          "signer": true
        },
        {
          "name": "market",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                146,
                194,
                197,
                175,
                129,
                72,
                192,
                202,
                160,
                255,
                104,
                41,
                156,
                110,
                33,
                20,
                233,
                213,
                21,
                55,
                155,
                172,
                76,
                53,
                47,
                36,
                86,
                111,
                206,
                239,
                29,
                156
              ]
            }
          }
        },
        {
          "name": "mint",
          "relations": [
            "market"
          ]
        },
        {
          "name": "quoteMint",
          "relations": [
            "market"
          ]
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "ammBaseVault",
          "docs": [
            "ATA(pool, mint) already holding the liquidity supply."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "pool"
              },
              {
                "kind": "account",
                "path": "baseTokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          },
          "relations": [
            "market"
          ]
        },
        {
          "name": "quoteVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "pool"
              },
              {
                "kind": "account",
                "path": "quoteTokenProgram"
              },
              {
                "kind": "account",
                "path": "quoteMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "payerQuote",
          "writable": true
        },
        {
          "name": "baseTokenProgram",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "quoteTokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "quoteAmount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "sell",
      "discriminator": [
        51,
        230,
        133,
        164,
        1,
        127,
        131,
        173
      ],
      "accounts": [
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "market",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                146,
                194,
                197,
                175,
                129,
                72,
                192,
                202,
                160,
                255,
                104,
                41,
                156,
                110,
                33,
                20,
                233,
                213,
                21,
                55,
                155,
                172,
                76,
                53,
                47,
                36,
                86,
                111,
                206,
                239,
                29,
                156
              ]
            }
          }
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "mint",
          "relations": [
            "market",
            "pool"
          ]
        },
        {
          "name": "quoteMint"
        },
        {
          "name": "baseVault",
          "writable": true,
          "relations": [
            "pool"
          ]
        },
        {
          "name": "quoteVault",
          "writable": true,
          "relations": [
            "pool"
          ]
        },
        {
          "name": "feeVault",
          "writable": true,
          "relations": [
            "market"
          ]
        },
        {
          "name": "userBase",
          "writable": true
        },
        {
          "name": "userQuote",
          "writable": true
        },
        {
          "name": "baseTokenProgram",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "quoteTokenProgram"
        }
      ],
      "args": [
        {
          "name": "baseIn",
          "type": "u64"
        },
        {
          "name": "minQuoteOut",
          "type": "u64"
        }
      ],
      "returns": "u64"
    },
    {
      "name": "sellFromOffer",
      "discriminator": [
        223,
        28,
        11,
        251,
        220,
        191,
        3,
        55
      ],
      "accounts": [
        {
          "name": "escrowAuthority",
          "docs": [
            "`backstop-offers` book PDA (escrow authority) — only reachable via CPI."
          ],
          "signer": true
        },
        {
          "name": "trader"
        },
        {
          "name": "market",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                146,
                194,
                197,
                175,
                129,
                72,
                192,
                202,
                160,
                255,
                104,
                41,
                156,
                110,
                33,
                20,
                233,
                213,
                21,
                55,
                155,
                172,
                76,
                53,
                47,
                36,
                86,
                111,
                206,
                239,
                29,
                156
              ]
            }
          }
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "mint",
          "relations": [
            "market",
            "pool"
          ]
        },
        {
          "name": "quoteMint"
        },
        {
          "name": "baseVault",
          "writable": true,
          "relations": [
            "pool"
          ]
        },
        {
          "name": "quoteVault",
          "writable": true,
          "relations": [
            "pool"
          ]
        },
        {
          "name": "feeVault",
          "writable": true,
          "relations": [
            "market"
          ]
        },
        {
          "name": "source",
          "docs": [
            "Sell: escrow vault (base). Ticket buy: buyer's quote account."
          ],
          "writable": true
        },
        {
          "name": "destination",
          "docs": [
            "Sell: seller's quote account. Ticket buy: buyer's base account."
          ],
          "writable": true
        },
        {
          "name": "sourceAuthority",
          "docs": [
            "Ticket buy: the buyer (signer, owner of `source`). Sell: unused (= escrow authority)."
          ],
          "signer": true
        },
        {
          "name": "baseTokenProgram",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "quoteTokenProgram"
        }
      ],
      "args": [
        {
          "name": "baseIn",
          "type": "u64"
        },
        {
          "name": "minQuoteOut",
          "type": "u64"
        }
      ],
      "returns": "u64"
    },
    {
      "name": "twap",
      "docs": [
        "Read-only: TWAP over `[now − end_ago − window, now − end_ago]`",
        "(returned via return data; use with `simulateTransaction`)."
      ],
      "discriminator": [
        31,
        219,
        71,
        137,
        153,
        251,
        203,
        138
      ],
      "accounts": [
        {
          "name": "pool"
        }
      ],
      "args": [
        {
          "name": "window",
          "type": "u32"
        },
        {
          "name": "endAgo",
          "type": "u32"
        }
      ],
      "returns": "u128"
    }
  ],
  "accounts": [
    {
      "name": "pool",
      "discriminator": [
        241,
        154,
        109,
        4,
        17,
        177,
        109,
        188
      ]
    }
  ],
  "events": [
    {
      "name": "poolInitialized",
      "discriminator": [
        100,
        118,
        173,
        87,
        12,
        198,
        254,
        229
      ]
    },
    {
      "name": "swapped",
      "discriminator": [
        217,
        52,
        52,
        83,
        147,
        135,
        96,
        109
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "unauthorized",
      "msg": "Caller is not authorised"
    },
    {
      "code": 6001,
      "name": "slippage",
      "msg": "Output below the requested minimum"
    },
    {
      "code": 6002,
      "name": "useOfferBook",
      "msg": "Direct sells must be below the minimum offer size; create an offer"
    },
    {
      "code": 6003,
      "name": "directSellHourlyCap",
      "msg": "Global hourly cap on direct sells reached"
    },
    {
      "code": 6004,
      "name": "ticketExceeded",
      "msg": "Purchase exceeds the Return Ticket allowance"
    },
    {
      "code": 6005,
      "name": "accountMismatch",
      "msg": "Account does not match the pool configuration"
    },
    {
      "code": 6006,
      "name": "insufficientLiquidity",
      "msg": "Pool liquidity insufficient"
    },
    {
      "code": 6007,
      "name": "invalidAmount",
      "msg": "Invalid amount"
    },
    {
      "code": 6008,
      "name": "twapUnavailable",
      "msg": "TWAP history unavailable for the requested window"
    },
    {
      "code": 6009,
      "name": "mathOverflow",
      "msg": "Arithmetic error"
    }
  ],
  "types": [
    {
      "name": "feeStats",
      "docs": [
        "Lifetime fee accounting (invariant: collected == Σ components)."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "distributed",
            "type": "u64"
          },
          {
            "name": "toChests",
            "type": "u64"
          },
          {
            "name": "toShield",
            "type": "u64"
          },
          {
            "name": "toTreasury",
            "type": "u64"
          },
          {
            "name": "toParent",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "market",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "version",
            "type": "u8"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "treasuryBump",
            "type": "u8"
          },
          {
            "name": "status",
            "type": "u8"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "quoteMint",
            "type": "pubkey"
          },
          {
            "name": "quoteTokenProgram",
            "type": "pubkey"
          },
          {
            "name": "quoteDecimals",
            "type": "u8"
          },
          {
            "name": "parent",
            "docs": [
              "Parent market for launchpad children (default for BACKSTOP itself)."
            ],
            "type": "pubkey"
          },
          {
            "name": "governance",
            "type": "pubkey"
          },
          {
            "name": "pendingGovernance",
            "type": "pubkey"
          },
          {
            "name": "guardian",
            "docs": [
              "May only *set* pause flags (immediate emergency stop)."
            ],
            "type": "pubkey"
          },
          {
            "name": "keeper",
            "docs": [
              "Executes fee swaps (bounded by the oracle and slippage cap)."
            ],
            "type": "pubkey"
          },
          {
            "name": "swapProgram",
            "docs": [
              "Swap program allowed for fee conversion (Jupiter v6 on mainnet)."
            ],
            "type": "pubkey"
          },
          {
            "name": "pauses",
            "type": "u8"
          },
          {
            "name": "redemptionPaused",
            "docs": [
              "Redemption can only be paused through the 48 h timelock."
            ],
            "type": "bool"
          },
          {
            "name": "params",
            "type": {
              "defined": {
                "name": "marketParams"
              }
            }
          },
          {
            "name": "oracle",
            "type": {
              "defined": {
                "name": "oracleConfig"
              }
            }
          },
          {
            "name": "feeVault",
            "docs": [
              "Quote ATA of this market PDA receiving all trade fees."
            ],
            "type": "pubkey"
          },
          {
            "name": "treasuryQuoteVault",
            "docs": [
              "Quote ATA of the treasury PDA (treasury share awaiting conversion)."
            ],
            "type": "pubkey"
          },
          {
            "name": "holderRewardsVault",
            "docs": [
              "Chest program vault receiving holder rewards."
            ],
            "type": "pubkey"
          },
          {
            "name": "shieldRewardsVault",
            "docs": [
              "Chest program vault receiving Shield rewards."
            ],
            "type": "pubkey"
          },
          {
            "name": "parentVault",
            "docs": [
              "Quote ATA of this market PDA holding the parent's share (children)."
            ],
            "type": "pubkey"
          },
          {
            "name": "ammBaseVault",
            "docs": [
              "AMM base vault (protocol-held supply excluded from circulation)."
            ],
            "type": "pubkey"
          },
          {
            "name": "fees",
            "type": {
              "defined": {
                "name": "feeStats"
              }
            }
          },
          {
            "name": "treasurySolIn",
            "docs": [
              "Lamports received from fee conversion."
            ],
            "type": "u64"
          },
          {
            "name": "redeemedTokens",
            "type": "u64"
          },
          {
            "name": "redeemedLamports",
            "type": "u64"
          },
          {
            "name": "shieldLamportsPending",
            "docs": [
              "Redemption fees (lamports) awaiting conversion to Shield rewards."
            ],
            "type": "u64"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "reserved",
            "type": {
              "array": [
                "u8",
                64
              ]
            }
          }
        ]
      }
    },
    {
      "name": "marketParams",
      "docs": [
        "Every governable parameter of a market (spec §3). Defaults in",
        "[`MarketParams::defaults`]."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "tradeFeeBps",
            "type": "u16"
          },
          {
            "name": "splitChestBps",
            "type": "u16"
          },
          {
            "name": "splitShieldBps",
            "type": "u16"
          },
          {
            "name": "parentShareBps",
            "docs": [
              "Share of gross fees routed to the parent market (children only)."
            ],
            "type": "u16"
          },
          {
            "name": "baseDiscountBps",
            "type": "u16"
          },
          {
            "name": "kUpBps",
            "type": "u16"
          },
          {
            "name": "kDownBps",
            "type": "u16"
          },
          {
            "name": "minDiscountBps",
            "type": "u16"
          },
          {
            "name": "maxDiscountBps",
            "type": "u16"
          },
          {
            "name": "offerWindowSecs",
            "type": "u32"
          },
          {
            "name": "bidEpochSecs",
            "type": "u32"
          },
          {
            "name": "minOfferSize",
            "type": "u64"
          },
          {
            "name": "lotsPerOffer",
            "type": "u16"
          },
          {
            "name": "ticketValiditySecs",
            "type": "u32"
          },
          {
            "name": "chestLockSecs",
            "type": "u32"
          },
          {
            "name": "chestPenaltyBps",
            "type": "u16"
          },
          {
            "name": "redemptionFeeBps",
            "type": "u16"
          },
          {
            "name": "yieldBufferBps",
            "type": "u16"
          },
          {
            "name": "shieldPerOfferCap",
            "type": "u64"
          },
          {
            "name": "shieldMaxShareBps",
            "type": "u16"
          },
          {
            "name": "shieldMinLockSecs",
            "type": "u32"
          },
          {
            "name": "shieldMaxMultiplierBps",
            "type": "u32"
          },
          {
            "name": "shieldMaxPremiumBps",
            "docs": [
              "Shield skips offers whose short TWAP exceeds the hourly TWAP by more",
              "than this (pump-and-dump protection)."
            ],
            "type": "u16"
          },
          {
            "name": "priceTwapWindowSecs",
            "type": "u32"
          },
          {
            "name": "momentumLookbackSecs",
            "type": "u32"
          },
          {
            "name": "directSellHourlyCap",
            "docs": [
              "Global cap on direct (sub-minimum) AMM sells per hour, base units."
            ],
            "type": "u64"
          },
          {
            "name": "maxSwapSlippageBps",
            "docs": [
              "Max slippage vs. oracle on keeper fee swaps (spec: 0.5 %)."
            ],
            "type": "u16"
          },
          {
            "name": "maxSwapChunk",
            "docs": [
              "Max single keeper swap; larger amounts are TWAP-chunked by the keeper."
            ],
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "oracleConfig",
      "docs": [
        "Price source used to bound keeper swaps."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "kind",
            "docs": [
              "0 = governance-set manual price (localnet/devnet), 1 = Pyth PriceUpdateV2."
            ],
            "type": "u8"
          },
          {
            "name": "feed",
            "docs": [
              "Pyth price-update account (kind = 1)."
            ],
            "type": "pubkey"
          },
          {
            "name": "manualQuotePerSol",
            "docs": [
              "Manual price: quote base units per 1 SOL (1e9 lamports)."
            ],
            "type": "u64"
          },
          {
            "name": "maxStalenessSecs",
            "type": "u32"
          }
        ]
      }
    },
    {
      "name": "podObservation",
      "serialization": "bytemuck",
      "repr": {
        "kind": "c"
      },
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "ts",
            "type": "i64"
          },
          {
            "name": "cumulative",
            "type": {
              "defined": {
                "name": "podU128"
              }
            }
          }
        ]
      }
    },
    {
      "name": "podU128",
      "serialization": "bytemuck",
      "repr": {
        "kind": "c"
      },
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bytes",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          }
        ]
      }
    },
    {
      "name": "pool",
      "docs": [
        "Constant-product pool. Liquidity is protocol-owned and cannot be",
        "withdrawn (D-015). Reserves are tracked internally (donations ignored)."
      ],
      "serialization": "bytemuck",
      "repr": {
        "kind": "c"
      },
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "quoteMint",
            "type": "pubkey"
          },
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "baseVault",
            "type": "pubkey"
          },
          {
            "name": "quoteVault",
            "type": "pubkey"
          },
          {
            "name": "feeVault",
            "type": "pubkey"
          },
          {
            "name": "baseReserve",
            "type": "u64"
          },
          {
            "name": "quoteReserve",
            "type": "u64"
          },
          {
            "name": "feesCollected",
            "type": "u64"
          },
          {
            "name": "volumeBase",
            "type": "u64"
          },
          {
            "name": "volumeQuote",
            "type": "u64"
          },
          {
            "name": "swaps",
            "type": "u64"
          },
          {
            "name": "directHourStart",
            "type": "i64"
          },
          {
            "name": "directHourSold",
            "type": "u64"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "oracleLastTs",
            "type": "i64"
          },
          {
            "name": "oracleHead",
            "type": "u16"
          },
          {
            "name": "oracleLen",
            "type": "u16"
          },
          {
            "name": "oracleMinInterval",
            "type": "u32"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "version",
            "type": "u8"
          },
          {
            "name": "quoteDecimals",
            "type": "u8"
          },
          {
            "name": "pad",
            "type": {
              "array": [
                "u8",
                5
              ]
            }
          },
          {
            "name": "oracleCumulative",
            "type": {
              "defined": {
                "name": "podU128"
              }
            }
          },
          {
            "name": "oracleLastPrice",
            "type": {
              "defined": {
                "name": "podU128"
              }
            }
          },
          {
            "name": "observations",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "podObservation"
                  }
                },
                96
              ]
            }
          },
          {
            "name": "reserved",
            "type": {
              "array": [
                "u8",
                64
              ]
            }
          }
        ]
      }
    },
    {
      "name": "poolInitialized",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "quoteMint",
            "type": "pubkey"
          },
          {
            "name": "baseReserve",
            "type": "u64"
          },
          {
            "name": "quoteReserve",
            "type": "u64"
          },
          {
            "name": "price",
            "type": "u128"
          },
          {
            "name": "ts",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "swapped",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "trader",
            "type": "pubkey"
          },
          {
            "name": "side",
            "type": "u8"
          },
          {
            "name": "baseAmount",
            "type": "u64"
          },
          {
            "name": "quoteAmount",
            "type": "u64"
          },
          {
            "name": "fee",
            "type": "u64"
          },
          {
            "name": "baseReserve",
            "type": "u64"
          },
          {
            "name": "quoteReserve",
            "type": "u64"
          },
          {
            "name": "price",
            "docs": [
              "Post-trade spot price (quote base units per base unit × 1e18)."
            ],
            "type": "u128"
          },
          {
            "name": "ts",
            "type": "i64"
          }
        ]
      }
    }
  ]
};
