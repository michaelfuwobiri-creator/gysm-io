# GSM Credit contracts (Phase 0, testnet only)

`GSMCredit.sol` is the "GYSM Credit" (GSM) ERC-20 behind a UUPS proxy.

- 18 decimals. Whole supply minted once to a treasury address at `initialize`.
- No mint, pause, blacklist or fee in v1. Holders can burn their own balance.
- `UPGRADER_ROLE` can authorise a new implementation. **That key can change the rules**, including adding a mint. Use a multisig plus timelock before any mainnet use, and disclose it.
- `GSMCreditV2Mock.sol` exists only for tests.

## Run the tests

```
npm install
npx hardhat test
```

## Deploy to Base Sepolia (you run this, with your own testnet key)

1. `cp .env.example .env` and fill in `PRIVATE_KEY` (a throwaway testnet key), plus `ADMIN_ADDRESS` and `TREASURY_ADDRESS` if they should differ from the deployer.
2. `npx hardhat run scripts/deploy.js --network baseSepolia`
3. The script refuses to run on any other network.

Never commit `.env`. Do not put a mainnet key here. Mainnet needs an audit, counsel sign-off, and a multisig first.

## Not done yet

- No audit. No mainnet. Not verified on BaseScan.
- The older GYSM testnet token (name GYSM/GYSM, with a lending pool) is a separate deployment and is not upgraded by this; GSM is a new deployment.
