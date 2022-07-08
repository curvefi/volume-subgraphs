import {
  Pool,
  TokenSnapshot,
  DailyPoolSnapshot,
  PriceFeed,
  SwapVolumeSnapshot,
  LiquidityVolumeSnapshot,
} from '../../generated/schema'
import { Address, BigDecimal, BigInt, Bytes, log } from '@graphprotocol/graph-ts'
import { DAY, getIntervalFromTimestamp, HOUR } from '../../../../packages/utils/time'
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
  METATOKEN_TO_METAPOOL_MAPPING,
  BENCHMARK_STABLE_ASSETS,
  FEE_PRECISION,
  YC_LENDING_TOKENS,
} from '../../../../packages/constants'
import { bytesToAddress } from '../../../../packages/utils'
import { getPlatform } from './platform'
import { ChainlinkAggregator } from '../../generated/templates/CurvePoolTemplateV2/ChainlinkAggregator'
import { CurvePoolV2 } from '../../generated/templates/RegistryTemplate/CurvePoolV2'
import { exponentToBigDecimal } from '../../../../packages/utils/maths'
import { CurvePoolCoin128 } from '../../generated/templates/RegistryTemplate/CurvePoolCoin128'
import { ERC20 } from '../../generated/AddressProvider/ERC20'
import { getBasePool } from './pools'
import { getDeductibleApr } from './rebase/rebase'

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

export function getSwapSnapshot(pool: Pool, timestamp: BigInt, period: BigInt): SwapVolumeSnapshot {
  const interval = getIntervalFromTimestamp(timestamp, period)
  const snapshotId = pool.id + '-' + period.toString() + '-' + interval.toString()
  let snapshot = SwapVolumeSnapshot.load(snapshotId)
  if (!snapshot) {
    snapshot = new SwapVolumeSnapshot(snapshotId)
    snapshot.pool = pool.id
    snapshot.period = period
    snapshot.timestamp = interval
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

export function getLiquiditySnapshot(pool: Pool, timestamp: BigInt, period: BigInt): LiquidityVolumeSnapshot {
  const interval = getIntervalFromTimestamp(timestamp, period)
  const snapshotId = pool.id + '-' + period.toString() + '-' + interval.toString()
  let snapshot = LiquidityVolumeSnapshot.load(snapshotId)
  if (!snapshot) {
    snapshot = new LiquidityVolumeSnapshot(snapshotId)
    const coinArray = new Array<BigDecimal>()
    for (let i = 0; i < pool.coins.length; i++) {
      coinArray.push(BIG_DECIMAL_ZERO)
    }
    snapshot.pool = pool.id
    snapshot.period = period
    snapshot.timestamp = interval
    snapshot.amountAdded = coinArray
    snapshot.amountRemoved = coinArray
    snapshot.addCount = BIG_INT_ZERO
    snapshot.removeCount = BIG_INT_ZERO
    snapshot.volumeUSD = BIG_DECIMAL_ZERO
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
  if (!previousSnapshot) {
    return BIG_DECIMAL_ZERO
  }
  const previousSnapshotXcpProfit = previousSnapshot.xcpProfit
  // avoid creating an artificial apr jump if pool was just created
  if (previousSnapshotXcpProfit == BIG_DECIMAL_ZERO) {
    return BIG_DECIMAL_ZERO
  }
  const previousSnapshotXcpProfitA = previousSnapshot.xcpProfitA
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

export function getCryptoSwapTokenPriceFromSnapshot(pool: Pool, token: Address, timestamp: BigInt): BigDecimal {
  const snapshot = getCryptoTokenSnapshot(token, timestamp, pool)
  return snapshot.price
}

export function getStableSwapTokenPriceFromSnapshot(pool: Pool, token: Address, timestamp: BigInt): BigDecimal {
  const isLendingToken = YC_LENDING_TOKENS.includes(token.toHexString())
  const snapshot = isLendingToken
    ? getTokenSnapshot(bytesToAddress(token), timestamp, false)
    : getTokenSnapshotByAssetType(pool, timestamp)
  let price = snapshot.price
  if (isLendingToken) {
    return price
  }
  // multiply by virtual price for metatokens
  if (METATOKEN_TO_METAPOOL_MAPPING.has(token.toHexString())) {
    const metapool = Pool.load(METATOKEN_TO_METAPOOL_MAPPING[token.toHexString()].toHexString())
    if (metapool) {
      price = price.times(metapool.virtualPrice).div(BIG_DECIMAL_1E18)
    }
    return price
  }
  // return if it's an asset we assume won't seriously depeg
  if (BENCHMARK_STABLE_ASSETS.includes(token.toHexString())) {
    return price
  }
  // now account for depegs by querying price feed entities
  // we're using USDT as standard now, consider USDC/DAI
  // we only consider the token price vs ONE other asset in the pool
  // which may not account for multiple depegs in case of 3+ asset plain pools
  let relativePrice = estimateDepegFromPair(pool.coins, token, pool.id)
  if (relativePrice) {
    return price.times(relativePrice)
  }
  // if no price feed we query underlying coins
  if (pool.metapool) {
    const basePool = getBasePool(bytesToAddress(pool.basePool))
    relativePrice = estimateDepegFromPair(basePool.coins, token, pool.id)
    if (relativePrice) {
      return price.times(relativePrice)
    }
  }
  return price
}

function estimateDepegFromPair(coins: Array<Bytes>, token: Address, poolId: string): BigDecimal | null {
  for (let i = 0; i < coins.length; i++) {
    const currentCoin = coins[i].toHexString()
    const tokenString = token.toHexString()
    if (currentCoin != tokenString) {
      const pricefeed = PriceFeed.load(poolId + '-' + tokenString + '-' + currentCoin)
      if (pricefeed) {
        return pricefeed.price
      }
    }
  }
  return null
}

function getPoolLpTokenTotalSupply(pool: Pool): BigDecimal {
  const lpToken = bytesToAddress(pool.lpToken)
  const tokenContract = ERC20.bind(lpToken)
  const supplyResult = tokenContract.try_totalSupply()
  return supplyResult.reverted ? BIG_DECIMAL_ZERO : supplyResult.value.toBigDecimal().div(BIG_DECIMAL_1E18)
}

function getLatestDailyVolumeValue(pool: Pool, timestamp: BigInt): BigDecimal {
  const snapshot = getSwapSnapshot(pool, timestamp.minus(DAY), DAY)
  return snapshot ? snapshot.volumeUSD : BIG_DECIMAL_ZERO
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
      dailySnapshot.reservesUSD = new Array<BigDecimal>()
      dailySnapshot.fee = BIG_DECIMAL_ZERO
      dailySnapshot.adminFee = BIG_DECIMAL_ZERO
      dailySnapshot.adminFeesUSD = BIG_DECIMAL_ZERO
      dailySnapshot.lpFeesUSD = BIG_DECIMAL_ZERO
      dailySnapshot.eventFeesUSD = BIG_DECIMAL_ZERO
      dailySnapshot.lpPriceUSD = BIG_DECIMAL_ZERO
      dailySnapshot.totalDailyFeesUSD = BIG_DECIMAL_ZERO
      dailySnapshot.tvl = BIG_DECIMAL_ZERO
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

      const reserves = dailySnapshot.reserves
      const reservesUsd = dailySnapshot.reservesUSD
      let tvl = BIG_DECIMAL_ZERO
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
        const price = pool.isV2
          ? getCryptoSwapTokenPriceFromSnapshot(pool, currentCoin, timestamp)
          : getStableSwapTokenPriceFromSnapshot(pool, currentCoin, timestamp)
        const reserveUsdValue = balance.toBigDecimal().div(exponentToBigDecimal(pool.coinDecimals[j])).times(price)
        reservesUsd.push(reserveUsdValue)
        tvl = tvl.plus(reserveUsdValue)
      }
      dailySnapshot.tvl = tvl
      dailySnapshot.reserves = reserves
      dailySnapshot.reservesUSD = reservesUsd
      let baseApr = BIG_DECIMAL_ZERO
      if (pool.isV2) {
        const xcpProfitResult = poolContract.try_xcp_profit()
        const xcpProfitAResult = poolContract.try_xcp_profit_a()
        dailySnapshot.xcpProfit = xcpProfitResult.reverted ? BIG_DECIMAL_ZERO : xcpProfitResult.value.toBigDecimal()
        dailySnapshot.xcpProfitA = xcpProfitAResult.reverted ? BIG_DECIMAL_ZERO : xcpProfitAResult.value.toBigDecimal()
        baseApr = getV2PoolBaseApr(pool, dailySnapshot.xcpProfit, dailySnapshot.xcpProfitA, timestamp)
      } else {
        baseApr = getPoolBaseApr(pool, dailySnapshot.virtualPrice, timestamp)
      }
      dailySnapshot.baseApr = baseApr
      // handle rebasing pools
      const deductibleApr = getDeductibleApr(pool, reservesUsd, timestamp)
      if (deductibleApr.gt(BIG_DECIMAL_ZERO)) {
        log.info('Deductible APR for pool {}: {} (from base APR {})', [
          pool.id,
          deductibleApr.toString(),
          baseApr.toString(),
        ])
      }
      baseApr = baseApr.gt(deductibleApr) ? baseApr.minus(deductibleApr) : BIG_DECIMAL_ZERO

      dailySnapshot.timestamp = time

      // compute lpUsdPrice from reserves & lp supply
      const supply = getPoolLpTokenTotalSupply(pool)
      dailySnapshot.lpPriceUSD = supply == BIG_DECIMAL_ZERO ? BIG_DECIMAL_ZERO : tvl.div(supply)
      if (!pool.isV2) {
        const feeResult = poolContract.try_fee()
        const fee = feeResult.reverted ? BIG_DECIMAL_ZERO : feeResult.value.toBigDecimal().div(FEE_PRECISION)
        dailySnapshot.fee = fee
      }
      const adminFeeResult = poolContract.try_admin_fee()
      const adminFee = adminFeeResult.reverted
        ? BIG_DECIMAL_ZERO
        : adminFeeResult.value.toBigDecimal().div(FEE_PRECISION)

      const totalFees = baseApr.times(tvl)
      dailySnapshot.adminFeesUSD = totalFees.times(adminFee)
      dailySnapshot.lpFeesUSD = totalFees.minus(dailySnapshot.adminFeesUSD)
      dailySnapshot.totalDailyFeesUSD = pool.isV2 ? totalFees.times(BIG_DECIMAL_TWO) : totalFees
      pool.cumulativeFeesUSD = pool.cumulativeFeesUSD.plus(dailySnapshot.totalDailyFeesUSD)

      pool.virtualPrice = vPrice
      pool.baseApr = dailySnapshot.baseApr

      pool.save()
      dailySnapshot.save()
    }
  }
}
