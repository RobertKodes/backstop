/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/backstop_core.json`.
 */
export type BackstopCore = {
  "address": "AstnKdypNsaRAxX88cTCDCit11mCqeRRnQ2x6cfZJFzK",
  "metadata": {
    "name": "backstopCore",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "BACKSTOP core: market registry & parameters, fee distribution, SOL treasury & redemption floor, governance timelock and the AI agent's bounded authority."
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
          "name": "market",
          "writable": true,
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
                "path": "market.mint",
                "account": "market"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "agentSetParam",
      "discriminator": [
        131,
        49,
        139,
        240,
        110,
        160,
        41,
        80
      ],
      "accounts": [
        {
          "name": "agent",
          "signer": true,
          "relations": [
            "agentAuthority"
          ]
        },
        {
          "name": "market",
          "writable": true,
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
                "path": "market.mint",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "agentAuthority",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  103,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market.mint",
                "account": "market"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "param",
          "type": {
            "defined": {
              "name": "paramId"
            }
          }
        },
        {
          "name": "value",
          "type": "u64"
        }
      ]
    },
    {
      "name": "cancelAction",
      "discriminator": [
        228,
        144,
        170,
        146,
        66,
        88,
        133,
        128
      ],
      "accounts": [
        {
          "name": "governance",
          "writable": true,
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
                "path": "market.mint",
                "account": "market"
              }
            ]
          },
          "relations": [
            "queued"
          ]
        },
        {
          "name": "queued",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "convertParentShare",
      "discriminator": [
        251,
        173,
        12,
        104,
        158,
        242,
        66,
        243
      ],
      "accounts": [
        {
          "name": "keeper",
          "writable": true,
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
                "path": "market.mint",
                "account": "market"
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
                "path": "market.parent",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "parentVault",
          "writable": true
        },
        {
          "name": "parentRewardsVault",
          "writable": true
        },
        {
          "name": "parentHookConfig"
        },
        {
          "name": "parentRewardState",
          "writable": true
        },
        {
          "name": "hookProgram",
          "address": "g86T56A9yM46y5cyVCVzB1K6MtV5cx89DsFiapy59eP"
        },
        {
          "name": "oracleFeed",
          "optional": true
        },
        {
          "name": "swapProgram"
        }
      ],
      "args": [
        {
          "name": "amountIn",
          "type": "u64"
        },
        {
          "name": "swapData",
          "type": "bytes"
        }
      ]
    },
    {
      "name": "convertShieldLamports",
      "discriminator": [
        120,
        113,
        76,
        210,
        24,
        69,
        84,
        115
      ],
      "accounts": [
        {
          "name": "keeper",
          "writable": true,
          "signer": true,
          "relations": [
            "market"
          ]
        },
        {
          "name": "market",
          "writable": true,
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
                "path": "market.mint",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "treasury",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "market.mint",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "wsolMint",
          "address": "So11111111111111111111111111111111111111112"
        },
        {
          "name": "tempWsol",
          "writable": true
        },
        {
          "name": "shieldRewardsVault",
          "writable": true
        },
        {
          "name": "oracleFeed",
          "optional": true
        },
        {
          "name": "swapProgram"
        },
        {
          "name": "wsolTokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
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
          "name": "lamports",
          "type": "u64"
        },
        {
          "name": "swapData",
          "type": "bytes"
        }
      ]
    },
    {
      "name": "convertTreasury",
      "discriminator": [
        198,
        109,
        5,
        248,
        181,
        138,
        132,
        91
      ],
      "accounts": [
        {
          "name": "keeper",
          "writable": true,
          "signer": true,
          "relations": [
            "market"
          ]
        },
        {
          "name": "market",
          "writable": true,
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
                "path": "market.mint",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "treasury",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "market.mint",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "quoteMint"
        },
        {
          "name": "treasuryQuoteVault",
          "writable": true
        },
        {
          "name": "wsolMint",
          "address": "So11111111111111111111111111111111111111112"
        },
        {
          "name": "tempWsol",
          "writable": true
        },
        {
          "name": "oracleFeed",
          "optional": true
        },
        {
          "name": "swapProgram"
        },
        {
          "name": "quoteTokenProgram"
        },
        {
          "name": "wsolTokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
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
          "name": "amountIn",
          "type": "u64"
        },
        {
          "name": "swapData",
          "type": "bytes"
        }
      ]
    },
    {
      "name": "depositExternalRewards",
      "discriminator": [
        3,
        144,
        174,
        108,
        2,
        163,
        86,
        171
      ],
      "accounts": [
        {
          "name": "depositor",
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
                "path": "market.mint",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "quoteMint"
        },
        {
          "name": "depositorToken",
          "writable": true
        },
        {
          "name": "holderRewardsVault",
          "writable": true
        },
        {
          "name": "hookConfig"
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
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "distributeFees",
      "discriminator": [
        120,
        56,
        27,
        7,
        53,
        176,
        113,
        186
      ],
      "accounts": [
        {
          "name": "market",
          "writable": true,
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
                "path": "market.mint",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "quoteMint"
        },
        {
          "name": "feeVault",
          "writable": true
        },
        {
          "name": "holderRewardsVault",
          "writable": true
        },
        {
          "name": "shieldRewardsVault",
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
          "name": "hookConfig"
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
      "name": "donateTreasury",
      "discriminator": [
        109,
        97,
        17,
        162,
        126,
        101,
        52,
        169
      ],
      "accounts": [
        {
          "name": "donor",
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
                "path": "market.mint",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "treasury",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "market.mint",
                "account": "market"
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
          "name": "lamports",
          "type": "u64"
        }
      ]
    },
    {
      "name": "executeAction",
      "discriminator": [
        246,
        137,
        105,
        113,
        247,
        6,
        223,
        174
      ],
      "accounts": [
        {
          "name": "executor",
          "docs": [
            "Anyone may execute once the timelock has expired."
          ],
          "signer": true
        },
        {
          "name": "governance",
          "writable": true
        },
        {
          "name": "market",
          "writable": true,
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
                "path": "market.mint",
                "account": "market"
              }
            ]
          },
          "relations": [
            "queued"
          ]
        },
        {
          "name": "treasury",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "market.mint",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "queued",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  105,
                  109,
                  101,
                  108,
                  111,
                  99,
                  107
                ]
              },
              {
                "kind": "account",
                "path": "market.mint",
                "account": "market"
              },
              {
                "kind": "account",
                "path": "queued.id",
                "account": "queuedAction"
              }
            ]
          }
        },
        {
          "name": "destination",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "initAgent",
      "discriminator": [
        80,
        124,
        209,
        4,
        194,
        195,
        51,
        49
      ],
      "accounts": [
        {
          "name": "governance",
          "writable": true,
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
                "path": "market.mint",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "agentAuthority",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  103,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market.mint",
                "account": "market"
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
          "name": "agent",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "initMarket",
      "discriminator": [
        33,
        253,
        15,
        116,
        89,
        25,
        127,
        236
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
            "Hook governance (root markets) or the launchpad authority PDA (children)."
          ],
          "signer": true
        },
        {
          "name": "mint"
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
          "name": "quoteMint"
        },
        {
          "name": "market",
          "writable": true,
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
            ]
          }
        },
        {
          "name": "treasury",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
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
          "name": "feeVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "market"
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
          "name": "treasuryQuoteVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "treasury"
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
          "name": "parentVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  101,
                  110,
                  116,
                  95,
                  118,
                  97,
                  117,
                  108,
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
          "name": "args",
          "type": {
            "defined": {
              "name": "initMarketArgs"
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
            "market"
          ]
        },
        {
          "name": "market",
          "writable": true,
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
                "path": "market.mint",
                "account": "market"
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
      "name": "queueAction",
      "discriminator": [
        5,
        13,
        174,
        118,
        170,
        185,
        22,
        7
      ],
      "accounts": [
        {
          "name": "governance",
          "writable": true,
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
                "path": "market.mint",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "queued",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  105,
                  109,
                  101,
                  108,
                  111,
                  99,
                  107
                ]
              },
              {
                "kind": "account",
                "path": "market.mint",
                "account": "market"
              },
              {
                "kind": "arg",
                "path": "id"
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
          "name": "id",
          "type": "u64"
        },
        {
          "name": "action",
          "type": {
            "defined": {
              "name": "timelockAction"
            }
          }
        }
      ]
    },
    {
      "name": "redeem",
      "discriminator": [
        184,
        12,
        86,
        149,
        70,
        196,
        97,
        225
      ],
      "accounts": [
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "market",
          "writable": true,
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
            ]
          }
        },
        {
          "name": "treasury",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
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
            "market"
          ]
        },
        {
          "name": "userToken",
          "writable": true
        },
        {
          "name": "ammBaseVault",
          "relations": [
            "market"
          ]
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
                "path": "user"
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
          "name": "hookProgram",
          "address": "g86T56A9yM46y5cyVCVzB1K6MtV5cx89DsFiapy59eP"
        },
        {
          "name": "tokenProgram",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "minLamportsOut",
          "type": "u64"
        }
      ]
    },
    {
      "name": "setAgent",
      "discriminator": [
        154,
        74,
        121,
        91,
        137,
        19,
        101,
        166
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
                "path": "market.mint",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "agentAuthority",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  103,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market.mint",
                "account": "market"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "agent",
          "type": "pubkey"
        },
        {
          "name": "cooldownSecs",
          "type": "i64"
        }
      ]
    },
    {
      "name": "setAgentBound",
      "discriminator": [
        22,
        223,
        142,
        210,
        43,
        185,
        13,
        54
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
                "path": "market.mint",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "agentAuthority",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  103,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market.mint",
                "account": "market"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "param",
          "type": {
            "defined": {
              "name": "paramId"
            }
          }
        },
        {
          "name": "enabled",
          "type": "bool"
        },
        {
          "name": "min",
          "type": "u64"
        },
        {
          "name": "max",
          "type": "u64"
        }
      ]
    },
    {
      "name": "setParam",
      "discriminator": [
        116,
        174,
        75,
        208,
        210,
        13,
        144,
        56
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
          "writable": true,
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
                "path": "market.mint",
                "account": "market"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "param",
          "type": {
            "defined": {
              "name": "paramId"
            }
          }
        },
        {
          "name": "value",
          "type": "u64"
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
            "market"
          ]
        },
        {
          "name": "market",
          "writable": true,
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
                "path": "market.mint",
                "account": "market"
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
              "name": "marketParams"
            }
          }
        }
      ]
    },
    {
      "name": "setPauses",
      "discriminator": [
        48,
        80,
        200,
        227,
        66,
        244,
        226,
        122
      ],
      "accounts": [
        {
          "name": "signer",
          "signer": true
        },
        {
          "name": "market",
          "writable": true,
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
                "path": "market.mint",
                "account": "market"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "pauses",
          "type": "u8"
        }
      ]
    },
    {
      "name": "setRoles",
      "discriminator": [
        119,
        86,
        129,
        161,
        55,
        23,
        250,
        12
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
          "writable": true,
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
                "path": "market.mint",
                "account": "market"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "roles",
          "type": {
            "defined": {
              "name": "roles"
            }
          }
        }
      ]
    },
    {
      "name": "snapshot",
      "discriminator": [
        144,
        236,
        6,
        133,
        233,
        160,
        21,
        94
      ],
      "accounts": [
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
            ]
          }
        },
        {
          "name": "treasury",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
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
            "market"
          ]
        },
        {
          "name": "ammBaseVault",
          "relations": [
            "market"
          ]
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "agentAuthority",
      "discriminator": [
        161,
        225,
        83,
        39,
        179,
        98,
        31,
        118
      ]
    },
    {
      "name": "market",
      "discriminator": [
        219,
        190,
        213,
        55,
        0,
        227,
        198,
        154
      ]
    },
    {
      "name": "queuedAction",
      "discriminator": [
        117,
        70,
        183,
        69,
        156,
        140,
        186,
        32
      ]
    },
    {
      "name": "treasury",
      "discriminator": [
        238,
        239,
        123,
        238,
        89,
        1,
        168,
        253
      ]
    }
  ],
  "events": [
    {
      "name": "actionCancelled",
      "discriminator": [
        121,
        213,
        205,
        29,
        226,
        181,
        230,
        13
      ]
    },
    {
      "name": "actionExecuted",
      "discriminator": [
        116,
        101,
        146,
        36,
        160,
        153,
        182,
        233
      ]
    },
    {
      "name": "actionQueued",
      "discriminator": [
        77,
        189,
        39,
        169,
        248,
        125,
        126,
        168
      ]
    },
    {
      "name": "externalRewardsDeposited",
      "discriminator": [
        102,
        228,
        241,
        181,
        189,
        43,
        5,
        221
      ]
    },
    {
      "name": "feeSwap",
      "discriminator": [
        100,
        90,
        187,
        222,
        49,
        187,
        47,
        144
      ]
    },
    {
      "name": "feesDistributed",
      "discriminator": [
        209,
        24,
        174,
        200,
        236,
        90,
        154,
        55
      ]
    },
    {
      "name": "marketInitialized",
      "discriminator": [
        134,
        160,
        122,
        87,
        50,
        3,
        255,
        81
      ]
    },
    {
      "name": "paramUpdated",
      "discriminator": [
        68,
        86,
        14,
        131,
        209,
        66,
        199,
        122
      ]
    },
    {
      "name": "paramsUpdated",
      "discriminator": [
        2,
        163,
        138,
        99,
        135,
        11,
        136,
        169
      ]
    },
    {
      "name": "pausesUpdated",
      "discriminator": [
        204,
        44,
        226,
        48,
        154,
        15,
        61,
        115
      ]
    },
    {
      "name": "redeemed",
      "discriminator": [
        14,
        29,
        183,
        71,
        31,
        165,
        107,
        38
      ]
    },
    {
      "name": "treasurySnapshot",
      "discriminator": [
        29,
        80,
        144,
        61,
        142,
        177,
        224,
        158
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "invalidParameter",
      "msg": "Invalid parameter value"
    },
    {
      "code": 6001,
      "name": "unauthorized",
      "msg": "Caller is not authorised"
    },
    {
      "code": 6002,
      "name": "unsafeMint",
      "msg": "Mint does not satisfy the BACKSTOP engine safety requirements"
    },
    {
      "code": 6003,
      "name": "mintAuthorityNotRevoked",
      "msg": "Mint authority must be revoked (fixed supply) before the market goes live"
    },
    {
      "code": 6004,
      "name": "freezeAuthorityPresent",
      "msg": "Mint must not have a freeze authority"
    },
    {
      "code": 6005,
      "name": "forbiddenExtension",
      "msg": "Mint uses a forbidden Token-2022 extension"
    },
    {
      "code": 6006,
      "name": "badTransferHook",
      "msg": "Transfer hook must point at the BACKSTOP hook with no hook authority"
    },
    {
      "code": 6007,
      "name": "badDecimals",
      "msg": "Decimals must be 9"
    },
    {
      "code": 6008,
      "name": "accountMismatch",
      "msg": "Account does not match the market configuration"
    },
    {
      "code": 6009,
      "name": "redemptionPaused",
      "msg": "Redemption is paused (timelocked emergency action)"
    },
    {
      "code": 6010,
      "name": "nothingToRedeem",
      "msg": "Nothing to redeem / circulating supply is zero"
    },
    {
      "code": 6011,
      "name": "redemptionSlippage",
      "msg": "Redemption output below the requested minimum"
    },
    {
      "code": 6012,
      "name": "swapSlippage",
      "msg": "Swap output below the oracle-bounded minimum"
    },
    {
      "code": 6013,
      "name": "swapTooLarge",
      "msg": "Swap amount exceeds the per-chunk maximum"
    },
    {
      "code": 6014,
      "name": "badSwapProgram",
      "msg": "Swap program is not the configured one"
    },
    {
      "code": 6015,
      "name": "oracleUnavailable",
      "msg": "Oracle price is stale or invalid"
    },
    {
      "code": 6016,
      "name": "outOfBounds",
      "msg": "Agent update outside governance bounds"
    },
    {
      "code": 6017,
      "name": "notAgentTunable",
      "msg": "Parameter is not agent-tunable"
    },
    {
      "code": 6018,
      "name": "cooldown",
      "msg": "Agent cooldown has not elapsed"
    },
    {
      "code": 6019,
      "name": "timelockNotExpired",
      "msg": "Timelock has not expired"
    },
    {
      "code": 6020,
      "name": "guardianCannotUnpause",
      "msg": "Guardian may only set pause flags"
    },
    {
      "code": 6021,
      "name": "insufficientTreasury",
      "msg": "Treasury balance insufficient"
    },
    {
      "code": 6022,
      "name": "mathOverflow",
      "msg": "Arithmetic error"
    }
  ],
  "types": [
    {
      "name": "actionCancelled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "id",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "actionExecuted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "id",
            "type": "u64"
          },
          {
            "name": "action",
            "type": {
              "defined": {
                "name": "timelockAction"
              }
            }
          }
        ]
      }
    },
    {
      "name": "actionQueued",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "id",
            "type": "u64"
          },
          {
            "name": "action",
            "type": {
              "defined": {
                "name": "timelockAction"
              }
            }
          },
          {
            "name": "eta",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "agentAuthority",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "agent",
            "docs": [
              "Hot key of the AI treasury agent service."
            ],
            "type": "pubkey"
          },
          {
            "name": "cooldownSecs",
            "type": "i64"
          },
          {
            "name": "bounds",
            "docs": [
              "Indexed by `ParamId as usize`."
            ],
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "paramBound"
                  }
                },
                28
              ]
            }
          },
          {
            "name": "updates",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "externalRewardsDeposited",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "from",
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
      "name": "feeSwap",
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
              "0 = treasury USDC→SOL, 1 = parent share → parent rewards, 2 = shield SOL → USDC"
            ],
            "type": "u8"
          },
          {
            "name": "amountIn",
            "type": "u64"
          },
          {
            "name": "amountOut",
            "type": "u64"
          },
          {
            "name": "oracleMinOut",
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
      "name": "feesDistributed",
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
      "name": "initMarketArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "governance",
            "type": "pubkey"
          },
          {
            "name": "guardian",
            "type": "pubkey"
          },
          {
            "name": "keeper",
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
            "name": "params",
            "docs": [
              "`None` → spec defaults."
            ],
            "type": {
              "option": {
                "defined": {
                  "name": "marketParams"
                }
              }
            }
          },
          {
            "name": "parent",
            "docs": [
              "Parent market mint (launchpad children); default for root markets."
            ],
            "type": "pubkey"
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
      "name": "marketInitialized",
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
            "name": "parent",
            "type": "pubkey"
          },
          {
            "name": "governance",
            "type": "pubkey"
          },
          {
            "name": "supply",
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
      "name": "paramBound",
      "docs": [
        "Bounds for one agent-tunable parameter."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "enabled",
            "type": "bool"
          },
          {
            "name": "min",
            "type": "u64"
          },
          {
            "name": "max",
            "type": "u64"
          },
          {
            "name": "lastUpdate",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "paramId",
      "docs": [
        "Identifier of a single governable parameter."
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "tradeFeeBps"
          },
          {
            "name": "splitChestBps"
          },
          {
            "name": "splitShieldBps"
          },
          {
            "name": "parentShareBps"
          },
          {
            "name": "baseDiscountBps"
          },
          {
            "name": "kUpBps"
          },
          {
            "name": "kDownBps"
          },
          {
            "name": "minDiscountBps"
          },
          {
            "name": "maxDiscountBps"
          },
          {
            "name": "offerWindowSecs"
          },
          {
            "name": "bidEpochSecs"
          },
          {
            "name": "minOfferSize"
          },
          {
            "name": "lotsPerOffer"
          },
          {
            "name": "ticketValiditySecs"
          },
          {
            "name": "chestLockSecs"
          },
          {
            "name": "chestPenaltyBps"
          },
          {
            "name": "redemptionFeeBps"
          },
          {
            "name": "yieldBufferBps"
          },
          {
            "name": "shieldPerOfferCap"
          },
          {
            "name": "shieldMaxShareBps"
          },
          {
            "name": "shieldMinLockSecs"
          },
          {
            "name": "shieldMaxMultiplierBps"
          },
          {
            "name": "shieldMaxPremiumBps"
          },
          {
            "name": "priceTwapWindowSecs"
          },
          {
            "name": "momentumLookbackSecs"
          },
          {
            "name": "directSellHourlyCap"
          },
          {
            "name": "maxSwapSlippageBps"
          },
          {
            "name": "maxSwapChunk"
          }
        ]
      }
    },
    {
      "name": "paramUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "param",
            "type": {
              "defined": {
                "name": "paramId"
              }
            }
          },
          {
            "name": "oldValue",
            "type": "u64"
          },
          {
            "name": "newValue",
            "type": "u64"
          },
          {
            "name": "by",
            "type": "pubkey"
          },
          {
            "name": "agent",
            "docs": [
              "true when applied through the agent's bounded authority"
            ],
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "paramsUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
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
            "name": "by",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "pausesUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "pauses",
            "type": "u8"
          },
          {
            "name": "by",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "queuedAction",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "id",
            "type": "u64"
          },
          {
            "name": "action",
            "type": {
              "defined": {
                "name": "timelockAction"
              }
            }
          },
          {
            "name": "eta",
            "type": "i64"
          },
          {
            "name": "queuedAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "redeemed",
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
            "name": "tokens",
            "type": "u64"
          },
          {
            "name": "grossLamports",
            "type": "u64"
          },
          {
            "name": "feeLamports",
            "type": "u64"
          },
          {
            "name": "netLamports",
            "type": "u64"
          },
          {
            "name": "treasuryLamportsAfter",
            "type": "u64"
          },
          {
            "name": "circulatingBefore",
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
      "name": "roles",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "guardian",
            "type": "pubkey"
          },
          {
            "name": "keeper",
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
      "name": "timelockAction",
      "docs": [
        "Actions that require the 48 h on-chain timelock."
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "treasuryWithdraw",
            "fields": [
              {
                "name": "to",
                "type": "pubkey"
              },
              {
                "name": "lamports",
                "type": "u64"
              }
            ]
          },
          {
            "name": "setRedemptionPaused",
            "fields": [
              {
                "name": "paused",
                "type": "bool"
              }
            ]
          }
        ]
      }
    },
    {
      "name": "treasury",
      "docs": [
        "SOL treasury PDA. Treasury SOL = lamports − rent − pending Shield fees."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "market",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "treasurySnapshot",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "treasuryLamports",
            "type": "u64"
          },
          {
            "name": "circulating",
            "type": "u64"
          },
          {
            "name": "floorPrice",
            "docs": [
              "lamports per token base unit × 1e18"
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
