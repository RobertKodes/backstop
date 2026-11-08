/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/backstop_launchpad.json`.
 */
export type BackstopLaunchpad = {
  "address": "ZzoHe1DMEHWDVnHQs7UnHJF8p6pdRVpk7629ygyLEXU",
  "metadata": {
    "name": "backstopLaunchpad",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "BACKSTOP launchpad: permissionless factory for child tokens running on the same engine, paying 30% of fees to BACKSTOP holders."
  },
  "instructions": [
    {
      "name": "claimVested",
      "discriminator": [
        208,
        190,
        166,
        114,
        203,
        225,
        140,
        208
      ],
      "accounts": [
        {
          "name": "creator",
          "signer": true,
          "relations": [
            "child"
          ]
        },
        {
          "name": "child",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  104,
                  105,
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
          "name": "mint",
          "relations": [
            "child"
          ]
        },
        {
          "name": "vestingAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  101,
                  115,
                  116,
                  105,
                  110,
                  103
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
          "name": "vestingVault",
          "writable": true
        },
        {
          "name": "creatorToken",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        }
      ],
      "args": []
    },
    {
      "name": "createChild",
      "discriminator": [
        111,
        163,
        247,
        122,
        209,
        177,
        241,
        4
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "mint",
          "docs": [
            "Fresh keypair for the child mint."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  97,
                  117,
                  110,
                  99,
                  104,
                  112,
                  97,
                  100
                ]
              }
            ]
          }
        },
        {
          "name": "parentMarket",
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
                "path": "config.parentMint",
                "account": "launchpadConfig"
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
          "name": "mintAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  104,
                  105,
                  108,
                  100,
                  95,
                  109,
                  105,
                  110,
                  116,
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
          "name": "child",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  104,
                  105,
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
          "name": "tokenProgram",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "childParams"
            }
          }
        }
      ]
    },
    {
      "name": "initChildBook",
      "discriminator": [
        18,
        111,
        103,
        30,
        171,
        188,
        226,
        179
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true,
          "relations": [
            "child"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  97,
                  117,
                  110,
                  99,
                  104,
                  112,
                  97,
                  100
                ]
              }
            ]
          }
        },
        {
          "name": "child",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  104,
                  105,
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
          "name": "market"
        },
        {
          "name": "mint",
          "relations": [
            "child"
          ]
        },
        {
          "name": "quoteMint"
        },
        {
          "name": "book",
          "writable": true
        },
        {
          "name": "escrowVault",
          "writable": true
        },
        {
          "name": "baseTokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "offersProgram",
          "address": "DW1bgui9AwKGmBxRryjGn6CtKYfo2aXuyeHXLxzewGj"
        }
      ],
      "args": []
    },
    {
      "name": "initChildChests",
      "discriminator": [
        233,
        238,
        52,
        249,
        17,
        194,
        98,
        133
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true,
          "relations": [
            "child"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  97,
                  117,
                  110,
                  99,
                  104,
                  112,
                  97,
                  100
                ]
              }
            ]
          }
        },
        {
          "name": "child",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  104,
                  105,
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
          "name": "market"
        },
        {
          "name": "mint",
          "relations": [
            "child"
          ]
        },
        {
          "name": "quoteMint"
        },
        {
          "name": "chestMarket",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "rewardsAuth"
        },
        {
          "name": "holderRewardsVault",
          "writable": true
        },
        {
          "name": "shield",
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
          "name": "shieldRewardsVault",
          "writable": true
        },
        {
          "name": "baseTokenProgram"
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
        },
        {
          "name": "chestProgram",
          "address": "5Hwrxz9JJoGxcZNSzP7TTAju2C2KMPtNBHtdifnU3tB5"
        }
      ],
      "args": []
    },
    {
      "name": "initChildHook",
      "discriminator": [
        134,
        12,
        13,
        157,
        179,
        246,
        131,
        106
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true,
          "relations": [
            "child"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  97,
                  117,
                  110,
                  99,
                  104,
                  112,
                  97,
                  100
                ]
              }
            ]
          }
        },
        {
          "name": "child",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  104,
                  105,
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
          "name": "mint",
          "relations": [
            "child"
          ]
        },
        {
          "name": "mintAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  104,
                  105,
                  108,
                  100,
                  95,
                  109,
                  105,
                  110,
                  116,
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
          "name": "hookConfig",
          "writable": true
        },
        {
          "name": "extraMetas",
          "writable": true
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
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initChildMarket",
      "discriminator": [
        65,
        245,
        16,
        228,
        68,
        67,
        92,
        247
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true,
          "relations": [
            "child"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  97,
                  117,
                  110,
                  99,
                  104,
                  112,
                  97,
                  100
                ]
              }
            ]
          }
        },
        {
          "name": "child",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  104,
                  105,
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
          "name": "mint",
          "relations": [
            "child"
          ]
        },
        {
          "name": "hookConfig"
        },
        {
          "name": "quoteMint",
          "address": "So11111111111111111111111111111111111111112"
        },
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "treasury",
          "writable": true
        },
        {
          "name": "feeVault",
          "writable": true
        },
        {
          "name": "treasuryQuoteVault",
          "writable": true
        },
        {
          "name": "parentVault",
          "writable": true
        },
        {
          "name": "quoteTokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "coreProgram",
          "address": "AstnKdypNsaRAxX88cTCDCit11mCqeRRnQ2x6cfZJFzK"
        }
      ],
      "args": []
    },
    {
      "name": "initChildPool",
      "discriminator": [
        149,
        67,
        139,
        117,
        151,
        149,
        97,
        255
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true,
          "relations": [
            "child"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  97,
                  117,
                  110,
                  99,
                  104,
                  112,
                  97,
                  100
                ]
              }
            ]
          }
        },
        {
          "name": "child",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  104,
                  105,
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
          "name": "market"
        },
        {
          "name": "mint",
          "relations": [
            "child"
          ]
        },
        {
          "name": "quoteMint"
        },
        {
          "name": "pool",
          "writable": true
        },
        {
          "name": "ammBaseVault"
        },
        {
          "name": "quoteVault",
          "writable": true
        },
        {
          "name": "creatorWsol",
          "docs": [
            "Creator's wSOL account funding the locked liquidity."
          ],
          "writable": true
        },
        {
          "name": "baseTokenProgram"
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
        },
        {
          "name": "ammProgram",
          "address": "8m9GWYsGaqmGECJnN6kipQXiaJfk8t2MhS8U5LugUw8b"
        }
      ],
      "args": []
    },
    {
      "name": "initLaunchpad",
      "discriminator": [
        114,
        181,
        7,
        128,
        0,
        24,
        234,
        119
      ],
      "accounts": [
        {
          "name": "governance",
          "writable": true,
          "signer": true,
          "relations": [
            "parentMarket"
          ]
        },
        {
          "name": "parentMarket",
          "docs": [
            "BACKSTOP's market; its governance owns the launchpad."
          ],
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
                "path": "parentMarket.mint",
                "account": "market"
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
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  97,
                  117,
                  110,
                  99,
                  104,
                  112,
                  97,
                  100
                ]
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
              "name": "launchpadArgs"
            }
          }
        }
      ]
    },
    {
      "name": "mintChildSupply",
      "discriminator": [
        70,
        137,
        92,
        82,
        146,
        65,
        109,
        45
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true,
          "relations": [
            "child"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  97,
                  117,
                  110,
                  99,
                  104,
                  112,
                  97,
                  100
                ]
              }
            ]
          }
        },
        {
          "name": "child",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  104,
                  105,
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
          "name": "mint",
          "writable": true,
          "relations": [
            "child"
          ]
        },
        {
          "name": "mintAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  104,
                  105,
                  108,
                  100,
                  95,
                  109,
                  105,
                  110,
                  116,
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
          "name": "hookConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  111,
                  111,
                  107,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
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
          "name": "poolAuthority",
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
          "name": "poolVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "poolAuthority"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
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
          "name": "vestingAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  101,
                  115,
                  116,
                  105,
                  110,
                  103
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
          "name": "vestingVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "vestingAuthority"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
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
          "name": "tokenProgram",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
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
      "name": "updateLaunchpad",
      "discriminator": [
        73,
        253,
        42,
        252,
        2,
        113,
        239,
        192
      ],
      "accounts": [
        {
          "name": "governance",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  97,
                  117,
                  110,
                  99,
                  104,
                  112,
                  97,
                  100
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "launchpadArgs"
            }
          }
        },
        {
          "name": "parentShareBps",
          "type": "u16"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "childLaunch",
      "discriminator": [
        75,
        27,
        171,
        58,
        220,
        74,
        253,
        214
      ]
    },
    {
      "name": "launchpadConfig",
      "discriminator": [
        205,
        61,
        113,
        174,
        159,
        51,
        248,
        24
      ]
    }
  ],
  "events": [
    {
      "name": "childCreated",
      "discriminator": [
        70,
        15,
        83,
        47,
        230,
        131,
        138,
        237
      ]
    },
    {
      "name": "childLaunched",
      "discriminator": [
        112,
        249,
        157,
        137,
        153,
        15,
        152,
        193
      ]
    },
    {
      "name": "childStep",
      "discriminator": [
        13,
        139,
        160,
        42,
        34,
        209,
        116,
        248
      ]
    },
    {
      "name": "vestedClaimed",
      "discriminator": [
        90,
        39,
        80,
        199,
        242,
        108,
        89,
        46
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
      "name": "paused",
      "msg": "The launchpad is paused (emergency)"
    },
    {
      "code": 6002,
      "name": "badMetadata",
      "msg": "Name must be 1–32 bytes, symbol 1–10 bytes, URI ≤ 200 bytes"
    },
    {
      "code": 6003,
      "name": "badSupply",
      "msg": "Supply must be positive"
    },
    {
      "code": 6004,
      "name": "creatorAllocationTooHigh",
      "msg": "Creator allocation exceeds the maximum (5 %)"
    },
    {
      "code": 6005,
      "name": "liquidityTooLow",
      "msg": "Initial liquidity below the minimum (5 SOL)"
    },
    {
      "code": 6006,
      "name": "wrongStep",
      "msg": "Launch step called out of order"
    },
    {
      "code": 6007,
      "name": "hookNotReady",
      "msg": "Hook reward state is not ready"
    },
    {
      "code": 6008,
      "name": "nothingToClaim",
      "msg": "Nothing vested to claim"
    },
    {
      "code": 6009,
      "name": "mathOverflow",
      "msg": "Arithmetic error"
    }
  ],
  "types": [
    {
      "name": "childCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "name",
            "type": "string"
          },
          {
            "name": "symbol",
            "type": "string"
          },
          {
            "name": "supply",
            "type": "u64"
          },
          {
            "name": "creatorBps",
            "type": "u16"
          },
          {
            "name": "liquidity",
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
      "name": "childLaunch",
      "docs": [
        "One child launch (`[\"child\", mint]`)."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "mintAuthBump",
            "type": "u8"
          },
          {
            "name": "vestingBump",
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
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "nameLen",
            "type": "u8"
          },
          {
            "name": "name",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "symbolLen",
            "type": "u8"
          },
          {
            "name": "symbol",
            "type": {
              "array": [
                "u8",
                10
              ]
            }
          },
          {
            "name": "uriLen",
            "type": "u8"
          },
          {
            "name": "uri",
            "type": {
              "array": [
                "u8",
                200
              ]
            }
          },
          {
            "name": "supply",
            "type": "u64"
          },
          {
            "name": "creatorBps",
            "type": "u16"
          },
          {
            "name": "creatorAmount",
            "type": "u64"
          },
          {
            "name": "liquidityLamports",
            "type": "u64"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "vestingStart",
            "type": "i64"
          },
          {
            "name": "vestingEnd",
            "type": "i64"
          },
          {
            "name": "vestedClaimed",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "childLaunched",
      "docs": [
        "Emitted when the child is fully live (indexed into `child_tokens`)."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "parent",
            "type": "pubkey"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "name",
            "type": "string"
          },
          {
            "name": "symbol",
            "type": "string"
          },
          {
            "name": "uri",
            "type": "string"
          },
          {
            "name": "supply",
            "type": "u64"
          },
          {
            "name": "creatorBps",
            "type": "u16"
          },
          {
            "name": "liquidity",
            "type": "u64"
          },
          {
            "name": "vestingEnd",
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
      "name": "childParams",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "name",
            "type": "string"
          },
          {
            "name": "symbol",
            "type": "string"
          },
          {
            "name": "uri",
            "type": "string"
          },
          {
            "name": "supply",
            "type": "u64"
          },
          {
            "name": "creatorBps",
            "type": "u16"
          },
          {
            "name": "liquidityLamports",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "childStep",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "status",
            "type": "u8"
          },
          {
            "name": "ts",
            "type": "i64"
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
      "name": "hookConfig",
      "docs": [
        "Market-level hook configuration (Borsh account, rarely written)."
      ],
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
            "name": "rewardBump",
            "type": "u8"
          },
          {
            "name": "rewardReady",
            "docs": [
              "RewardState has reached its full size and is initialised."
            ],
            "type": "bool"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "governance",
            "docs": [
              "Governance (Squads multisig vault on mainnet)."
            ],
            "type": "pubkey"
          },
          {
            "name": "pendingGovernance",
            "docs": [
              "Two-step governance transfer target (default = none)."
            ],
            "type": "pubkey"
          },
          {
            "name": "coreAuthority",
            "docs": [
              "`backstop-core` market PDA: may deposit rewards and record burns."
            ],
            "type": "pubkey"
          },
          {
            "name": "offersAuthority",
            "docs": [
              "`backstop-offers` book PDA: may credit absorb tenure."
            ],
            "type": "pubkey"
          },
          {
            "name": "chestAuthority",
            "docs": [
              "`backstop-chest` chest-market PDA: may harvest rewards into chests."
            ],
            "type": "pubkey"
          },
          {
            "name": "ammAuthority",
            "docs": [
              "`backstop-amm` pool PDA: transfers into it from wallets are direct sells."
            ],
            "type": "pubkey"
          },
          {
            "name": "allowedPrograms",
            "docs": [
              "Programs that may be the top-level instruction of a token movement."
            ],
            "type": {
              "array": [
                "pubkey",
                8
              ]
            }
          },
          {
            "name": "allowedOwners",
            "docs": [
              "Off-curve token-account owners permitted to receive tokens."
            ],
            "type": {
              "array": [
                "pubkey",
                8
              ]
            }
          },
          {
            "name": "tenureCapSecs",
            "docs": [
              "Average age at which the tenure multiplier caps (default 90 d)."
            ],
            "type": "u64"
          },
          {
            "name": "tenureExtraBps",
            "docs": [
              "Multiplier above 1.0 at the cap, bps (default 20_000 → 3.0×)."
            ],
            "type": "u32"
          },
          {
            "name": "absorbTenureBps",
            "docs": [
              "Share of a seller's lot tenure transferred to absorbers (default 40 %)."
            ],
            "type": "u32"
          },
          {
            "name": "directSellCap",
            "docs": [
              "Rolling per-wallet cap on direct AMM sells (default = min offer size)."
            ],
            "type": "u64"
          },
          {
            "name": "directSellWindowSecs",
            "type": "u64"
          },
          {
            "name": "linkMinAmount",
            "docs": [
              "Minimum direct transfer recorded in the recent-sender ring."
            ],
            "type": "u64"
          },
          {
            "name": "linkWindowSecs",
            "type": "u64"
          },
          {
            "name": "epochSecs",
            "docs": [
              "Distribution epoch length — immutable after initialisation."
            ],
            "type": "u64"
          },
          {
            "name": "genesisTs",
            "docs": [
              "Boundary 0 timestamp — immutable after initialisation."
            ],
            "type": "i64"
          },
          {
            "name": "holders",
            "type": "u64"
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
      "name": "launchpadArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "childGuardian",
            "type": "pubkey"
          },
          {
            "name": "childKeeper",
            "type": "pubkey"
          },
          {
            "name": "swapProgram",
            "type": "pubkey"
          },
          {
            "name": "oracle",
            "type": {
              "defined": {
                "name": "oracleConfig"
              }
            }
          }
        ]
      }
    },
    {
      "name": "launchpadConfig",
      "docs": [
        "Global launchpad settings (`[\"launchpad\"]`). This PDA is also the",
        "authority other programs accept for child-market initialisation."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "governance",
            "type": "pubkey"
          },
          {
            "name": "parentMint",
            "docs": [
              "BACKSTOP mint: children route their parent share here."
            ],
            "type": "pubkey"
          },
          {
            "name": "childGovernance",
            "docs": [
              "Governance installed on every child's hook config and market."
            ],
            "type": "pubkey"
          },
          {
            "name": "childGuardian",
            "type": "pubkey"
          },
          {
            "name": "childKeeper",
            "type": "pubkey"
          },
          {
            "name": "swapProgram",
            "type": "pubkey"
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
            "name": "minLiquidityLamports",
            "type": "u64"
          },
          {
            "name": "maxCreatorBps",
            "type": "u16"
          },
          {
            "name": "vestingSecs",
            "type": "i64"
          },
          {
            "name": "parentShareBps",
            "type": "u16"
          },
          {
            "name": "children",
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
      "name": "vestedClaimed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "totalClaimed",
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
