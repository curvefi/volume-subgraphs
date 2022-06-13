import {
  Pool,
  TokenSnapshot,
  DailySwapVolumeSnapshot,
  HourlySwapVolumeSnapshot,
  WeeklySwapVolumeSnapshot,
  DailyPoolSnapshot,
} from '../../generated/schema'
import { Address, BigDecimal, BigInt, log } from '@graphprotocol/graph-ts'
import { DAY, getIntervalFromTimestamp, HOUR, WEEK } from '../../../../packages/utils/time'
import { getUsdRate } from '../../../../packages/utils/pricing'
import {
  BIG_DECIMAL_1E18,
  BIG_DECIMAL_1E8,
  BIG_DECIMAL_ONE,
  BIG_DECIMAL_ZERO,
  FOREX_ORACLES,
  FOREX_TOKENS,
  USDT_ADDRESS,
  WBTC_ADDRESS,
  SYNTH_TOKENS,
  WETH_ADDRESS,
  BIG_DECIMAL_TWO,
  BIG_INT_ZERO,
  CTOKENS,
  ADDRESS_ZERO,
} from '../../../../packages/constants'
import { bytesToAddress } from '../../../../packages/utils'
import { getPlatform } from './platform'
import { ChainlinkAggregator } from '../../generated/templates/CurvePoolTemplateV2/ChainlinkAggregator'
import { CurvePoolV2 } from '../../generated/templates/RegistryTemplate/CurvePoolV2'
import { exponentToBigDecimal } from '../../../../packages/utils/maths'
import { CurvePoolCoin128 } from '../../generated/templates/RegistryTemplate/CurvePoolCoin128'
import { ERC20 } from '../../generated/AddressProvider/ERC20'

export function getForexUsdRate(token: string): BigDecimal {
  // returns the amount of USD 1 unit of the foreign currency is worth
  const priceOracle = ChainlinkAggregator.bind(FOREX_ORACLES[token])
  const conversionRateReponse = priceOracle.try_latestAnswer()
  const conversionRate = conversionRateReponse.reverted
    ? BIG_DECIMAL_ONE
    : conversionRateReponse.value.toBigDecimal().div(BIG_DECIMAL_1E8)
  log.debug('Answer from Forex oracle {} for token {}: {}', [
    FOREX_ORACLES[token].toHexString(),
    token,
    conversionRate.toString(),
  ])
  return conversionRate
}

export function getTokenSnapshot(token: Address, timestamp: BigInt, forex: boolean): TokenSnapshot {
  const hour = getIntervalFromTimestamp(timestamp, HOUR)
  const snapshotId = token.toHexString() + '-' + hour.toString()
  let snapshot = TokenSnapshot.load(snapshotId)
  if (!snapshot) {
    snapshot = new TokenSnapshot(snapshotId)
    if (forex) {
      snapshot.price = getForexUsdRate(token.toHexString())
    } else {
      snapshot.price = getUsdRate(token)
    }
    snapshot.token = token
    snapshot.timestamp = timestamp
    snapshot.save()
  }
  return snapshot
}

export function getStableCryptoTokenSnapshot(pool: Pool, timestamp: BigInt): TokenSnapshot {
  // we use this for stable crypto pools where one assets may not be traded
  // outside of curve. we just try to get a price out of one of the assets traded
  // and use that
  const hour = getIntervalFromTimestamp(timestamp, HOUR)
  const snapshotId = pool.id + '-' + hour.toString()
  let snapshot = TokenSnapshot.load(snapshotId)
  if (!snapshot) {
    snapshot = new TokenSnapshot(snapshotId)
    let price = BIG_DECIMAL_ZERO
    let token = ADDRESS_ZERO
    for (let i = 0; i < pool.coins.length; ++i) {
      price = getUsdRate(bytesToAddress(pool.coins[i]))
      if (price != BIG_DECIMAL_ZERO) {
        token = Address.fromBytes(pool.coins[i])
        break
      }
    }
    snapshot.token = token
    snapshot.timestamp = hour
    snapshot.price = price
    snapshot.save()
  }
  return snapshot
}

export function getCryptoTokenSnapshot(asset: Address, timestamp: BigInt, pool: Pool): TokenSnapshot {
  const hour = getIntervalFromTimestamp(timestamp, HOUR)
  const snapshotId = asset.toHexString() + '-' + hour.toString()
  let snapshot = TokenSnapshot.load(snapshotId)
  if (!snapshot) {
    snapshot = new TokenSnapshot(snapshotId)
    snapshot.timestamp = hour
    let price = FOREX_TOKENS.includes(asset.toHexString()) ? getForexUsdRate(asset.toHexString()) : getUsdRate(asset)
    if (price == BIG_DECIMAL_ZERO && SYNTH_TOKENS.has(asset.toHexString())) {
      log.warning('Invalid price found for {}', [asset.toHexString()])
      price = getUsdRate(SYNTH_TOKENS[asset.toHexString()])
      const poolContract = CurvePoolV2.bind(Address.fromString(pool.id))
      const priceOracleResult = poolContract.try_price_oracle()
      if (!priceOracleResult.reverted) {
        price = price.times(priceOracleResult.value.toBigDecimal().div(BIG_DECIMAL_1E18))
      } else {
        log.warning('Price oracle reverted {}', [asset.toHexString()])
      }
    }
    snapshot.token = asset
    snapshot.price = price
    snapshot.save()
  }
  return snapshot
}

export function getTokenSnapshotByAssetType(pool: Pool, timestamp: BigInt): TokenSnapshot {
  if (FOREX_ORACLES.has(pool.id)) {
    return getTokenSnapshot(bytesToAddress(pool.address), timestamp, true)
  } else if (pool.assetType == 1) {
    return getTokenSnapshot(WETH_ADDRESS, timestamp, false)
  } else if (pool.assetType == 2) {
    return getTokenSnapshot(WBTC_ADDRESS, timestamp, false)
  } else if (pool.assetType == 0) {
    return getTokenSnapshot(USDT_ADDRESS, timestamp, false)
  } else {
    return getStableCryptoTokenSnapshot(pool, timestamp)
  }
}

export function getHourlySwapSnapshot(pool: Pool, timestamp: BigInt): HourlySwapVolumeSnapshot {
  const hour = getIntervalFromTimestamp(timestamp, HOUR)
  const snapshotId = pool.id + '-' + hour.toString()
  let snapshot = HourlySwapVolumeSnapshot.load(snapshotId)
  if (!snapshot) {
    snapshot = new HourlySwapVolumeSnapshot(snapshotId)
    snapshot.pool = pool.id
    snapshot.timestamp = hour
    snapshot.amountSold = BIG_DECIMAL_ZERO
    snapshot.amountBought = BIG_DECIMAL_ZERO
    snapshot.amountSoldUSD = BIG_DECIMAL_ZERO
    snapshot.amountBoughtUSD = BIG_DECIMAL_ZERO
    snapshot.volume = BIG_DECIMAL_ZERO
    snapshot.volumeUSD = BIG_DECIMAL_ZERO
    snapshot.count = BIG_INT_ZERO
    snapshot.save()
  }
  return snapshot
}

export function getDailySwapSnapshot(pool: Pool, timestamp: BigInt): DailySwapVolumeSnapshot {
  const day = getIntervalFromTimestamp(timestamp, DAY)
  const snapshotId = pool.id + '-' + day.toString()
  let snapshot = DailySwapVolumeSnapshot.load(snapshotId)
  if (!snapshot) {
    snapshot = new DailySwapVolumeSnapshot(snapshotId)
    snapshot.pool = pool.id
    snapshot.timestamp = day
    snapshot.amountSold = BIG_DECIMAL_ZERO
    snapshot.amountBought = BIG_DECIMAL_ZERO
    snapshot.amountSoldUSD = BIG_DECIMAL_ZERO
    snapshot.amountBoughtUSD = BIG_DECIMAL_ZERO
    snapshot.volume = BIG_DECIMAL_ZERO
    snapshot.volumeUSD = BIG_DECIMAL_ZERO
    snapshot.count = BIG_INT_ZERO
    snapshot.save()
  }
  return snapshot
}

export function getWeeklySwapSnapshot(pool: Pool, timestamp: BigInt): WeeklySwapVolumeSnapshot {
  const week = getIntervalFromTimestamp(timestamp, WEEK)
  const snapshotId = pool.id + '-' + week.toString()
  let snapshot = WeeklySwapVolumeSnapshot.load(snapshotId)
  if (!snapshot) {
    snapshot = new WeeklySwapVolumeSnapshot(snapshotId)
    snapshot.pool = pool.id
    snapshot.timestamp = week
    snapshot.amountSold = BIG_DECIMAL_ZERO
    snapshot.amountBought = BIG_DECIMAL_ZERO
    snapshot.amountSoldUSD = BIG_DECIMAL_ZERO
    snapshot.amountBoughtUSD = BIG_DECIMAL_ZERO
    snapshot.volume = BIG_DECIMAL_ZERO
    snapshot.volumeUSD = BIG_DECIMAL_ZERO
    snapshot.count = BIG_INT_ZERO
    snapshot.save()
  }
  return snapshot
}

export function getPoolBaseApr(pool: Pool, currentVirtualPrice: BigDecimal, timestamp: BigInt): BigDecimal {
  const yesterday = getIntervalFromTimestamp(timestamp.minus(DAY), DAY)
  const previousSnapshot = DailyPoolSnapshot.load(pool.id + '-' + yesterday.toString())
  const previousSnapshotVPrice = previousSnapshot ? previousSnapshot.virtualPrice : BIG_DECIMAL_ZERO
  const rate =
    previousSnapshotVPrice == BIG_DECIMAL_ZERO
      ? BIG_DECIMAL_ZERO
      : currentVirtualPrice.minus(previousSnapshotVPrice).div(previousSnapshotVPrice)
  return rate
}

export function getV2PoolBaseApr(
  pool: Pool,
  currentXcpProfit: BigDecimal,
  currentXcpProfitA: BigDecimal,
  timestamp: BigInt
): BigDecimal {
  const yesterday = getIntervalFromTimestamp(timestamp.minus(DAY), DAY)
  const previousSnapshot = DailyPoolSnapshot.load(pool.id + '-' + yesterday.toString())
  const previousSnapshotXcpProfit = previousSnapshot ? previousSnapshot.xcpProfit : BIG_DECIMAL_ZERO
  const previousSnapshotXcpProfitA = previousSnapshot ? previousSnapshot.xcpProfitA : BIG_DECIMAL_ZERO
  const currentProfit = currentXcpProfit
    .div(BIG_DECIMAL_TWO)
    .plus(currentXcpProfitA.div(BIG_DECIMAL_TWO))
    .plus(BIG_DECIMAL_1E18)
    .div(BIG_DECIMAL_TWO)
  const previousProfit = previousSnapshotXcpProfit
    .div(BIG_DECIMAL_TWO)
    .plus(previousSnapshotXcpProfitA.div(BIG_DECIMAL_TWO))
    .plus(BIG_DECIMAL_1E18)
    .div(BIG_DECIMAL_TWO)
  const rate =
    previousProfit == BIG_DECIMAL_ZERO ? BIG_DECIMAL_ZERO : currentProfit.minus(previousProfit).div(previousProfit)
  return rate
}

export function takePoolSnapshots(timestamp: BigInt): void {
  const platform = getPlatform()
  const time = getIntervalFromTimestamp(timestamp, DAY)
  if (platform.latestPoolSnapshot == time) {
    return
  }
  for (let i = 0; i < platform.poolAddresses.length; ++i) {
    const poolAddress = platform.poolAddresses[i]
    const pool = Pool.load(poolAddress.toHexString())
    if (!pool) {
      return
    }
    const snapId = pool.id + '-' + time.toString()
    if (!DailyPoolSnapshot.load(snapId)) {
      const dailySnapshot = new DailyPoolSnapshot(snapId)
      dailySnapshot.reserves = new Array<BigInt>()
      dailySnapshot.reservesUsd = new Array<BigDecimal>()
      dailySnapshot.xcpProfit = BIG_DECIMAL_ZERO
      dailySnapshot.xcpProfitA = BIG_DECIMAL_ZERO
      dailySnapshot.pool = pool.id
      const poolContract = CurvePoolV2.bind(Address.fromString(pool.id))
      const virtualPriceResult = poolContract.try_get_virtual_price()
      let vPrice = BIG_DECIMAL_ZERO
      if (virtualPriceResult.reverted) {
        log.warning('Unable to fetch virtual price for pool {}', [pool.id])
      } else {
        vPrice = virtualPriceResult.value.toBigDecimal()
      }
      dailySnapshot.virtualPrice = vPrice
      if (pool.isV2) {
        const xcpProfitResult = poolContract.try_xcp_profit()
        const xcpProfitAResult = poolContract.try_xcp_profit_a()
        dailySnapshot.xcpProfit = xcpProfitResult.reverted ? BIG_DECIMAL_ZERO : xcpProfitResult.value.toBigDecimal()
        dailySnapshot.xcpProfitA = xcpProfitAResult.reverted ? BIG_DECIMAL_ZERO : xcpProfitAResult.value.toBigDecimal()
        dailySnapshot.baseApr = getV2PoolBaseApr(pool, dailySnapshot.xcpProfit, dailySnapshot.xcpProfitA, timestamp)
      } else {
        dailySnapshot.baseApr = getPoolBaseApr(pool, dailySnapshot.virtualPrice, timestamp)
      }
      dailySnapshot.timestamp = time

      const reserves = dailySnapshot.reserves
      const reservesUsd = dailySnapshot.reservesUsd
      for (let j = 0; j < pool.coins.length; j++) {
        let balance = BIG_INT_ZERO
        let balanceResult = poolContract.try_balances(BigInt.fromI32(j))
        if (balanceResult.reverted) {
          log.warning('Unable to fetch balances for {}, trying with int128 ABI', [pool.id])
          const poolContract128 = CurvePoolCoin128.bind(Address.fromString(pool.id))
          balanceResult = poolContract128.try_balances(BigInt.fromI32(j))
          if (!balanceResult.reverted) {
            balance = balanceResult.value
          }
        } else {
          balance = balanceResult.value
        }
        reserves.push(balance)
        const currentCoin = bytesToAddress(pool.coins[j])
        // need to handle the fact that balances doesn't actually return token balance
        // for cTokens
        if (CTOKENS.includes(currentCoin.toHexString())) {
          const tokenContract = ERC20.bind(currentCoin)
          const balanceResult = tokenContract.try_balanceOf(Address.fromString(pool.id))
          balance = balanceResult.reverted ? balance : balanceResult.value
        }
        const priceSnapshot = pool.isV2
          ? getCryptoTokenSnapshot(currentCoin, timestamp, pool)
          : CTOKENS.includes(currentCoin.toHexString())
          ? getTokenSnapshot(currentCoin, timestamp, false)
          : getTokenSnapshotByAssetType(pool, timestamp)
        const price = priceSnapshot.price
        reservesUsd.push(balance.toBigDecimal().div(exponentToBigDecimal(pool.coinDecimals[j])).times(price))
      }
      dailySnapshot.reserves = reserves
      dailySnapshot.reservesUsd = reservesUsd

      pool.virtualPrice = vPrice
      pool.baseApr = dailySnapshot.baseApr

      pool.save()
      dailySnapshot.save()
    }
  }
}
