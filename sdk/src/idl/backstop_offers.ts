/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/backstop_offers.json`.
 */
export type BackstopOffers = {
  "address": "DW1bgui9AwKGmBxRryjGn6CtKYfo2aXuyeHXLxzewGj",
  "metadata": {
    "name": "backstopOffers",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "BACKSTOP offer book: escrowed sell offers, randomised pro-rata settlement, Shield priority, AMM remainder routing and Return Tickets."
  },
  "instructions": [
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
          "name": "buyer",
          "writable": true,
          "signer": true
        },
        {
          "name": "ticket",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  105,
                  99,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "ticket.mint",
                "account": "ticket"
              },
              {
                "kind": "account",
                "path": "buyer"
              },
              {
                "kind": "account",
                "path": "ticket.offerId",
                "account": "ticket"
              }
            ]
          }
        },
        {
          "name": "book",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  111,
                  107
                ]
              },
              {
                "kind": "account",
                "path": "ticket.mint",
                "account": "ticket"
              }
            ]
          }
        },
        {
          "name": "market"
        },
        {
          "name": "pool",
          "writable": true
        },
        {
          "name": "mint"
        },
        {
          "name": "quoteMint"
        },
        {
          "name": "baseVault",
          "writable": true
        },
        {
          "name": "quoteVault",
          "writable": true
        },
        {
          "name": "feeVault",
          "writable": true
        },
        {
          "name": "buyerQuote",
          "writable": true
        },
        {
          "name": "buyerBase",
          "writable": true
        },
        {
          "name": "ammProgram",
          "address": "8m9GWYsGaqmGECJnN6kipQXiaJfk8t2MhS8U5LugUw8b"
        },
        {
          "name": "baseTokenProgram"
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
      ]
    },
    {
      "name": "claim",
      "discriminator": [
        62,
        198,
        214,
        193,
        213,
        159,
        108,
        210
      ],
      "accounts": [
        {
          "name": "claimer",
          "signer": true
        },
        {
          "name": "refundAuthority",
          "docs": [
            "Required for chest-funded bids: the chest-market PDA (so the chest",
            "program can credit the refund to the bidder's chest atomically)."
          ],
          "signer": true,
          "optional": true
        },
        {
          "name": "book",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  111,
                  107
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
          "name": "offer",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  102,
                  102,
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
                "path": "offer.id",
                "account": "offer"
              }
            ]
          },
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
            "book",
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
          "name": "refundTo",
          "writable": true
        },
        {
          "name": "escrowVault",
          "writable": true,
          "relations": [
            "book"
          ]
        },
        {
          "name": "bidVault",
          "writable": true,
          "relations": [
            "offer"
          ]
        },
        {
          "name": "hookConfig"
        },
        {
          "name": "bidderHolder",
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
                "path": "bid.bidder",
                "account": "bid"
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
          "name": "baseTokenProgram",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "quoteTokenProgram"
        }
      ],
      "args": [],
      "returns": "u64"
    },
    {
      "name": "closeBidding",
      "discriminator": [
        219,
        203,
        190,
        31,
        25,
        53,
        75,
        228
      ],
      "accounts": [
        {
          "name": "offer",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "offer.mint",
                "account": "offer"
              },
              {
                "kind": "account",
                "path": "offer.id",
                "account": "offer"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "closeOffer",
      "discriminator": [
        191,
        72,
        67,
        35,
        239,
        209,
        97,
        132
      ],
      "accounts": [
        {
          "name": "seller",
          "writable": true
        },
        {
          "name": "book",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  111,
                  107
                ]
              },
              {
                "kind": "account",
                "path": "offer.mint",
                "account": "offer"
              }
            ]
          }
        },
        {
          "name": "offer",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "offer.mint",
                "account": "offer"
              },
              {
                "kind": "account",
                "path": "offer.id",
                "account": "offer"
              }
            ]
          }
        },
        {
          "name": "bidVault",
          "writable": true,
          "relations": [
            "offer"
          ]
        },
        {
          "name": "quoteTokenProgram"
        }
      ],
      "args": []
    },
    {
      "name": "closeTicket",
      "discriminator": [
        66,
        209,
        114,
        197,
        75,
        27,
        182,
        117
      ],
      "accounts": [
        {
          "name": "seller",
          "writable": true
        },
        {
          "name": "ticket",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  105,
                  99,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "ticket.mint",
                "account": "ticket"
              },
              {
                "kind": "account",
                "path": "ticket.seller",
                "account": "ticket"
              },
              {
                "kind": "account",
                "path": "ticket.offerId",
                "account": "ticket"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "createOffer",
      "discriminator": [
        237,
        233,
        192,
        168,
        248,
        7,
        249,
        241
      ],
      "accounts": [
        {
          "name": "seller",
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
          "name": "book",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  111,
                  107
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
          "name": "mint",
          "relations": [
            "market",
            "book"
          ]
        },
        {
          "name": "quoteMint"
        },
        {
          "name": "offer",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  102,
                  102,
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
                "path": "book.nextOfferId",
                "account": "offerBook"
              }
            ]
          }
        },
        {
          "name": "bidVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "offer"
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
          "name": "sellerToken",
          "writable": true
        },
        {
          "name": "sellerQuote"
        },
        {
          "name": "escrowVault",
          "writable": true,
          "relations": [
            "book"
          ]
        },
        {
          "name": "sellerHolder",
          "docs": [
            "Seller's holder (tenure carried by the offer + self-fill ring)."
          ],
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
                "path": "seller"
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
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "message",
          "type": "bytes"
        }
      ]
    },
    {
      "name": "initBook",
      "discriminator": [
        96,
        122,
        49,
        43,
        63,
        61,
        118,
        152
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
          "name": "book",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  111,
                  107
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
          "name": "escrowVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "book"
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
          "name": "baseTokenProgram",
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
      "name": "placeBid",
      "discriminator": [
        238,
        77,
        148,
        91,
        200,
        151,
        92,
        146
      ],
      "accounts": [
        {
          "name": "rentPayer",
          "writable": true,
          "signer": true
        },
        {
          "name": "funder",
          "docs": [
            "The bidder (wallet bids) or the chest-market PDA (chest/auto bids)."
          ],
          "signer": true
        },
        {
          "name": "bidder"
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
          "name": "offer",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  102,
                  102,
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
                "path": "offer.id",
                "account": "offer"
              }
            ]
          }
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
          "name": "funderQuote",
          "writable": true
        },
        {
          "name": "refundTo"
        },
        {
          "name": "bidVault",
          "writable": true,
          "relations": [
            "offer"
          ]
        },
        {
          "name": "sellerHolder",
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
                "path": "offer.seller",
                "account": "offer"
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
          "name": "kind",
          "type": "u8"
        }
      ]
    },
    {
      "name": "sellRemainder",
      "discriminator": [
        46,
        250,
        110,
        70,
        221,
        110,
        62,
        185
      ],
      "accounts": [
        {
          "name": "cranker",
          "signer": true
        },
        {
          "name": "seller"
        },
        {
          "name": "market"
        },
        {
          "name": "book",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  111,
                  107
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
          "name": "offer",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  102,
                  102,
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
                "path": "offer.id",
                "account": "offer"
              }
            ]
          }
        },
        {
          "name": "pool",
          "writable": true
        },
        {
          "name": "mint",
          "relations": [
            "book",
            "offer"
          ]
        },
        {
          "name": "quoteMint"
        },
        {
          "name": "baseVault",
          "writable": true
        },
        {
          "name": "quoteVault",
          "writable": true
        },
        {
          "name": "feeVault",
          "writable": true
        },
        {
          "name": "escrowVault",
          "writable": true,
          "relations": [
            "book"
          ]
        },
        {
          "name": "sellerQuote",
          "writable": true,
          "relations": [
            "offer"
          ]
        },
        {
          "name": "ammProgram",
          "address": "8m9GWYsGaqmGECJnN6kipQXiaJfk8t2MhS8U5LugUw8b"
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
      "name": "settle",
      "discriminator": [
        175,
        42,
        185,
        87,
        144,
        131,
        102,
        212
      ],
      "accounts": [
        {
          "name": "shieldAuthority",
          "docs": [
            "Shield PDA of the chest program: settlement is always routed through",
            "the chest program so the Shield's priority slice is booked atomically",
            "(D-025)."
          ],
          "signer": true
        },
        {
          "name": "payer",
          "docs": [
            "Pays rent for the Return Ticket (keeper / cranker)."
          ],
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
          "name": "book",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  111,
                  107
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
          "name": "offer",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  102,
                  102,
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
                "path": "offer.id",
                "account": "offer"
              }
            ]
          }
        },
        {
          "name": "mint",
          "relations": [
            "market",
            "book",
            "offer"
          ]
        },
        {
          "name": "quoteMint"
        },
        {
          "name": "escrowVault",
          "writable": true,
          "relations": [
            "book"
          ]
        },
        {
          "name": "bidVault",
          "writable": true,
          "relations": [
            "offer"
          ]
        },
        {
          "name": "sellerQuote",
          "writable": true,
          "relations": [
            "offer"
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
          "name": "shieldQuoteVault",
          "writable": true
        },
        {
          "name": "shieldTokenVault",
          "writable": true
        },
        {
          "name": "ticket",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  105,
                  99,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              },
              {
                "kind": "account",
                "path": "offer.seller",
                "account": "offer"
              },
              {
                "kind": "account",
                "path": "offer.id",
                "account": "offer"
              }
            ]
          }
        },
        {
          "name": "slotHashes",
          "address": "SysvarS1otHashes111111111111111111111111111"
        },
        {
          "name": "baseTokenProgram",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
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
          "name": "shieldLots",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "bid",
      "discriminator": [
        143,
        246,
        48,
        245,
        42,
        145,
        180,
        88
      ]
    },
    {
      "name": "offer",
      "discriminator": [
        215,
        88,
        60,
        71,
        170,
        162,
        73,
        229
      ]
    },
    {
      "name": "offerBook",
      "discriminator": [
        80,
        6,
        238,
        248,
        107,
        81,
        195,
        99
      ]
    },
    {
      "name": "ticket",
      "discriminator": [
        41,
        228,
        24,
        165,
        78,
        90,
        235,
        200
      ]
    }
  ],
  "events": [
    {
      "name": "bidClaimed",
      "discriminator": [
        187,
        133,
        70,
        99,
        108,
        104,
        243,
        174
      ]
    },
    {
      "name": "bidPlaced",
      "discriminator": [
        135,
        53,
        176,
        83,
        193,
        69,
        108,
        61
      ]
    },
    {
      "name": "biddingClosed",
      "discriminator": [
        31,
        40,
        34,
        146,
        5,
        143,
        254,
        187
      ]
    },
    {
      "name": "offerClosed",
      "discriminator": [
        237,
        38,
        102,
        204,
        165,
        180,
        177,
        164
      ]
    },
    {
      "name": "offerCreated",
      "discriminator": [
        31,
        236,
        215,
        144,
        75,
        45,
        157,
        87
      ]
    },
    {
      "name": "offerSettled",
      "discriminator": [
        28,
        72,
        212,
        133,
        229,
        156,
        62,
        254
      ]
    },
    {
      "name": "remainderSold",
      "discriminator": [
        74,
        138,
        22,
        92,
        3,
        52,
        236,
        67
      ]
    },
    {
      "name": "ticketIssued",
      "discriminator": [
        176,
        133,
        7,
        76,
        129,
        230,
        198,
        8
      ]
    },
    {
      "name": "ticketUsed",
      "discriminator": [
        40,
        141,
        252,
        141,
        160,
        110,
        147,
        80
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
      "name": "offersPaused",
      "msg": "New offers are paused (emergency)"
    },
    {
      "code": 6002,
      "name": "belowMinimumOffer",
      "msg": "Offer is below the minimum offer size; sell directly on the AMM"
    },
    {
      "code": 6003,
      "name": "holderRequired",
      "msg": "Seller must have a registered holder account"
    },
    {
      "code": 6004,
      "name": "messageTooLong",
      "msg": "Offer message exceeds 140 bytes"
    },
    {
      "code": 6005,
      "name": "notOpen",
      "msg": "Offer is not open for bids"
    },
    {
      "code": 6006,
      "name": "windowEnded",
      "msg": "Bidding window has ended"
    },
    {
      "code": 6007,
      "name": "selfBid",
      "msg": "Sellers cannot bid on their own offers"
    },
    {
      "code": 6008,
      "name": "linkedWallet",
      "msg": "Bidder funded the seller within the self-fill window"
    },
    {
      "code": 6009,
      "name": "bidTooSmall",
      "msg": "Bid is smaller than one lot"
    },
    {
      "code": 6010,
      "name": "cannotCloseYet",
      "msg": "Bidding cannot be closed yet"
    },
    {
      "code": 6011,
      "name": "notClosing",
      "msg": "Offer is not ready to settle"
    },
    {
      "code": 6012,
      "name": "randomnessPending",
      "msg": "Randomness slot not reached yet"
    },
    {
      "code": 6013,
      "name": "randomnessUnavailable",
      "msg": "Randomness unavailable for the committed slot (re-arm with close_bidding)"
    },
    {
      "code": 6014,
      "name": "shieldSliceTooLarge",
      "msg": "Shield slice exceeds the maximum share"
    },
    {
      "code": 6015,
      "name": "notSettled",
      "msg": "Offer is not settled"
    },
    {
      "code": 6016,
      "name": "noRemainder",
      "msg": "Remainder already sold or nothing to sell"
    },
    {
      "code": 6017,
      "name": "offerNotFinished",
      "msg": "Offer still has unclaimed bids or unsold remainder"
    },
    {
      "code": 6018,
      "name": "accountMismatch",
      "msg": "Account does not match the offer"
    },
    {
      "code": 6019,
      "name": "ticketUnavailable",
      "msg": "Return Ticket expired or exhausted"
    },
    {
      "code": 6020,
      "name": "mathOverflow",
      "msg": "Arithmetic error"
    }
  ],
  "types": [
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
      "name": "bidClaimed",
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
            "name": "bid",
            "type": "pubkey"
          },
          {
            "name": "bidder",
            "type": "pubkey"
          },
          {
            "name": "kind",
            "type": "u8"
          },
          {
            "name": "lots",
            "type": "u64"
          },
          {
            "name": "tokens",
            "type": "u64"
          },
          {
            "name": "cost",
            "type": "u64"
          },
          {
            "name": "refund",
            "type": "u64"
          },
          {
            "name": "tenureCreditedRaw",
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
      "name": "bidPlaced",
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
            "name": "bid",
            "type": "pubkey"
          },
          {
            "name": "bidder",
            "type": "pubkey"
          },
          {
            "name": "kind",
            "type": "u8"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "capacity",
            "type": "u64"
          },
          {
            "name": "prefix",
            "type": "u64"
          },
          {
            "name": "totalCapacity",
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
      "name": "biddingClosed",
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
            "name": "randSlot",
            "type": "u64"
          },
          {
            "name": "early",
            "type": "bool"
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
                "name": "backstopHookStatePodU128"
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
                "name": "backstopHookStatePodU128"
              }
            }
          },
          {
            "name": "rSnap",
            "type": {
              "defined": {
                "name": "backstopHookStatePodU128"
              }
            }
          },
          {
            "name": "rtSnap",
            "type": {
              "defined": {
                "name": "backstopHookStatePodU128"
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
      "name": "offerBook",
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
            "name": "quoteMint",
            "type": "pubkey"
          },
          {
            "name": "escrowVault",
            "docs": [
              "ATA(book, mint): escrow for every offer of this market (D-013)."
            ],
            "type": "pubkey"
          },
          {
            "name": "nextOfferId",
            "type": "u64"
          },
          {
            "name": "openOffers",
            "type": "u64"
          },
          {
            "name": "totalEscrowed",
            "docs": [
              "Σ offer.escrowed — always equals the escrow vault balance."
            ],
            "type": "u64"
          },
          {
            "name": "offersCreated",
            "type": "u64"
          },
          {
            "name": "tokensOffered",
            "type": "u64"
          },
          {
            "name": "tokensAbsorbed",
            "type": "u64"
          },
          {
            "name": "tokensToShield",
            "type": "u64"
          },
          {
            "name": "tokensToAmm",
            "type": "u64"
          },
          {
            "name": "quoteToSellers",
            "type": "u64"
          },
          {
            "name": "feesPaid",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "offerClosed",
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
            "name": "id",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "offerCreated",
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
            "name": "id",
            "type": "u64"
          },
          {
            "name": "seller",
            "type": "pubkey"
          },
          {
            "name": "amount",
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
            "name": "twap",
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
            "name": "sellerLotTenure",
            "type": "u128"
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
            "name": "message",
            "type": "string"
          }
        ]
      }
    },
    {
      "name": "offerSettled",
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
            "name": "seller",
            "type": "pubkey"
          },
          {
            "name": "shieldLots",
            "type": "u64"
          },
          {
            "name": "bidderLots",
            "type": "u64"
          },
          {
            "name": "totalCapacity",
            "type": "u64"
          },
          {
            "name": "randomOffset",
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
            "name": "proceeds",
            "type": "u64"
          },
          {
            "name": "fee",
            "type": "u64"
          },
          {
            "name": "sellerNet",
            "type": "u64"
          },
          {
            "name": "remainderTokens",
            "type": "u64"
          },
          {
            "name": "ticketAmount",
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
                "name": "backstopAmmStatePodU128"
              }
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
                "name": "backstopAmmStatePodU128"
              }
            }
          },
          {
            "name": "oracleLastPrice",
            "type": {
              "defined": {
                "name": "backstopAmmStatePodU128"
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
      "name": "remainderSold",
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
            "name": "tokens",
            "type": "u64"
          },
          {
            "name": "quoteOut",
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
      "name": "ticket",
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
            "name": "seller",
            "type": "pubkey"
          },
          {
            "name": "offerId",
            "type": "u64"
          },
          {
            "name": "amount",
            "docs": [
              "Tokens that may be re-bought fee-free."
            ],
            "type": "u64"
          },
          {
            "name": "used",
            "type": "u64"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "expiresAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "ticketIssued",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "seller",
            "type": "pubkey"
          },
          {
            "name": "offerId",
            "type": "u64"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "expiresAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "ticketUsed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "seller",
            "type": "pubkey"
          },
          {
            "name": "offerId",
            "type": "u64"
          },
          {
            "name": "tokens",
            "type": "u64"
          },
          {
            "name": "remaining",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "backstopAmmStatePodU128",
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
      "name": "backstopHookStatePodU128",
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
    }
  ]
};
