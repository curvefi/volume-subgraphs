#Curve volume subgraphs

### Overview

This repository contains the code and templates needed to deploy a subgraph
tracking the volume of Curve pools on all supported chains.

The subgraph is based on the address provider contract which is located at `0x0000000022d53366457f9d5e68ec105046fc4383` on all chains.
The subgraph listens to the events on the address provider to track all added Stable Registry, Stable Factory, Crypto Registry and Crypto Factory contracts.
The registries and factories are then in turn tracked to track all new deployed or added pools.

The subgraphs are only as comprehensive as the  address indexer and associated registries. If the
address indexer is not up to date, neither will the subgraph. If a non-factory pool is not added to a
registry, or if the registry itself is not added to the address provider, the pool will not be tracked by the
subgraph. Note that if the address of a registry or a factory is updated on the address provider contract the
subgraph will continue to track the old one (the new one will of course be tracked as well).

Currently supported chains:

- `mainnet (ethereum)`
- `avalanche`
- `fantom`
- `matic`
- `arbitrum`
- `xdai`
- `optimism`

Currently unsupported chains with Curve deployments:

- `harmony` (not supported by The Graph)

### Deployment addresses

- Mainnet: https://thegraph.com/hosted-service/subgraph/convex-community/volume-mainnet
- xDAI: https://thegraph.com/hosted-service/subgraph/convex-community/volume-xdai
- Arbitrum: https://thegraph.com/hosted-service/subgraph/convex-community/volume-arbitrum
- Fantom: https://thegraph.com/hosted-service/subgraph/convex-community/volume-fantom
- Avalanche: https://thegraph.com/hosted-service/subgraph/convex-community/volume-avalanche
- Matic: https://thegraph.com/hosted-service/subgraph/convex-community/volume-matic
- Optimism: https://thegraph.com/hosted-service/subgraph/convex-community/volume-optimism

### Installation and deployment

Initial setup:

```
yarn install
yarn prepare
```

To deploy the subgraph for a specific chain:

```
yarn prepare:[chain]
yarn deploy:[chain]
```

After making changes, deploy to a staging address rather than the production subgraph using `stage`:

```
yarn prepare:[chain]
yarn stage:[chain]
```

Where `[chain]` is any of the chains listed above.
For instance, for mainnet:

```
yarn prepare:mainnet
yarn deploy:mainnet
```

**Note**: You may need to update the `package.json` file in `subgraphs/volume` to change the graph's deployment address.

### Known limitations

The subgraphs are dependent on the address provider and registries for information about the pools, so the data will require both to be up to date.

The subgraph currently does not have always a way to detect whether a pool is a lending pool or a metapool. This is due to several factors (lack of information in the events, no specific ABI, inability to intercept calls on several chains) and leads to some potential issues:

- If a non-factory metapool is added to a registry, the data for that pool will often be faulty (unless the pool implements the `base_pool` view method and can be identified as a metapool).
  The solution is to manually add the pool to the `UNKNOWN_METAPOOLS` mapping in the `constants` package (make sure to update the template and not the mustache-generated `index.ts` file). The key added should be the address of the metapool (in lowercase), the value the address of
  its base pool (as an `Address`)
- If a lending pool is added to a registry, the subgraph will not be able to identify it as such (unless it implements the `try_offpeg_fee_multiplier` method) and there will be no data for it. The solution is to manually add the pool's address to the `LENDING_POOLS` array
  in the `constants` package.
- Forex pools will only be automatically priced properly if they are v2 pools AND the token is trading on one of the dexes used for pricing. Otherwise, the subgraph relies on Chainlink oracles to get the value of the foreign currency.
  Mappings from token to oracle contract address are available in the `constants` package with the `FOREX_ORACLES` map. For sidechains, you may also need to update the `FOREX_TOKENS` array so that the token can be identified as a foreign currency one.

### Available data

The following data can be queried from the subgraph

#### Volume

Trading volume in USD and token (in which case aggregated data will only make sense for stableswaps)
for all pools, either hourly, daily or weekly.

Sample query:

```
{
  hourlySwapVolumeSnapshots(
    first: 1000,
    orderBy: timestamp,
    orderDirection: desc,
    where: {
      pool: "0xaa5a67c256e27a5d80712c51971408db3370927d"
      timestamp_gt: 1646045516
    }
  )
  {
    volume
    volumeUSD
    timestamp
    count
  }
}
```

#### Pool Base APR

The pools' LP token virtual price as well as base APR (from fees) can be queried.
The base apr is calculated as `((virtual_price_t - virtual_price_t-1) / virtual_price_t-1)`. 
The APR is not annualized, to do so, calculate `((1 + APR) ** 365 - 1) * 100`

Sample query:

```
{
  dailyPoolSnapshots(first: 1000,
                   orderBy: timestamp,
                   orderDirection: desc,
                   where:
                   {pool: "0xaa5a67c256e27a5d80712c51971408db3370927d"})
  {
    baseApr
    virtualPrice
    timestamp
  }
}
```

#### Candles

OHLC data is available (USD denominated) for all tracked pools.
Hourly, daily and weekly data are available.
The price is always the price of `token1` in `token0`.

Sample query:

```
{
    candles (first: 1000 where: {pool: "0xb576491f1e6e5e62f1d8f26062ee822b40b0e0d4", period: 3600}, orderBy:timestamp orderDirection:desc) {
    period
    open
    close
    high
    low
    txs
    timestamp
  }
}
```

Note that for pools with 3 or more token, you will likely also want to specify the token pair.

For instance with tricrypto, for the ETH/BTC pair:

```
{
    candles (where: {pool: "0xd51a44d3fae010294c616388b506acda1bfaae46", token0: "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599", token1: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", period: 86400}, orderBy:timestamp orderDirection:desc) {
    period
    open
    close
    high
    low
    txs
    timestamp
  }
}
```
