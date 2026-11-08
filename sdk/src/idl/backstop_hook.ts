/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/backstop_hook.json`.
 */
export type BackstopHook = {
  "address": "g86T56A9yM46y5cyVCVzB1K6MtV5cx89DsFiapy59eP",
  "metadata": {
    "name": "backstopHook",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "BACKSTOP Token-2022 transfer hook: protocol allowlist, tenure accumulator and tenure-weighted reward accounting."
  },
  "instructions": [
    {
      "name": "acceptGovernance",
      "discriminator": [
        248,
        124,
        36,
        211,
        224,
        191,
        79,
        227
      ],
      "accounts": [
        {
          "name": "newGovernance",
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
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
                "path": "config.mint",
                "account": "hookConfig"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "advanceEpochs",
      "discriminator": [
        115,
        96,
        36,
        134,
        166,
        247,
        66,
        162
      ],
      "accounts": [
        {
          "name": "config",
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
                "path": "config.mint",
                "account": "hookConfig"
              }
            ]
          }
        },
        {
          "name": "rewardState",
          "writable": true,
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
                  95,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "config.mint",
                "account": "hookConfig"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "maxSteps",
          "type": "u64"
        }
      ]
    },
    {
      "name": "checkpoint",
      "discriminator": [
        213,
        200,
        19,
        204,
        240,
        143,
        184,
        252
      ],
      "accounts": [
        {
          "name": "config",
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
                "path": "config.mint",
                "account": "hookConfig"
              }
            ]
          }
        },
        {
          "name": "rewardState",
          "writable": true,
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
                  95,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "config.mint",
                "account": "hookConfig"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "closeHolder",
      "discriminator": [
        88,
        22,
        239,
        228,
        245,
        64,
        37,
        78
      ],
      "accounts": [
        {
          "name": "wallet",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
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
                "path": "config.mint",
                "account": "hookConfig"
              }
            ]
          }
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
                "path": "config.mint",
                "account": "hookConfig"
              },
              {
                "kind": "account",
                "path": "wallet"
              }
            ]
          }
        },
        {
          "name": "rewardState",
          "writable": true,
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
                  95,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "config.mint",
                "account": "hookConfig"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "creditTenure",
      "discriminator": [
        17,
        238,
        194,
        156,
        254,
        201,
        159,
        112
      ],
      "accounts": [
        {
          "name": "authority",
          "docs": [
            "`backstop-offers` book PDA."
          ],
          "signer": true
        },
        {
          "name": "config",
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
                "path": "config.mint",
                "account": "hookConfig"
              }
            ]
          }
        },
        {
          "name": "holder",
          "writable": true
        },
        {
          "name": "rewardState",
          "writable": true,
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
                  95,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "config.mint",
                "account": "hookConfig"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "rawLotTenure",
          "type": "u128"
        }
      ]
    },
    {
      "name": "depositRewards",
      "discriminator": [
        52,
        249,
        112,
        72,
        206,
        161,
        196,
        1
      ],
      "accounts": [
        {
          "name": "authority",
          "docs": [
            "`backstop-core` market PDA (fee distributor)."
          ],
          "signer": true
        },
        {
          "name": "config",
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
                "path": "config.mint",
                "account": "hookConfig"
              }
            ]
          }
        },
        {
          "name": "rewardState",
          "writable": true,
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
                  95,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "config.mint",
                "account": "hookConfig"
              }
            ]
          }
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
      "name": "execute",
      "docs": [
        "SPL transfer-hook `Execute`, invoked by Token-2022 on every transfer."
      ],
      "discriminator": [
        105,
        37,
        101,
        197,
        75,
        251,
        102,
        26
      ],
      "accounts": [
        {
          "name": "source"
        },
        {
          "name": "mint",
          "relations": [
            "config"
          ]
        },
        {
          "name": "destination"
        },
        {
          "name": "authority"
        },
        {
          "name": "extraMetas"
        },
        {
          "name": "config",
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
            ]
          }
        },
        {
          "name": "instructions",
          "address": "Sysvar1nstructions1111111111111111111111111"
        },
        {
          "name": "srcHolder",
          "writable": true
        },
        {
          "name": "dstHolder",
          "writable": true
        },
        {
          "name": "rewardState",
          "writable": true,
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
                  95,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
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
      "name": "growRewardState",
      "docs": [
        "Grow the reward state by 10 KiB (call until `reward_ready`)."
      ],
      "discriminator": [
        160,
        218,
        105,
        132,
        153,
        31,
        174,
        133
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
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
                "path": "config.mint",
                "account": "hookConfig"
              }
            ]
          }
        },
        {
          "name": "rewardState",
          "writable": true,
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
                  95,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "config.mint",
                "account": "hookConfig"
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
          "name": "authority",
          "docs": [
            "`backstop-chest` chest-market PDA."
          ],
          "signer": true
        },
        {
          "name": "config",
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
                "path": "config.mint",
                "account": "hookConfig"
              }
            ]
          }
        },
        {
          "name": "holder",
          "writable": true
        },
        {
          "name": "rewardState",
          "writable": true,
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
                  95,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "config.mint",
                "account": "hookConfig"
              }
            ]
          }
        }
      ],
      "args": [],
      "returns": "u64"
    },
    {
      "name": "initialize",
      "docs": [
        "Create the hook config, extra-account-meta list and the first chunk of",
        "the reward state for `mint`. Signed by the current mint authority."
      ],
      "discriminator": [
        175,
        175,
        109,
        31,
        13,
        152,
        155,
        237
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "mintAuthority",
          "docs": [
            "Current mint authority of `mint` (deployer at genesis; the launchpad",
            "PDA for child tokens)."
          ],
          "signer": true
        },
        {
          "name": "mint"
        },
        {
          "name": "config",
          "writable": true,
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
            ]
          }
        },
        {
          "name": "extraMetas",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  120,
                  116,
                  114,
                  97,
                  45,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116,
                  45,
                  109,
                  101,
                  116,
                  97,
                  115
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
          "name": "rewardState",
          "writable": true,
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
                  95,
                  115,
                  116,
                  97,
                  116,
                  101
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
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "initializeArgs"
            }
          }
        }
      ]
    },
    {
      "name": "proposeGovernance",
      "discriminator": [
        129,
        138,
        213,
        117,
        56,
        242,
        208,
        54
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
                "path": "config.mint",
                "account": "hookConfig"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "newGovernance",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "recordBurn",
      "discriminator": [
        254,
        128,
        98,
        33,
        0,
        74,
        165,
        252
      ],
      "accounts": [
        {
          "name": "authority",
          "docs": [
            "`backstop-core` market PDA."
          ],
          "signer": true
        },
        {
          "name": "config",
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
                "path": "config.mint",
                "account": "hookConfig"
              }
            ]
          }
        },
        {
          "name": "holder",
          "writable": true
        },
        {
          "name": "rewardState",
          "writable": true,
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
                  95,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "config.mint",
                "account": "hookConfig"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "wallet",
          "type": "pubkey"
        },
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "registerHolder",
      "discriminator": [
        113,
        111,
        117,
        246,
        175,
        59,
        98,
        161
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "wallet",
          "signer": true
        },
        {
          "name": "mint",
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
            ]
          }
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
                "path": "mint"
              },
              {
                "kind": "account",
                "path": "wallet"
              }
            ]
          }
        },
        {
          "name": "rewardState",
          "writable": true,
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
                  95,
                  115,
                  116,
                  97,
                  116,
                  101
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
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "setAllowlist",
      "discriminator": [
        141,
        30,
        41,
        131,
        132,
        7,
        216,
        134
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
                "path": "config.mint",
                "account": "hookConfig"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "programs",
          "type": {
            "vec": "pubkey"
          }
        },
        {
          "name": "owners",
          "type": {
            "vec": "pubkey"
          }
        }
      ]
    },
    {
      "name": "setParams",
      "discriminator": [
        27,
        234,
        178,
        52,
        147,
        2,
        187,
        141
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
                "path": "config.mint",
                "account": "hookConfig"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "hookParams"
            }
          }
        }
      ]
    },
    {
      "name": "syncHolder",
      "discriminator": [
        33,
        218,
        181,
        194,
        137,
        165,
        224,
        210
      ],
      "accounts": [
        {
          "name": "wallet",
          "signer": true
        },
        {
          "name": "config",
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
                "path": "config.mint",
                "account": "hookConfig"
              }
            ]
          }
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
                "path": "config.mint",
                "account": "hookConfig"
              },
              {
                "kind": "account",
                "path": "wallet"
              }
            ]
          }
        },
        {
          "name": "rewardState",
          "writable": true,
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
                  95,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "config.mint",
                "account": "hookConfig"
              }
            ]
          }
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "holder",
      "discriminator": [
        37,
        121,
        1,
        40,
        55,
        46,
        199,
        157
      ]
    },
    {
      "name": "hookConfig",
      "discriminator": [
        137,
        155,
        101,
        95,
        138,
        72,
        8,
        182
      ]
    },
    {
      "name": "rewardState",
      "discriminator": [
        86,
        245,
        149,
        170,
        90,
        108,
        31,
        251
      ]
    }
  ],
  "events": [
    {
      "name": "allowlistUpdated",
      "discriminator": [
        88,
        239,
        93,
        65,
        74,
        140,
        83,
        213
      ]
    },
    {
      "name": "epochsAdvanced",
      "discriminator": [
        186,
        244,
        137,
        225,
        119,
        193,
        151,
        98
      ]
    },
    {
      "name": "holderRegistered",
      "discriminator": [
        201,
        78,
        223,
        133,
        103,
        164,
        173,
        136
      ]
    },
    {
      "name": "holderSynced",
      "discriminator": [
        65,
        47,
        59,
        202,
        75,
        82,
        26,
        121
      ]
    },
    {
      "name": "hookInitialized",
      "discriminator": [
        127,
        123,
        212,
        103,
        69,
        142,
        254,
        152
      ]
    },
    {
      "name": "hookParamsUpdated",
      "discriminator": [
        50,
        86,
        7,
        64,
        97,
        226,
        115,
        23
      ]
    },
    {
      "name": "rewardsDeposited",
      "discriminator": [
        120,
        19,
        149,
        33,
        111,
        163,
        248,
        156
      ]
    },
    {
      "name": "rewardsHarvested",
      "discriminator": [
        27,
        248,
        121,
        187,
        166,
        132,
        212,
        89
      ]
    },
    {
      "name": "tenureCredited",
      "discriminator": [
        200,
        10,
        30,
        95,
        55,
        229,
        143,
        101
      ]
    },
    {
      "name": "tenureReset",
      "discriminator": [
        55,
        211,
        193,
        138,
        46,
        123,
        2,
        142
      ]
    },
    {
      "name": "transferTracked",
      "discriminator": [
        247,
        80,
        12,
        39,
        45,
        133,
        250,
        107
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "unauthorizedProgram",
      "msg": "Token movement initiated by a program that is not on the protocol allowlist"
    },
    {
      "code": 6001,
      "name": "unauthorizedDestination",
      "msg": "Destination owner is a program account that is not on the protocol allowlist"
    },
    {
      "code": 6002,
      "name": "directTransferToProtocolAccount",
      "msg": "Direct transfers may only target wallet (on-curve) owners"
    },
    {
      "code": 6003,
      "name": "missingImmutableOwner",
      "msg": "Destination token account must have the ImmutableOwner extension"
    },
    {
      "code": 6004,
      "name": "notTransferring",
      "msg": "Hook invoked outside of a Token-2022 transfer"
    },
    {
      "code": 6005,
      "name": "mintMismatch",
      "msg": "Token account does not belong to this mint"
    },
    {
      "code": 6006,
      "name": "invalidTokenAccount",
      "msg": "Account is not a Token-2022 account"
    },
    {
      "code": 6007,
      "name": "wrongHookProgram",
      "msg": "Mint does not use this program as its transfer hook"
    },
    {
      "code": 6008,
      "name": "notMintAuthority",
      "msg": "Signer is not the current mint authority"
    },
    {
      "code": 6009,
      "name": "unauthorized",
      "msg": "Caller is not authorised for this instruction"
    },
    {
      "code": 6010,
      "name": "directSellCapExceeded",
      "msg": "Direct AMM sells exceed the rolling per-wallet cap; create an offer instead"
    },
    {
      "code": 6011,
      "name": "directSellRequiresHolder",
      "msg": "Direct AMM sells require a registered holder account"
    },
    {
      "code": 6012,
      "name": "rewardStateNotReady",
      "msg": "Reward state is not fully initialised (call grow_reward_state)"
    },
    {
      "code": 6013,
      "name": "epochCatchUpRequired",
      "msg": "Reward epochs are too far behind; call advance_epochs first"
    },
    {
      "code": 6014,
      "name": "holderMismatch",
      "msg": "Holder account does not match the wallet or mint"
    },
    {
      "code": 6015,
      "name": "holderNotEmpty",
      "msg": "Holder still has a balance or unharvested rewards"
    },
    {
      "code": 6016,
      "name": "invalidParameter",
      "msg": "Invalid parameter"
    },
    {
      "code": 6017,
      "name": "allowlistFull",
      "msg": "Too many allowlist entries"
    },
    {
      "code": 6018,
      "name": "duplicateAccount",
      "msg": "Duplicate token account in sync list"
    },
    {
      "code": 6019,
      "name": "mathOverflow",
      "msg": "Arithmetic error"
    },
    {
      "code": 6020,
      "name": "unavailable",
      "msg": "Requested data is unavailable"
    }
  ],
  "types": [
    {
      "name": "allowlistUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "programs",
            "type": {
              "vec": "pubkey"
            }
          },
          {
            "name": "owners",
            "type": {
              "vec": "pubkey"
            }
          }
        ]
      }
    },
    {
      "name": "epochsAdvanced",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "fromEpoch",
            "type": "u64"
          },
          {
            "name": "toEpoch",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "holder",
      "docs": [
        "Per-wallet tenure, weight and reward checkpoint."
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
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "balance",
            "type": "u64"
          },
          {
            "name": "lastTs",
            "type": "i64"
          },
          {
            "name": "registeredAt",
            "type": "i64"
          },
          {
            "name": "capEpoch",
            "type": "u64"
          },
          {
            "name": "rewardEpoch",
            "type": "u64"
          },
          {
            "name": "pendingRewards",
            "type": "u64"
          },
          {
            "name": "lifetimeRewards",
            "type": "u64"
          },
          {
            "name": "dsWindowStart",
            "type": "i64"
          },
          {
            "name": "dsAmount",
            "type": "u64"
          },
          {
            "name": "recentTs",
            "type": {
              "array": [
                "i64",
                8
              ]
            }
          },
          {
            "name": "acc",
            "type": {
              "defined": {
                "name": "podU128"
              }
            }
          },
          {
            "name": "alpha",
            "type": {
              "defined": {
                "name": "podI128"
              }
            }
          },
          {
            "name": "beta",
            "type": {
              "defined": {
                "name": "podI128"
              }
            }
          },
          {
            "name": "cap",
            "type": {
              "defined": {
                "name": "podU128"
              }
            }
          },
          {
            "name": "rSnap",
            "type": {
              "defined": {
                "name": "podU128"
              }
            }
          },
          {
            "name": "rtSnap",
            "type": {
              "defined": {
                "name": "podU128"
              }
            }
          },
          {
            "name": "recentSenders",
            "type": {
              "array": [
                "pubkey",
                8
              ]
            }
          },
          {
            "name": "recentHead",
            "type": "u8"
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
            "name": "pad",
            "type": {
              "array": [
                "u8",
                5
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
      "name": "holderRegistered",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "balance",
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
      "name": "holderSynced",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "balance",
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
      "name": "hookInitialized",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "governance",
            "type": "pubkey"
          },
          {
            "name": "genesisTs",
            "type": "i64"
          },
          {
            "name": "epochSecs",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "hookParams",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "tenureCapSecs",
            "type": "u64"
          },
          {
            "name": "tenureExtraBps",
            "type": "u32"
          },
          {
            "name": "absorbTenureBps",
            "type": "u32"
          },
          {
            "name": "directSellCap",
            "type": "u64"
          },
          {
            "name": "directSellWindowSecs",
            "type": "u64"
          },
          {
            "name": "linkMinAmount",
            "type": "u64"
          },
          {
            "name": "linkWindowSecs",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "hookParamsUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "tenureCapSecs",
            "type": "u64"
          },
          {
            "name": "tenureExtraBps",
            "type": "u32"
          },
          {
            "name": "absorbTenureBps",
            "type": "u32"
          },
          {
            "name": "directSellCap",
            "type": "u64"
          },
          {
            "name": "linkMinAmount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "initializeArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "governance",
            "type": "pubkey"
          },
          {
            "name": "genesisTs",
            "type": "i64"
          },
          {
            "name": "epochSecs",
            "type": "u64"
          },
          {
            "name": "tenureCapSecs",
            "type": "u64"
          },
          {
            "name": "tenureExtraBps",
            "type": "u32"
          },
          {
            "name": "absorbTenureBps",
            "type": "u32"
          },
          {
            "name": "directSellCap",
            "type": "u64"
          },
          {
            "name": "linkMinAmount",
            "type": "u64"
          },
          {
            "name": "linkWindowSecs",
            "type": "u64"
          },
          {
            "name": "directSellWindowSecs",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "podI128",
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
      "name": "podSchedule",
      "serialization": "bytemuck",
      "repr": {
        "kind": "c"
      },
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "epoch",
            "type": "u64"
          },
          {
            "name": "da",
            "type": {
              "defined": {
                "name": "podI128"
              }
            }
          },
          {
            "name": "db",
            "type": {
              "defined": {
                "name": "podI128"
              }
            }
          },
          {
            "name": "dc",
            "type": {
              "defined": {
                "name": "podI128"
              }
            }
          }
        ]
      }
    },
    {
      "name": "podSnapshot",
      "serialization": "bytemuck",
      "repr": {
        "kind": "c"
      },
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "epoch",
            "type": "u64"
          },
          {
            "name": "r",
            "type": {
              "defined": {
                "name": "podU128"
              }
            }
          },
          {
            "name": "rt",
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
      "name": "rewardState",
      "docs": [
        "Global reward accumulator + cap schedule ring for one market (~49 KB)."
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
            "name": "lastEpoch",
            "type": "u64"
          },
          {
            "name": "pending",
            "type": "u64"
          },
          {
            "name": "totalDeposited",
            "type": "u64"
          },
          {
            "name": "totalDistributed",
            "type": "u64"
          },
          {
            "name": "totalHarvested",
            "type": "u64"
          },
          {
            "name": "holders",
            "type": "u64"
          },
          {
            "name": "a",
            "type": {
              "defined": {
                "name": "podI128"
              }
            }
          },
          {
            "name": "b",
            "type": {
              "defined": {
                "name": "podI128"
              }
            }
          },
          {
            "name": "c",
            "type": {
              "defined": {
                "name": "podU128"
              }
            }
          },
          {
            "name": "r",
            "type": {
              "defined": {
                "name": "podU128"
              }
            }
          },
          {
            "name": "rt",
            "type": {
              "defined": {
                "name": "podU128"
              }
            }
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
            "name": "pad",
            "type": {
              "array": [
                "u8",
                6
              ]
            }
          },
          {
            "name": "schedule",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "podSchedule"
                  }
                },
                512
              ]
            }
          },
          {
            "name": "snapshots",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "podSnapshot"
                  }
                },
                512
              ]
            }
          }
        ]
      }
    },
    {
      "name": "rewardsDeposited",
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
            "name": "epoch",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "rewardsHarvested",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "tenureCredited",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "rawLotTenure",
            "type": "u128"
          },
          {
            "name": "credited",
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
      "name": "tenureReset",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "balance",
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
      "name": "transferTracked",
      "docs": [
        "Emitted for every tracked token movement. `kind`: 0 = direct transfer,",
        "1 = protocol-routed (AMM / offers / chest / launchpad)."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "srcWallet",
            "type": "pubkey"
          },
          {
            "name": "dstWallet",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "kind",
            "type": "u8"
          },
          {
            "name": "srcTracked",
            "type": "bool"
          },
          {
            "name": "dstTracked",
            "type": "bool"
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
