import {
  Pool,
  TokenSnapshot,
  DailyPoolSnapshot,
  PriceFeed,
  SwapVolumeSnapshot,
  DailyPlatformSnapshot,
} from '../../generated/schema'
import { Address, BigDecimal, BigInt, Bytes, ethereum, log } from '@graphprotocol/graph-ts'
import { DAY, getIntervalFromTimestamp, HOUR } from 'utils/time'
import { getForexUsdRate, getUsdRate } from 'utils/pricing'
import {
  BIG_DECIMAL_1E18,
  BIG_DECIMAL_ONE,
  BIG_DECIMAL_ZERO,
  FOREX_ORACLES,
  FOREX_TOKENS,
  USDT_ADDRESS,
  WBTC_ADDRESS,
  WETH_ADDRESS,
  BIG_DECIMAL_TWO,
  BIG_INT_ZERO,
  CTOKENS,
  ADDRESS_ZERO,
  METATOKEN_TO_METAPOOL_MAPPING,
  BENCHMARK_STABLE_ASSETS,
  FEE_PRECISION,
  YC_LENDING_TOKENS,
  USDN_POOL,
  SCAM_POOLS,
  CURVE_ONLY_TOKENS,
  DEPRECATED_POOLS,
} from 'const'
import { BigDecimalToBigInt, bytesToAddress } from 'utils'
import { getPlatform } from './platform'
import { CurvePoolV2 } from '../../generated/templates/RegistryTemplate/CurvePoolV2'
import { exponentToBigDecimal } from 'utils/maths'
import { CurvePoolCoin128 } from '../../generated/templates/RegistryTemplate/CurvePoolCoin128'
import { ERC20 } from '../../generated/AddressProvider/ERC20'
import { getBasePool } from './pools'
import { getDeductibleApr } from './rebase/rebase'
import { CurveLendingPool } from '../../generated/templates/RegistryTemplate/CurveLendingPool'
import { fillV2PoolParamsSnapshot } from './multicall'

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
    // for synths and tokens that only trade on curve we use a mapping
    // get the price of the original asset and multiply that by the pool's price oracle
    if (price == BIG_DECIMAL_ZERO && CURVE_ONLY_TOKENS.has(asset.toHexString())) {
      log.warning('Invalid price found for {}', [asset.toHexString()])
      const oracleInfo = CURVE_ONLY_TOKENS[asset.toHexString()]
      price = getUsdRate(oracleInfo.pricingToken)
      const poolContract = CurvePoolV2.bind(Address.fromString(pool.id))
      const priceOracleResult = poolContract.try_price_oracle()
      let priceOracle = priceOracleResult.reverted
        ? BIG_DECIMAL_ONE
        : priceOracleResult.value.toBigDecimal().div(BIG_DECIMAL_1E18)
      priceOracle =
        oracleInfo.tokenIndex == 1 && priceOracle != BIG_DECIMAL_ZERO ? priceOracle : BIG_DECIMAL_ONE.div(priceOracle)
      price = price.times(priceOracle)
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

function getPreviousDaySnapshot(pool: Pool, timestamp: BigInt): DailyPoolSnapshot | null {
  const yesterday = getIntervalFromTimestamp(timestamp.minus(DAY), DAY)
  return DailyPoolSnapshot.load(pool.id + '-' + yesterday.toString())
}

export function getPoolBaseApr(pool: Pool, currentVirtualPrice: BigDecimal, timestamp: BigInt): BigDecimal {
  const previousSnapshot = getPreviousDaySnapshot(pool, timestamp)
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
  if (SCAM_POOLS.includes(pool.id)) {
    return BIG_DECIMAL_ZERO
  }
  const snapshot = getCryptoTokenSnapshot(token, timestamp, pool)
  return snapshot.price
}

export function getStableSwapTokenPriceFromSnapshot(pool: Pool, token: Address, timestamp: BigInt): BigDecimal {
  if (SCAM_POOLS.includes(pool.id)) {
    return BIG_DECIMAL_ZERO
  }
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

function getPreviousDayTvl(pool: Pool, timestamp: BigInt): BigDecimal {
  const snapId = pool.id + '-' + getIntervalFromTimestamp(timestamp.minus(DAY), DAY).toString()
  const previousDaySnapshot = DailyPoolSnapshot.load(snapId)
  if (!previousDaySnapshot) {
    return BIG_DECIMAL_ZERO
  }
  return previousDaySnapshot.tvl
}

function getReserves(pool: Pool, dailySnapshot: DailyPoolSnapshot, poolContract: CurvePoolV2, timestamp: BigInt): void {
  const reserves = dailySnapshot.reserves
  const normalizedReserves = dailySnapshot.normalizedReserves
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
    const isCToken = CTOKENS.includes(currentCoin.toHexString())
    if (isCToken) {
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
    // handle "normalized" reserves: all balances normalized to 1e18
    // and including exchange rate for c tokens
    normalizedReserves.push(
      isCToken
        ? BigDecimalToBigInt(reserveUsdValue.times(BIG_DECIMAL_1E18))
        : BigDecimalToBigInt(
            balance.toBigDecimal().div(exponentToBigDecimal(pool.coinDecimals[j])).times(BIG_DECIMAL_1E18)
          )
    )
  }
  dailySnapshot.tvl = tvl
  dailySnapshot.reserves = reserves
  dailySnapshot.normalizedReserves = normalizedReserves
  dailySnapshot.reservesUSD = reservesUsd
}

function createNewSnapshot(snapId: string): DailyPoolSnapshot {
  const dailySnapshot = new DailyPoolSnapshot(snapId)
  dailySnapshot.virtualPrice = BIG_DECIMAL_ZERO
  dailySnapshot.lpPriceUSD = BIG_DECIMAL_ZERO
  dailySnapshot.tvl = BIG_DECIMAL_ZERO
  dailySnapshot.fee = BIG_DECIMAL_ZERO
  dailySnapshot.adminFee = BIG_DECIMAL_ZERO
  dailySnapshot.offPegFeeMultiplier = BIG_DECIMAL_ZERO
  dailySnapshot.adminFeesUSD = BIG_DECIMAL_ZERO
  dailySnapshot.lpFeesUSD = BIG_DECIMAL_ZERO
  dailySnapshot.totalDailyFeesUSD = BIG_DECIMAL_ZERO
  dailySnapshot.reserves = new Array<BigInt>()
  dailySnapshot.reservesUSD = new Array<BigDecimal>()
  dailySnapshot.normalizedReserves = new Array<BigInt>()
  dailySnapshot.A = BIG_INT_ZERO
  dailySnapshot.xcpProfit = BIG_DECIMAL_ZERO
  dailySnapshot.xcpProfitA = BIG_DECIMAL_ZERO
  dailySnapshot.baseApr = BIG_DECIMAL_ZERO
  dailySnapshot.rebaseApr = BIG_DECIMAL_ZERO

  dailySnapshot.gamma = BIG_INT_ZERO
  dailySnapshot.timestamp = BIG_INT_ZERO
  dailySnapshot.midFee = BIG_INT_ZERO
  dailySnapshot.outFee = BIG_INT_ZERO
  dailySnapshot.feeGamma = BIG_INT_ZERO
  dailySnapshot.allowedExtraProfit = BIG_INT_ZERO
  dailySnapshot.adjustmentStep = BIG_INT_ZERO
  dailySnapshot.maHalfTime = BIG_INT_ZERO
  dailySnapshot.priceScale = BIG_INT_ZERO
  dailySnapshot.priceOracle = BIG_INT_ZERO
  dailySnapshot.lastPrices = BIG_INT_ZERO
  dailySnapshot.lastPricesTimestamp = BIG_INT_ZERO

  return dailySnapshot
}

export function getOffPegFeeMultiplierResult(pool: Address): ethereum.CallResult<BigInt> {
  const testLending = CurveLendingPool.bind(pool)
  return testLending.try_offpeg_fee_multiplier()
}

export function takePoolSnapshots(timestamp: BigInt): void {
  const platform = getPlatform()
  const time = getIntervalFromTimestamp(timestamp, DAY)
  if (platform.latestPoolSnapshot == time) {
    return
  }

  const protocolSnapshot = new DailyPlatformSnapshot(time.toString())
  protocolSnapshot.adminFeesUSD = BIG_DECIMAL_ZERO
  protocolSnapshot.lpFeesUSD = BIG_DECIMAL_ZERO
  protocolSnapshot.totalDailyFeesUSD = BIG_DECIMAL_ZERO
  protocolSnapshot.timestamp = timestamp

  for (let i = 0; i < platform.poolAddresses.length; ++i) {
    const poolAddress = platform.poolAddresses[i]
    const pool = Pool.load(poolAddress.toHexString())
    if (!pool) {
      return
    }
    const snapId = pool.id + '-' + time.toString()
    if (!DailyPoolSnapshot.load(snapId)) {
      const dailySnapshot = createNewSnapshot(snapId)
      dailySnapshot.pool = pool.id
      dailySnapshot.timestamp = time
      const poolContract = CurvePoolV2.bind(Address.fromString(pool.id))
      const virtualPriceResult = poolContract.try_get_virtual_price()
      let vPrice = BIG_DECIMAL_ZERO
      if (virtualPriceResult.reverted) {
        log.warning('Unable to fetch virtual price for pool {}', [pool.id])
      } else {
        vPrice = virtualPriceResult.value.toBigDecimal()
      }
      dailySnapshot.virtualPrice = vPrice
      // we stop recording snapshots for those
      if (DEPRECATED_POOLS.has(pool.id) && timestamp.gt(DEPRECATED_POOLS[pool.id])) {
        dailySnapshot.save()
        continue
      }

      getReserves(pool, dailySnapshot, poolContract, timestamp)

      // fetch params
      const AResult = poolContract.try_A()
      dailySnapshot.A = AResult.reverted ? BIG_INT_ZERO : AResult.value
      const offPegFeeResult = getOffPegFeeMultiplierResult(bytesToAddress(poolAddress))
      dailySnapshot.offPegFeeMultiplier = offPegFeeResult.reverted
        ? BIG_DECIMAL_ZERO
        : offPegFeeResult.value.toBigDecimal().div(FEE_PRECISION)

      // compute base APR
      let baseApr = BIG_DECIMAL_ZERO
      if (pool.isV2) {
        const xcpProfitResult = poolContract.try_xcp_profit()
        const xcpProfitAResult = poolContract.try_xcp_profit_a()
        dailySnapshot.xcpProfit = xcpProfitResult.reverted ? BIG_DECIMAL_ZERO : xcpProfitResult.value.toBigDecimal()
        dailySnapshot.xcpProfitA = xcpProfitAResult.reverted ? BIG_DECIMAL_ZERO : xcpProfitAResult.value.toBigDecimal()
        baseApr = getV2PoolBaseApr(pool, dailySnapshot.xcpProfit, dailySnapshot.xcpProfitA, timestamp)
        fillV2PoolParamsSnapshot(dailySnapshot, pool)
      } else {
        baseApr = getPoolBaseApr(pool, dailySnapshot.virtualPrice, timestamp)
      }
      // handle rebasing pools
      // TODO: handle decimals to work with depeg (instead of using USD value)
      const deductibleApr = getDeductibleApr(pool, dailySnapshot.reservesUSD, timestamp)
      if (deductibleApr.gt(BIG_DECIMAL_ZERO)) {
        log.info('Deductible APR for pool {}: {} (from base APR {})', [
          pool.id,
          deductibleApr.toString(),
          baseApr.toString(),
        ])
      }
      // Discard spikes in base APR as outliers
      // We replace outlier value with previous day value
      if (baseApr.gt(BigDecimal.fromString('0.0005'))) {
        const prevSnapshot = getPreviousDaySnapshot(pool, timestamp)
        baseApr = prevSnapshot ? prevSnapshot.baseApr : BIG_DECIMAL_ZERO
      }
      dailySnapshot.baseApr = baseApr
      baseApr =
        baseApr.gt(deductibleApr) && deductibleApr.gt(BigDecimal.zero())
          ? baseApr.minus(deductibleApr)
          : BIG_DECIMAL_ZERO
      dailySnapshot.rebaseApr = deductibleApr

      // compute lpUsdPrice from reserves & lp supply
      const supply = getPoolLpTokenTotalSupply(pool)
      dailySnapshot.lpPriceUSD = supply == BIG_DECIMAL_ZERO ? BIG_DECIMAL_ZERO : dailySnapshot.tvl.div(supply)

      const feeResult = poolContract.try_fee()
      const fee = feeResult.reverted ? BIG_DECIMAL_ZERO : feeResult.value.toBigDecimal().div(FEE_PRECISION)
      dailySnapshot.fee = fee

      const adminFeeResult = poolContract.try_admin_fee()
      const adminFee = adminFeeResult.reverted
        ? BIG_DECIMAL_ZERO
        : adminFeeResult.value.toBigDecimal().div(FEE_PRECISION)

      let lpFees = BIG_DECIMAL_ZERO
      let adminFees = BIG_DECIMAL_ZERO
      let totalFees = BIG_DECIMAL_ZERO
      // we use the previous day's tvl because this is what the apr applies to
      const previousDayTvl = getPreviousDayTvl(pool, timestamp)
      // handle edge cases
      // USDN fees are not split by the pool but by the burner with a 50/50 ratio
      if (pool.id == USDN_POOL) {
        totalFees = baseApr.times(previousDayTvl)
        lpFees = totalFees.div(BIG_DECIMAL_TWO)
        adminFees = lpFees
      } else {
        lpFees = baseApr.times(previousDayTvl)
        totalFees = adminFee == BIG_DECIMAL_ONE ? BIG_DECIMAL_ZERO : lpFees.div(BIG_DECIMAL_ONE.minus(adminFee))
        adminFees = totalFees.minus(lpFees)
      }
      dailySnapshot.adminFeesUSD = adminFees
      dailySnapshot.lpFeesUSD = lpFees
      dailySnapshot.totalDailyFeesUSD = totalFees
      pool.cumulativeFeesUSD = pool.cumulativeFeesUSD.plus(dailySnapshot.totalDailyFeesUSD)

      protocolSnapshot.adminFeesUSD = protocolSnapshot.adminFeesUSD.plus(adminFees)
      protocolSnapshot.lpFeesUSD = protocolSnapshot.lpFeesUSD.plus(lpFees)
      protocolSnapshot.totalDailyFeesUSD = protocolSnapshot.totalDailyFeesUSD.plus(totalFees)

      pool.virtualPrice = vPrice
      pool.baseApr = dailySnapshot.baseApr

      pool.save()
      dailySnapshot.save()
    }
  }

  protocolSnapshot.save()
}
