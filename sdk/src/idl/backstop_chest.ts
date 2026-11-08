/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/backstop_chest.json`.
 */
export type BackstopChest = {
  "address": "5Hwrxz9JJoGxcZNSzP7TTAju2C2KMPtNBHtdifnU3tB5",
  "metadata": {
    "name": "backstopChest",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "BACKSTOP war chests: pooled USDC chests with share accounting, reward harvests, Auto-Absorb grants, the Shield pool and idle-yield adapters."
  },
  "instructions": [
    {
      "name": "autoBid",
      "discriminator": [
        30,
        237,
        251,
        9,
        180,
        27,
        47,
        223
      ],
      "accounts": [
        {
          "name": "payer",
          "docs": [
            "Owner (manual bids) or keeper (Auto-Absorb). Pays the bid rent and",
            "receives it back on claim."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "owner"
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
          "name": "chestMarket",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  104,
                  101,
                  115,
                  116,
                  95,
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
            ]
          }
        },
        {
          "name": "chest",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  104,
                  101,
                  115,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "grant",
          "optional": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  114,
                  97,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "offer",
          "writable": true
        },
        {
          "name": "mint",
          "relations": [
            "market",
            "offer"
          ]
        },
        {
          "name": "quoteMint"
        },
        {
          "name": "bid",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "relations": [
            "chestMarket"
          ]
        },
        {
          "name": "bidVault",
          "writable": true
        },
        {
          "name": "sellerHolder"
        },
        {
          "name": "hookConfig"
        },
        {
          "name": "offersProgram",
          "address": "DW1bgui9AwKGmBxRryjGn6CtKYfo2aXuyeHXLxzewGj"
        },
        {
          "name": "quoteTokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "bidFromChest",
      "discriminator": [
        111,
        239,
        137,
        251,
        183,
        248,
        136,
        184
      ],
      "accounts": [
        {
          "name": "payer",
          "docs": [
            "Owner (manual bids) or keeper (Auto-Absorb). Pays the bid rent and",
            "receives it back on claim."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "owner"
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
          "name": "chestMarket",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  104,
                  101,
                  115,
                  116,
                  95,
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
            ]
          }
        },
        {
          "name": "chest",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  104,
                  101,
                  115,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "grant",
          "optional": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  114,
                  97,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "offer",
          "writable": true
        },
        {
          "name": "mint",
          "relations": [
            "market",
            "offer"
          ]
        },
        {
          "name": "quoteMint"
        },
        {
          "name": "bid",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "relations": [
            "chestMarket"
          ]
        },
        {
          "name": "bidVault",
          "writable": true
        },
        {
          "name": "sellerHolder"
        },
        {
          "name": "hookConfig"
        },
        {
          "name": "offersProgram",
          "address": "DW1bgui9AwKGmBxRryjGn6CtKYfo2aXuyeHXLxzewGj"
        },
        {
          "name": "quoteTokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "claimBid",
      "discriminator": [
        246,
        162,
        129,
        70,
        197,
        70,
        8,
        18
      ],
      "accounts": [
        {
          "name": "cranker",
          "signer": true
        },
        {
          "name": "chestMarket",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  104,
                  101,
                  115,
                  116,
                  95,
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
            ]
          }
        },
        {
          "name": "chest",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  104,
                  101,
                  115,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              },
              {
                "kind": "account",
                "path": "bid.bidder",
                "account": "bid"
              }
            ]
          }
        },
        {
          "name": "book",
          "writable": true
        },
        {
          "name": "offer",
          "writable": true,
          "relations": [
            "bid"
          ]
        },
        {
          "name": "bid",
          "writable": true
        },
        {
          "name": "rentPayer",
          "writable": true
        },
        {
          "name": "mint",
          "relations": [
            "offer"
          ]
        },
        {
          "name": "quoteMint"
        },
        {
          "name": "bidderToken",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "relations": [
            "chestMarket"
          ]
        },
        {
          "name": "escrowVault",
          "writable": true
        },
        {
          "name": "bidVault",
          "writable": true
        },
        {
          "name": "hookConfig"
        },
        {
          "name": "bidderHolder",
          "writable": true
        },
        {
          "name": "rewardState",
          "writable": true
        },
        {
          "name": "hookProgram"
        },
        {
          "name": "offersProgram",
          "address": "DW1bgui9AwKGmBxRryjGn6CtKYfo2aXuyeHXLxzewGj"
        },
        {
          "name": "baseTokenProgram"
        },
        {
          "name": "quoteTokenProgram"
        }
      ],
      "args": []
    },
    {
      "name": "deposit",
      "discriminator": [
        242,
        35,
        198,
        137,
        82,
        225,
        242,
        182
      ],
      "accounts": [
        {
          "name": "owner",
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
                "path": "chestMarket.mint",
                "account": "chestMarket"
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
          "name": "chestMarket",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  104,
                  101,
                  115,
                  116,
                  95,
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
                "path": "chestMarket.mint",
                "account": "chestMarket"
              }
            ]
          }
        },
        {
          "name": "chest",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  104,
                  101,
                  115,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "chestMarket.mint",
                "account": "chestMarket"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "quoteMint"
        },
        {
          "name": "vault",
          "writable": true,
          "relations": [
            "chestMarket"
          ]
        },
        {
          "name": "ownerQuote",
          "writable": true
        },
        {
          "name": "shieldRewardsVault",
          "docs": [
            "Shield rewards vault (receives early-withdrawal penalties)."
          ],
          "writable": true
        },
        {
          "name": "quoteTokenProgram"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "harvest",
      "discriminator": [
        228,
        241,
        31,
        182,
        53,
        169,
        59,
        199
      ],
      "accounts": [
        {
          "name": "owner",
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
                "path": "chestMarket.mint",
                "account": "chestMarket"
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
          "name": "chestMarket",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  104,
                  101,
                  115,
                  116,
                  95,
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
                "path": "chestMarket.mint",
                "account": "chestMarket"
              }
            ]
          }
        },
        {
          "name": "chest",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  104,
                  101,
                  115,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "chestMarket.mint",
                "account": "chestMarket"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "quoteMint"
        },
        {
          "name": "vault",
          "writable": true,
          "relations": [
            "chestMarket"
          ]
        },
        {
          "name": "holderRewardsVault",
          "writable": true,
          "relations": [
            "chestMarket"
          ]
        },
        {
          "name": "rewardsAuth",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  119,
                  97,
                  114,
                  100,
                  115,
                  95,
                  97,
                  117,
                  116,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "chestMarket.mint",
                "account": "chestMarket"
              }
            ]
          }
        },
        {
          "name": "hookConfig"
        },
        {
          "name": "holder",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  111,
                  108,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "chestMarket.mint",
                "account": "chestMarket"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                10,
                5,
                172,
                55,
                36,
                59,
                39,
                107,
                223,
                29,
                192,
                239,
                41,
                105,
                255,
                6,
                250,
                89,
                112,
                225,
                198,
                8,
                146,
                232,
                110,
                193,
                197,
                35,
                213,
                38,
                108,
                216
              ]
            }
          }
        },
        {
          "name": "rewardState",
          "writable": true
        },
        {
          "name": "hookProgram",
          "address": "g86T56A9yM46y5cyVCVzB1K6MtV5cx89DsFiapy59eP"
        },
        {
          "name": "quoteTokenProgram"
        }
      ],
      "args": []
    },
    {
      "name": "initChestMarket",
      "discriminator": [
        44,
        138,
        240,
        132,
        64,
        244,
        241,
        86
      ],
      "accounts": [
        {
          "name": "payer",
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
          "name": "chestMarket",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  104,
                  101,
                  115,
                  116,
                  95,
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
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "chestMarket"
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
          "name": "rewardsAuth",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  119,
                  97,
                  114,
                  100,
                  115,
                  95,
                  97,
                  117,
                  116,
                  104
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
          "name": "holderRewardsVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "rewardsAuth"
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
          },
          "relations": [
            "market"
          ]
        },
        {
          "name": "shield",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  104,
                  105,
                  101,
                  108,
                  100
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
          "name": "shieldQuoteVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "shield"
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
          "name": "shieldTokenVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "shield"
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
          }
        },
        {
          "name": "shieldRewardsVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  104,
                  105,
                  101,
                  108,
                  100,
                  95,
                  114,
                  101,
                  119,
                  97,
                  114,
                  100,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          },
          "relations": [
            "market"
          ]
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
      "args": []
    },
    {
      "name": "openChest",
      "discriminator": [
        143,
        8,
        253,
        123,
        197,
        30,
        173,
        15
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "owner"
        },
        {
          "name": "chestMarket",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  104,
                  101,
                  115,
                  116,
                  95,
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
                "path": "chestMarket.mint",
                "account": "chestMarket"
              }
            ]
          }
        },
        {
          "name": "chest",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  104,
                  101,
                  115,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "chestMarket.mint",
                "account": "chestMarket"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "rebalance",
      "discriminator": [
        108,
        158,
        77,
        9,
        210,
        52,
        88,
        62
      ],
      "accounts": [
        {
          "name": "cranker",
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
                "path": "chestMarket.mint",
                "account": "chestMarket"
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
          "name": "chestMarket",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  104,
                  101,
                  115,
                  116,
                  95,
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
                "path": "chestMarket.mint",
                "account": "chestMarket"
              }
            ]
          }
        },
        {
          "name": "quoteMint"
        },
        {
          "name": "vault",
          "writable": true,
          "relations": [
            "chestMarket"
          ]
        },
        {
          "name": "quoteTokenProgram"
        }
      ],
      "args": []
    },
    {
      "name": "setAdapter",
      "discriminator": [
        45,
        14,
        7,
        253,
        44,
        140,
        216,
        180
      ],
      "accounts": [
        {
          "name": "governance",
          "signer": true,
          "relations": [
            "market"
          ]
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
                "path": "chestMarket.mint",
                "account": "chestMarket"
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
          "name": "chestMarket",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  104,
                  101,
                  115,
                  116,
                  95,
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
                "path": "chestMarket.mint",
                "account": "chestMarket"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "kind",
          "type": "u8"
        },
        {
          "name": "program",
          "type": "pubkey"
        },
        {
          "name": "pool",
          "type": "pubkey"
        },
        {
          "name": "position",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "setGrant",
      "discriminator": [
        228,
        249,
        233,
        141,
        68,
        82,
        141,
        10
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "chestMarket",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  104,
                  101,
                  115,
                  116,
                  95,
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
                "path": "chestMarket.mint",
                "account": "chestMarket"
              }
            ]
          }
        },
        {
          "name": "grant",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  114,
                  97,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "chestMarket.mint",
                "account": "chestMarket"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "grantArgs"
            }
          }
        }
      ]
    },
    {
      "name": "settleOffer",
      "discriminator": [
        40,
        52,
        19,
        31,
        0,
        165,
        52,
        30
      ],
      "accounts": [
        {
          "name": "payer",
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
          "name": "shield",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  104,
                  105,
                  101,
                  108,
                  100
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
          "name": "pool",
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
            ],
            "program": {
              "kind": "const",
              "value": [
                115,
                80,
                182,
                74,
                23,
                207,
                179,
                35,
                103,
                27,
                18,
                156,
                129,
                6,
                236,
                24,
                72,
                245,
                207,
                64,
                252,
                76,
                236,
                131,
                47,
                22,
                97,
                188,
                104,
                93,
                161,
                56
              ]
            }
          }
        },
        {
          "name": "book",
          "writable": true
        },
        {
          "name": "offer",
          "writable": true
        },
        {
          "name": "mint",
          "relations": [
            "market",
            "offer"
          ]
        },
        {
          "name": "quoteMint"
        },
        {
          "name": "escrowVault",
          "writable": true
        },
        {
          "name": "bidVault",
          "writable": true
        },
        {
          "name": "sellerQuote",
          "writable": true
        },
        {
          "name": "feeVault",
          "writable": true
        },
        {
          "name": "shieldQuoteVault",
          "writable": true
        },
        {
          "name": "shieldTokenVault",
          "writable": true
        },
        {
          "name": "ticket",
          "writable": true
        },
        {
          "name": "slotHashes"
        },
        {
          "name": "offersProgram",
          "address": "DW1bgui9AwKGmBxRryjGn6CtKYfo2aXuyeHXLxzewGj"
        },
        {
          "name": "baseTokenProgram"
        },
        {
          "name": "quoteTokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "shieldClaim",
      "discriminator": [
        56,
        80,
        57,
        69,
        61,
        200,
        38,
        55
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "position"
          ]
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
                "path": "shield.mint",
                "account": "shield"
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
          "name": "chestMarket",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  104,
                  101,
                  115,
                  116,
                  95,
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
                "path": "shield.mint",
                "account": "shield"
              }
            ]
          }
        },
        {
          "name": "chest",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  104,
                  101,
                  115,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "shield.mint",
                "account": "shield"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "shield",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  104,
                  105,
                  101,
                  108,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "shield.mint",
                "account": "shield"
              }
            ]
          }
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  104,
                  105,
                  101,
                  108,
                  100,
                  95,
                  112,
                  111,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "shield.mint",
                "account": "shield"
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "position.id",
                "account": "shieldPosition"
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "quoteMint"
        },
        {
          "name": "vault",
          "writable": true,
          "relations": [
            "chestMarket"
          ]
        },
        {
          "name": "quoteVault",
          "writable": true,
          "relations": [
            "shield"
          ]
        },
        {
          "name": "tokenVault",
          "writable": true,
          "relations": [
            "shield"
          ]
        },
        {
          "name": "rewardsVault",
          "writable": true,
          "relations": [
            "shield"
          ]
        },
        {
          "name": "ownerToken",
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
      "args": []
    },
    {
      "name": "shieldDeposit",
      "discriminator": [
        197,
        58,
        196,
        180,
        224,
        142,
        178,
        40
      ],
      "accounts": [
        {
          "name": "owner",
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
                "path": "shield.mint",
                "account": "shield"
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
          "name": "chestMarket",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  104,
                  101,
                  115,
                  116,
                  95,
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
                "path": "shield.mint",
                "account": "shield"
              }
            ]
          }
        },
        {
          "name": "chest",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  104,
                  101,
                  115,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "shield.mint",
                "account": "shield"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "shield",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  104,
                  105,
                  101,
                  108,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "shield.mint",
                "account": "shield"
              }
            ]
          }
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  104,
                  105,
                  101,
                  108,
                  100,
                  95,
                  112,
                  111,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "shield.mint",
                "account": "shield"
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "arg",
                "path": "id"
              }
            ]
          }
        },
        {
          "name": "quoteMint"
        },
        {
          "name": "vault",
          "writable": true,
          "relations": [
            "chestMarket"
          ]
        },
        {
          "name": "quoteVault",
          "writable": true,
          "relations": [
            "shield"
          ]
        },
        {
          "name": "rewardsVault",
          "relations": [
            "shield"
          ]
        },
        {
          "name": "quoteTokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "lockSecs",
          "type": "u32"
        },
        {
          "name": "id",
          "type": "u32"
        }
      ]
    },
    {
      "name": "shieldWithdraw",
      "discriminator": [
        130,
        198,
        163,
        95,
        23,
        64,
        116,
        214
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "position"
          ]
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
                "path": "shield.mint",
                "account": "shield"
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
          "name": "chestMarket",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  104,
                  101,
                  115,
                  116,
                  95,
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
                "path": "shield.mint",
                "account": "shield"
              }
            ]
          }
        },
        {
          "name": "chest",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  104,
                  101,
                  115,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "shield.mint",
                "account": "shield"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "shield",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  104,
                  105,
                  101,
                  108,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "shield.mint",
                "account": "shield"
              }
            ]
          }
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  104,
                  105,
                  101,
                  108,
                  100,
                  95,
                  112,
                  111,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "shield.mint",
                "account": "shield"
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "position.id",
                "account": "shieldPosition"
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "quoteMint"
        },
        {
          "name": "vault",
          "writable": true,
          "relations": [
            "chestMarket"
          ]
        },
        {
          "name": "quoteVault",
          "writable": true,
          "relations": [
            "shield"
          ]
        },
        {
          "name": "tokenVault",
          "writable": true,
          "relations": [
            "shield"
          ]
        },
        {
          "name": "rewardsVault",
          "writable": true,
          "relations": [
            "shield"
          ]
        },
        {
          "name": "ownerToken",
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
      "args": []
    },
    {
      "name": "syncShieldRewards",
      "discriminator": [
        77,
        236,
        67,
        27,
        131,
        226,
        111,
        54
      ],
      "accounts": [
        {
          "name": "shield",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  104,
                  105,
                  101,
                  108,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "shield.mint",
                "account": "shield"
              }
            ]
          }
        },
        {
          "name": "rewardsVault",
          "relations": [
            "shield"
          ]
        }
      ],
      "args": []
    },
    {
      "name": "unwind",
      "discriminator": [
        66,
        99,
        1,
        75,
        47,
        72,
        63,
        85
      ],
      "accounts": [
        {
          "name": "cranker",
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
                "path": "chestMarket.mint",
                "account": "chestMarket"
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
          "name": "chestMarket",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  104,
                  101,
                  115,
                  116,
                  95,
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
                "path": "chestMarket.mint",
                "account": "chestMarket"
              }
            ]
          }
        },
        {
          "name": "quoteMint"
        },
        {
          "name": "vault",
          "writable": true,
          "relations": [
            "chestMarket"
          ]
        },
        {
          "name": "quoteTokenProgram"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "withdraw",
      "discriminator": [
        183,
        18,
        70,
        156,
        148,
        109,
        161,
        34
      ],
      "accounts": [
        {
          "name": "owner",
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
                "path": "chestMarket.mint",
                "account": "chestMarket"
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
          "name": "chestMarket",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  104,
                  101,
                  115,
                  116,
                  95,
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
                "path": "chestMarket.mint",
                "account": "chestMarket"
              }
            ]
          }
        },
        {
          "name": "chest",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  104,
                  101,
                  115,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "chestMarket.mint",
                "account": "chestMarket"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "quoteMint"
        },
        {
          "name": "vault",
          "writable": true,
          "relations": [
            "chestMarket"
          ]
        },
        {
          "name": "ownerQuote",
          "writable": true
        },
        {
          "name": "shieldRewardsVault",
          "docs": [
            "Shield rewards vault (receives early-withdrawal penalties)."
          ],
          "writable": true
        },
        {
          "name": "quoteTokenProgram"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "chest",
      "discriminator": [
        62,
        105,
        229,
        96,
        248,
        72,
        144,
        162
      ]
    },
    {
      "name": "chestMarket",
      "discriminator": [
        2,
        155,
        235,
        55,
        163,
        182,
        28,
        16
      ]
    },
    {
      "name": "grant",
      "discriminator": [
        161,
        166,
        11,
        205,
        204,
        135,
        205,
        54
      ]
    },
    {
      "name": "shield",
      "discriminator": [
        122,
        210,
        171,
        132,
        124,
        235,
        186,
        248
      ]
    },
    {
      "name": "shieldPosition",
      "discriminator": [
        126,
        138,
        231,
        79,
        41,
        163,
        216,
        117
      ]
    }
  ],
  "events": [
    {
      "name": "autoBid",
      "discriminator": [
        58,
        35,
        191,
        42,
        67,
        243,
        132,
        171
      ]
    },
    {
      "name": "chestEvent",
      "discriminator": [
        11,
        104,
        65,
        65,
        185,
        174,
        170,
        126
      ]
    },
    {
      "name": "grantUpdated",
      "discriminator": [
        193,
        162,
        192,
        51,
        187,
        66,
        0,
        85
      ]
    },
    {
      "name": "shieldAbsorbed",
      "discriminator": [
        51,
        211,
        127,
        209,
        100,
        24,
        31,
        4
      ]
    },
    {
      "name": "shieldPositionEvent",
      "discriminator": [
        188,
        86,
        222,
        223,
        202,
        59,
        153,
        94
      ]
    },
    {
      "name": "shieldRewardsSynced",
      "discriminator": [
        47,
        71,
        81,
        129,
        72,
        132,
        143,
        46
      ]
    },
    {
      "name": "yieldEvent",
      "discriminator": [
        58,
        134,
        213,
        130,
        15,
        115,
        41,
        97
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
      "name": "invalidAmount",
      "msg": "Invalid amount"
    },
    {
      "code": 6002,
      "name": "insufficientBalance",
      "msg": "Insufficient chest balance"
    },
    {
      "code": 6003,
      "name": "insufficientLiquidity",
      "msg": "Insufficient idle liquidity; rebalance the yield adapter first"
    },
    {
      "code": 6004,
      "name": "autoAbsorbPaused",
      "msg": "Auto-Absorb is paused (emergency)"
    },
    {
      "code": 6005,
      "name": "grantDisabled",
      "msg": "Auto-Absorb grant is disabled"
    },
    {
      "code": 6006,
      "name": "discountTooLow",
      "msg": "Offer discount below the grant minimum"
    },
    {
      "code": 6007,
      "name": "grantLimit",
      "msg": "Amount exceeds the per-offer or per-day Auto-Absorb limit"
    },
    {
      "code": 6008,
      "name": "reserveFloor",
      "msg": "Would spend below the reserve floor"
    },
    {
      "code": 6009,
      "name": "keeperNotAllowed",
      "msg": "Keeper not permitted by this grant"
    },
    {
      "code": 6010,
      "name": "lockTooShort",
      "msg": "Shield lock shorter than the minimum"
    },
    {
      "code": 6011,
      "name": "stillLocked",
      "msg": "Shield position is still locked"
    },
    {
      "code": 6012,
      "name": "accountMismatch",
      "msg": "Account does not match the market configuration"
    },
    {
      "code": 6013,
      "name": "noAdapter",
      "msg": "Yield adapter is not configured"
    },
    {
      "code": 6014,
      "name": "adapterUnsupported",
      "msg": "Yield adapter not supported in this build"
    },
    {
      "code": 6015,
      "name": "mathOverflow",
      "msg": "Arithmetic error"
    }
  ],
  "types": [
    {
      "name": "autoBid",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "offer",
            "type": "pubkey"
          },
          {
            "name": "keeper",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "ts",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "bid",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "kind",
            "type": "u8"
          },
          {
            "name": "offer",
            "type": "pubkey"
          },
          {
            "name": "bidder",
            "docs": [
              "Wallet that receives the tokens (and tenure credit)."
            ],
            "type": "pubkey"
          },
          {
            "name": "refundTo",
            "docs": [
              "Account the refund is returned to (bidder's quote ATA or chest vault)."
            ],
            "type": "pubkey"
          },
          {
            "name": "rentPayer",
            "docs": [
              "Receives the bid account's rent on claim."
            ],
            "type": "pubkey"
          },
          {
            "name": "amount",
            "docs": [
              "Quote locked (= capacity × lot_cost)."
            ],
            "type": "u64"
          },
          {
            "name": "capacity",
            "type": "u64"
          },
          {
            "name": "prefix",
            "docs": [
              "Σ capacities of earlier bids (`Q_i`)."
            ],
            "type": "u64"
          },
          {
            "name": "createdAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "chest",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "shares",
            "type": "u64"
          },
          {
            "name": "lockUntil",
            "docs": [
              "Rolling 60-day lock: restarts on every deposit event (D-028)."
            ],
            "type": "i64"
          },
          {
            "name": "lastDepositAt",
            "type": "i64"
          },
          {
            "name": "deposited",
            "type": "u64"
          },
          {
            "name": "withdrawn",
            "type": "u64"
          },
          {
            "name": "harvested",
            "type": "u64"
          },
          {
            "name": "penaltiesPaid",
            "type": "u64"
          },
          {
            "name": "bidQuote",
            "type": "u64"
          },
          {
            "name": "refundedQuote",
            "type": "u64"
          },
          {
            "name": "dayStart",
            "docs": [
              "Auto-Absorb daily window."
            ],
            "type": "i64"
          },
          {
            "name": "daySpent",
            "type": "u64"
          },
          {
            "name": "openBids",
            "type": "u32"
          },
          {
            "name": "createdAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "chestEvent",
      "docs": [
        "`kind`: 0 deposit, 1 withdraw, 2 harvest, 3 bid, 4 refund, 5 shield_in,",
        "6 shield_out, 7 shield_reward"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "kind",
            "type": "u8"
          },
          {
            "name": "assets",
            "type": "u64"
          },
          {
            "name": "sharesDelta",
            "type": "i64"
          },
          {
            "name": "penalty",
            "type": "u64"
          },
          {
            "name": "balanceAfter",
            "type": "u64"
          },
          {
            "name": "lockUntil",
            "type": "i64"
          },
          {
            "name": "ts",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "chestMarket",
      "docs": [
        "Per-market chest pool. Chest balances are shares of",
        "`total_assets = idle_assets + adapter_value` (D-027)."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "rewardsAuthBump",
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
            "name": "vault",
            "docs": [
              "ATA(chest_market, quote): idle chest USDC."
            ],
            "type": "pubkey"
          },
          {
            "name": "holderRewardsVault",
            "docs": [
              "ATA(rewards_auth, quote): harvested holder rewards awaiting claim."
            ],
            "type": "pubkey"
          },
          {
            "name": "totalShares",
            "type": "u64"
          },
          {
            "name": "idleAssets",
            "docs": [
              "Quote tokens in `vault` that belong to chests (donations ignored)."
            ],
            "type": "u64"
          },
          {
            "name": "deployedPrincipal",
            "docs": [
              "Principal currently deployed to the yield adapter."
            ],
            "type": "u64"
          },
          {
            "name": "adapterValue",
            "docs": [
              "Adapter position value at the last `sync_yield` (variable yield)."
            ],
            "type": "u64"
          },
          {
            "name": "adapterSyncedAt",
            "type": "i64"
          },
          {
            "name": "adapterKind",
            "type": "u8"
          },
          {
            "name": "adapterProgram",
            "type": "pubkey"
          },
          {
            "name": "adapterPosition",
            "docs": [
              "Adapter-specific position account (mock deposit / Kamino collateral ATA)."
            ],
            "type": "pubkey"
          },
          {
            "name": "adapterPool",
            "docs": [
              "Adapter-specific pool/reserve account."
            ],
            "type": "pubkey"
          },
          {
            "name": "chests",
            "type": "u64"
          },
          {
            "name": "totalDeposited",
            "type": "u64"
          },
          {
            "name": "totalWithdrawn",
            "type": "u64"
          },
          {
            "name": "totalPenalties",
            "type": "u64"
          },
          {
            "name": "totalHarvested",
            "type": "u64"
          },
          {
            "name": "totalBid",
            "type": "u64"
          },
          {
            "name": "totalRefunded",
            "type": "u64"
          },
          {
            "name": "totalYieldRealised",
            "type": "u64"
          }
        ]
      }
    },
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
      "name": "grant",
      "docs": [
        "Auto-Absorb permission (spec §3.4): signed once by the owner, revocable."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "enabled",
            "type": "bool"
          },
          {
            "name": "maxPerOffer",
            "type": "u64"
          },
          {
            "name": "maxPerDay",
            "type": "u64"
          },
          {
            "name": "minDiscountBps",
            "type": "u32"
          },
          {
            "name": "reserveFloor",
            "docs": [
              "Chest balance that Auto-Absorb never spends below."
            ],
            "type": "u64"
          },
          {
            "name": "keeper",
            "docs": [
              "Optional keeper restriction (default = any keeper)."
            ],
            "type": "pubkey"
          },
          {
            "name": "updatedAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "grantArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "enabled",
            "type": "bool"
          },
          {
            "name": "maxPerOffer",
            "type": "u64"
          },
          {
            "name": "maxPerDay",
            "type": "u64"
          },
          {
            "name": "minDiscountBps",
            "type": "u32"
          },
          {
            "name": "reserveFloor",
            "type": "u64"
          },
          {
            "name": "keeper",
            "docs": [
              "`Pubkey::default()` = any keeper."
            ],
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "grantUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "enabled",
            "type": "bool"
          },
          {
            "name": "maxPerOffer",
            "type": "u64"
          },
          {
            "name": "maxPerDay",
            "type": "u64"
          },
          {
            "name": "minDiscountBps",
            "type": "u32"
          },
          {
            "name": "reserveFloor",
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
      "name": "offer",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "status",
            "type": "u8"
          },
          {
            "name": "id",
            "type": "u64"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "seller",
            "type": "pubkey"
          },
          {
            "name": "sellerQuote",
            "docs": [
              "Seller's quote account receiving fill and remainder proceeds."
            ],
            "type": "pubkey"
          },
          {
            "name": "bidVault",
            "docs": [
              "ATA(offer, quote) holding bid funds."
            ],
            "type": "pubkey"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "expiresAt",
            "type": "i64"
          },
          {
            "name": "coveredAt",
            "type": "i64"
          },
          {
            "name": "closedAt",
            "type": "i64"
          },
          {
            "name": "settledAt",
            "type": "i64"
          },
          {
            "name": "amount",
            "docs": [
              "Tokens escrowed at creation."
            ],
            "type": "u64"
          },
          {
            "name": "lots",
            "type": "u64"
          },
          {
            "name": "lotSize",
            "type": "u64"
          },
          {
            "name": "lotCost",
            "type": "u64"
          },
          {
            "name": "dust",
            "type": "u64"
          },
          {
            "name": "twap",
            "docs": [
              "TWAP at creation (quote per base × 1e18) and the frozen fill price."
            ],
            "type": "u128"
          },
          {
            "name": "fillPrice",
            "type": "u128"
          },
          {
            "name": "discountBps",
            "type": "u32"
          },
          {
            "name": "momentumBps",
            "type": "i64"
          },
          {
            "name": "bidEpochSecs",
            "type": "u32"
          },
          {
            "name": "sellerLotTenure",
            "docs": [
              "Tenure carried by the escrowed tokens (seller's lot tenure)."
            ],
            "type": "u128"
          },
          {
            "name": "totalCapacity",
            "docs": [
              "Σ bid capacities (lots) — `C` in the allocation."
            ],
            "type": "u64"
          },
          {
            "name": "bidCount",
            "type": "u32"
          },
          {
            "name": "bidQuoteTotal",
            "type": "u64"
          },
          {
            "name": "randSlot",
            "type": "u64"
          },
          {
            "name": "seed",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "randomOffset",
            "docs": [
              "Systematic-sampling offset `U ∈ [0, C)`."
            ],
            "type": "u64"
          },
          {
            "name": "shieldLots",
            "type": "u64"
          },
          {
            "name": "bidderLots",
            "docs": [
              "Lots allocated to bidders: min(C, lots − shield_lots)."
            ],
            "type": "u64"
          },
          {
            "name": "remainderTokens",
            "type": "u64"
          },
          {
            "name": "remainderSold",
            "type": "bool"
          },
          {
            "name": "proceeds",
            "type": "u64"
          },
          {
            "name": "fee",
            "type": "u64"
          },
          {
            "name": "remainderProceeds",
            "type": "u64"
          },
          {
            "name": "claimedCount",
            "type": "u32"
          },
          {
            "name": "tokensClaimed",
            "type": "u64"
          },
          {
            "name": "escrowed",
            "docs": [
              "Tokens still in escrow for this offer."
            ],
            "type": "u64"
          },
          {
            "name": "messageLen",
            "type": "u8"
          },
          {
            "name": "message",
            "type": {
              "array": [
                "u8",
                140
              ]
            }
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
      "name": "positionData",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "initial",
            "type": "u64"
          },
          {
            "name": "multiplierBps",
            "type": "u32"
          },
          {
            "name": "pSnap",
            "type": "u128"
          },
          {
            "name": "sSnap",
            "type": "u128"
          },
          {
            "name": "gSnap",
            "type": "u128"
          },
          {
            "name": "seqSnap",
            "type": "u64"
          },
          {
            "name": "epochSnap",
            "type": "u64"
          },
          {
            "name": "scaleSnap",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "shield",
      "docs": [
        "The single protocol Shield Pool of a market (spec §3.5)."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "quoteVault",
            "docs": [
              "ATA(shield, quote): locked deposits."
            ],
            "type": "pubkey"
          },
          {
            "name": "tokenVault",
            "docs": [
              "ATA(shield, mint): absorbed tokens awaiting claim."
            ],
            "type": "pubkey"
          },
          {
            "name": "rewardsVault",
            "docs": [
              "PDA token account receiving the 10 % fee stream, penalties and",
              "redemption fees (`[\"shield_rewards\", mint]`)."
            ],
            "type": "pubkey"
          },
          {
            "name": "pool",
            "type": {
              "defined": {
                "name": "shieldPoolData"
              }
            }
          },
          {
            "name": "rewardsAccounted",
            "docs": [
              "Rewards in `rewards_vault` already distributed but not yet claimed."
            ],
            "type": "u64"
          },
          {
            "name": "tokensAccounted",
            "docs": [
              "Tokens in `token_vault` owed to depositors (gains not yet claimed)."
            ],
            "type": "u64"
          },
          {
            "name": "positions",
            "type": "u64"
          },
          {
            "name": "absorbedQuote",
            "type": "u64"
          },
          {
            "name": "absorbedTokens",
            "type": "u64"
          },
          {
            "name": "offersAbsorbed",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "shieldAbsorbed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "offer",
            "type": "pubkey"
          },
          {
            "name": "lots",
            "type": "u64"
          },
          {
            "name": "quoteSpent",
            "type": "u64"
          },
          {
            "name": "tokensGained",
            "type": "u64"
          },
          {
            "name": "totalDepositsAfter",
            "type": "u64"
          },
          {
            "name": "ts",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "shieldPoolData",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "totalDeposits",
            "type": "u64"
          },
          {
            "name": "totalWeighted",
            "type": "u128"
          },
          {
            "name": "p",
            "type": "u128"
          },
          {
            "name": "scale",
            "type": "u64"
          },
          {
            "name": "epoch",
            "type": "u64"
          },
          {
            "name": "seq",
            "type": "u64"
          },
          {
            "name": "sums",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "sumEntryData"
                  }
                },
                16
              ]
            }
          },
          {
            "name": "undistributedRewards",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "shieldPosition",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "id",
            "type": "u32"
          },
          {
            "name": "pos",
            "type": {
              "defined": {
                "name": "positionData"
              }
            }
          },
          {
            "name": "principal",
            "type": "u64"
          },
          {
            "name": "lockStart",
            "type": "i64"
          },
          {
            "name": "lockEnd",
            "type": "i64"
          },
          {
            "name": "claimedTokens",
            "type": "u64"
          },
          {
            "name": "claimedRewards",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "shieldPositionEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "id",
            "type": "u32"
          },
          {
            "name": "kind",
            "docs": [
              "0 open, 1 claim, 2 withdraw"
            ],
            "type": "u8"
          },
          {
            "name": "principal",
            "type": "u64"
          },
          {
            "name": "tokens",
            "type": "u64"
          },
          {
            "name": "rewards",
            "type": "u64"
          },
          {
            "name": "multiplierBps",
            "type": "u32"
          },
          {
            "name": "lockEnd",
            "type": "i64"
          },
          {
            "name": "ts",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "shieldRewardsSynced",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "ts",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "sumEntryData",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "seq",
            "type": "u64"
          },
          {
            "name": "epoch",
            "type": "u64"
          },
          {
            "name": "scale",
            "type": "u64"
          },
          {
            "name": "s",
            "type": "u128"
          },
          {
            "name": "g",
            "type": "u128"
          }
        ]
      }
    },
    {
      "name": "yieldEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "kind",
            "docs": [
              "0 deposit to adapter, 1 withdraw from adapter, 2 sync"
            ],
            "type": "u8"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "adapterValue",
            "type": "u64"
          },
          {
            "name": "idleAssets",
            "type": "u64"
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
