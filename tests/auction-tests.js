const {
    deploy,
    getAccount,
    getValueFromBigMap,
    setQuiet,
    expectToThrow,
    exprMichelineToJson,
    setMockupNow,
    getEndpoint,
    isMockup,
    setEndpoint
} = require('@completium/completium-cli');
const { errors, mkTransferPermit, mkTransferGaslessArgs } = require('./utils');
const assert = require('assert');

require('mocha/package.json');
const mochaLogger = require('mocha-logger');

setQuiet('false');

const mockup_mode = true;

// contracts
let fa2;
let auction;

// accounts
const alice  = getAccount(mockup_mode ? 'alice'      : 'alice');
const bob    = getAccount(mockup_mode ? 'bob'        : 'bob');
const carl   = getAccount(mockup_mode ? 'carl'       : 'carl');
const daniel = getAccount(mockup_mode ? 'bootstrap1' : 'bootstrap1');

//set endpointhead
setEndpoint(mockup_mode ? 'mockup' : 'https://hangzhounet.smartpy.io');

const amount = 100;
let tokenId = 0;
const testAmount_1 = 1;
const testAmount_2 = 11;
let alicePermitNb = 0;
let carlPermitNb = 0;

// permits
let permit;

async function expectToThrowMissigned(f, e) {
    const m = 'Failed to throw' + (e !== undefined ? e : '');
    try {
        await f();
        throw new Error(m);
    } catch (ex) {
        if ((ex.message && e !== undefined) || (ex && e !== undefined)) {
            if (ex.message)
                assert(
                    ex.message.includes(e),
                    `${e} was not found in the error message`
                );
            else
                assert(
                    ex.includes(e),
                    `${e} was not found in the error message`
                );
        } else if (ex.message === m) {
            throw e;
        }
    }
}

describe('Contract deployment', async () => {
    it('NFT contract deployment should succeed', async () => {
        [fa2, _] = await deploy(
            './contracts/nft.arl',
            {
                parameters: {
                    owner: alice.pkh,
                },
                as: alice.pkh,
            }
        );
    });

    it('Auction contract deployment should succeed', async () => {
        [auction, _] = await deploy(
            './contracts/auction.arl',
            {
                parameters: {
                    auction_dur: 1,
                    dur_incr: 1
                },
                as: alice.pkh,
            }
        );
    });
});

describe('Test scenario', async () => {
    it('Mint tokens some tokens for Alice', async () => {
        await fa2.mint({
            arg: {
                itokenid: tokenId,
                iowner: alice.pkh,
                iamount: amount,
                itokenMetadata: [{ key: '', value: '0x' }],
                iroyalties: [],
            },
            as: alice.pkh,
        });
        const storage = await fa2.getStorage();
        var balance = await getValueFromBigMap(
            parseInt(storage.ledger),
            exprMichelineToJson(`(Pair ${tokenId} "${alice.pkh}")`),
            exprMichelineToJson(`(pair nat address)'`)
        );
        assert(parseInt(balance.int) == amount);
    });

    it('Alice add Auction contract as operator should succeed', async () => {
        const storage = await fa2.getStorage();
        var initialOperators = await getValueFromBigMap(
            parseInt(storage.operator),
            exprMichelineToJson(
                `(Pair "${auction.address}" (Pair ${tokenId} "${alice.pkh}"))`
            ),
            exprMichelineToJson(`(pair address (pair nat address))'`)
        );
        assert(initialOperators == null);
        await fa2.update_operators({
            argMichelson: `{Left (Pair "${alice.pkh}" "${auction.address}" ${tokenId})}`,
            as: alice.pkh,
        });
        var operatorsAfterAdd = await getValueFromBigMap(
            parseInt(storage.operator),
            exprMichelineToJson(
                `(Pair "${auction.address}" (Pair ${tokenId} "${alice.pkh}"))`
            ),
            exprMichelineToJson(`(pair address (pair nat address))'`)
        );
        assert(operatorsAfterAdd.prim == 'Unit');
    });

    it('Alice list token '+tokenId+' in Auction contract should succeed', async () => {
        const storage = await auction.getStorage();
        var initialSales = await getValueFromBigMap(
            parseInt(storage.sales),
            exprMichelineToJson(
                `(Pair ${tokenId} "${fa2.address}")`
            ),
            exprMichelineToJson(`(pair nat address)'`)
        );
        assert(initialSales == null);

        const fa2_storage = await fa2.getStorage();

        var balance = await getValueFromBigMap(
            parseInt(fa2_storage.ledger),
            exprMichelineToJson(`(Pair ${tokenId} "${alice.pkh}")`),
            exprMichelineToJson(`(pair nat address)'`)
        );
        assert(parseInt(balance.int) == amount);

        var fa2_balance = await getValueFromBigMap(
            parseInt(fa2_storage.ledger),
            exprMichelineToJson(`(Pair ${tokenId} "${fa2.address}")`),
            exprMichelineToJson(`(pair nat address)'`)
        );
        assert(fa2_balance == null);

        await auction.list_nft({
            argMichelson: `(Pair ${tokenId} "${fa2.address}" 1)`,
            as: alice.pkh,
        });
        var endSales = await getValueFromBigMap(
            parseInt(storage.sales),
            exprMichelineToJson(
                `(Pair ${tokenId} "${fa2.address}")`
            ),
            exprMichelineToJson(`(pair nat address)'`)
        );
        assert(endSales.args[0].string == alice.pkh);

        var end_balance = await getValueFromBigMap(
            parseInt(fa2_storage.ledger),
            exprMichelineToJson(`(Pair ${tokenId} "${alice.pkh}")`),
            exprMichelineToJson(`(pair nat address)'`)
        );
        assert(parseInt(end_balance.int) == amount - 1);

        var end_fa2_balance = await getValueFromBigMap(
            parseInt(fa2_storage.ledger),
            exprMichelineToJson(`(Pair ${tokenId} "${auction.address}")`),
            exprMichelineToJson(`(pair nat address)'`)
        );

        assert(parseInt(end_fa2_balance.int) == 1);


    });


    it('Bob bids on token '+tokenId+' in Auction contract should succeed', async () => {
        const storage = await auction.getStorage();
        var initialSales = await getValueFromBigMap(
            parseInt(storage.sales),
            exprMichelineToJson(
                `(Pair ${tokenId} "${fa2.address}")`
            ),
            exprMichelineToJson(`(pair nat address)'`)
        );
        assert(initialSales.args[0].string == alice.pkh);

        const fa2_storage = await fa2.getStorage();

        var alice_balance = await getValueFromBigMap(
            parseInt(fa2_storage.ledger),
            exprMichelineToJson(`(Pair ${tokenId} "${alice.pkh}")`),
            exprMichelineToJson(`(pair nat address)'`)
        );
        assert(parseInt(alice_balance.int) == amount - 1);

        var auction_balance = await getValueFromBigMap(
            parseInt(fa2_storage.ledger),
            exprMichelineToJson(`(Pair ${tokenId} "${auction.address}")`),
            exprMichelineToJson(`(pair nat address)'`)
        );
        assert(parseInt(auction_balance.int) == 1);

        await auction.bid({
            argMichelson: `(Pair ${tokenId} "${fa2.address}")`,
            amount: "10tz",
            as: bob.pkh,
        });
        var endSales = await getValueFromBigMap(
            parseInt(storage.sales),
            exprMichelineToJson(
                `(Pair ${tokenId} "${fa2.address}")`
            ),
            exprMichelineToJson(`(pair nat address)'`)
        );
        assert(
                endSales.args[0].string == alice.pkh &&
                endSales.args[1].prim == "Some" &&
                endSales.args[1].args[0].string == bob.pkh &&
                endSales.args[2].int == "10000000"
            );
    });

    it('Bob claims token '+tokenId+' in Auction contract should succeed', async () => {
        const now = new Date();
        if (isMockup()) setMockupNow(now);
        const storage = await auction.getStorage();
        var initialSales = await getValueFromBigMap(
            parseInt(storage.sales),
            exprMichelineToJson(
                `(Pair ${tokenId} "${fa2.address}")`
            ),
            exprMichelineToJson(`(pair nat address)'`)
        );
        assert(initialSales.args[0].string == alice.pkh);

        const fa2_storage = await fa2.getStorage();

        var alice_balance = await getValueFromBigMap(
            parseInt(fa2_storage.ledger),
            exprMichelineToJson(`(Pair ${tokenId} "${alice.pkh}")`),
            exprMichelineToJson(`(pair nat address)'`)
        );
        assert(parseInt(alice_balance.int) == amount - 1);

        var auction_balance = await getValueFromBigMap(
            parseInt(fa2_storage.ledger),
            exprMichelineToJson(`(Pair ${tokenId} "${auction.address}")`),
            exprMichelineToJson(`(pair nat address)'`)
        );
        assert(parseInt(auction_balance.int) == 1);

        if (isMockup()) setMockupNow(new Date(Date.now() + 100000000));

        await auction.claim({
            argMichelson: `(Pair ${tokenId} "${fa2.address}")`,
            as: bob.pkh,
        });
        var endSales = await getValueFromBigMap(
            parseInt(storage.sales),
            exprMichelineToJson(
                `(Pair ${tokenId} "${fa2.address}")`
            ),
            exprMichelineToJson(`(pair nat address)'`)
        );
        assert(endSales == null);

        var bob_balance = await getValueFromBigMap(
            parseInt(fa2_storage.ledger),
            exprMichelineToJson(`(Pair ${tokenId} "${bob.pkh}")`),
            exprMichelineToJson(`(pair nat address)'`)
        );
        assert(parseInt(bob_balance.int) == 1);

        var auction_balance = await getValueFromBigMap(
            parseInt(fa2_storage.ledger),
            exprMichelineToJson(`(Pair ${tokenId} "${auction.address}")`),
            exprMichelineToJson(`(pair nat address)'`)
        );
        assert(auction_balance == null);
    });
});