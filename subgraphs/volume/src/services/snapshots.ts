import { Pool, TokenSnapshot, DailyPoolSnapshot } from '../../generated/schema'
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
  FEE_PRECISION,
  CURVE_ONLY_TOKENS,
} from 'const'
import { BigDecimalToBigInt, bytesToAddress } from 'utils'
import { getPlatform } from './platform'
import { CurvePoolV2 } from '../../generated/templates/RegistryTemplate/CurvePoolV2'
import { exponentToBigDecimal } from 'utils/maths'
import { CurvePoolCoin128 } from '../../generated/templates/RegistryTemplate/CurvePoolCoin128'
import { ERC20 } from '../../generated/AddressProvider/ERC20'
import { CurveLendingPool } from '../../generated/templates/RegistryTemplate/CurveLendingPool'

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

export function getPoolLpTokenTotalSupply(pool: Pool): BigDecimal {
  const lpToken = bytesToAddress(pool.lpToken)
  const tokenContract = ERC20.bind(lpToken)
  const supplyResult = tokenContract.try_totalSupply()
  return supplyResult.reverted ? BIG_DECIMAL_ZERO : supplyResult.value.toBigDecimal().div(BIG_DECIMAL_1E18)
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
    // handle "normalized" reserves: all balances normalized to 1e18
    // and including exchange rate for c tokens
    normalizedReserves.push(
      isCToken
        ? BigDecimalToBigInt(
            balance.toBigDecimal().div(exponentToBigDecimal(pool.coinDecimals[j])).times(BIG_DECIMAL_1E18)
          )
        : BigDecimalToBigInt(
            balance.toBigDecimal().div(exponentToBigDecimal(pool.coinDecimals[j])).times(BIG_DECIMAL_1E18)
          )
    )
  }
  dailySnapshot.reserves = reserves
  dailySnapshot.normalizedReserves = normalizedReserves
}

function createNewSnapshot(snapId: string): DailyPoolSnapshot {
  const dailySnapshot = new DailyPoolSnapshot(snapId)
  dailySnapshot.reserves = new Array<BigInt>()
  dailySnapshot.normalizedReserves = new Array<BigInt>()
  dailySnapshot.fee = BIG_DECIMAL_ZERO
  dailySnapshot.adminFee = BIG_DECIMAL_ZERO
  dailySnapshot.offPegFeeMultiplier = BIG_DECIMAL_ZERO
  dailySnapshot.A = BIG_INT_ZERO
  dailySnapshot.xcpProfit = BIG_DECIMAL_ZERO
  dailySnapshot.xcpProfitA = BIG_DECIMAL_ZERO
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
      const poolContract = CurvePoolV2.bind(Address.fromString(pool.id))
      const virtualPriceResult = poolContract.try_get_virtual_price()
      let vPrice = BIG_DECIMAL_ZERO
      if (virtualPriceResult.reverted) {
        log.warning('Unable to fetch virtual price for pool {}', [pool.id])
      } else {
        vPrice = virtualPriceResult.value.toBigDecimal()
      }
      dailySnapshot.virtualPrice = vPrice

      getReserves(pool, dailySnapshot, poolContract, timestamp)

      // fetch params
      const AResult = poolContract.try_A()
      dailySnapshot.A = AResult.reverted ? BIG_INT_ZERO : AResult.value
      const offPegFeeResult = getOffPegFeeMultiplierResult(bytesToAddress(poolAddress))
      dailySnapshot.offPegFeeMultiplier = offPegFeeResult.reverted
        ? BIG_DECIMAL_ZERO
        : offPegFeeResult.value.toBigDecimal().div(FEE_PRECISION)

      // compute lpUsdPrice from reserves & lp supply
      const supply = getPoolLpTokenTotalSupply(pool)
      dailySnapshot.lpTokenSupply = supply

      const feeResult = poolContract.try_fee()
      dailySnapshot.fee = feeResult.reverted ? BIG_DECIMAL_ZERO : feeResult.value.toBigDecimal().div(FEE_PRECISION)

      const adminFeeResult = poolContract.try_admin_fee()
      dailySnapshot.adminFee = adminFeeResult.reverted
        ? BIG_DECIMAL_ZERO
        : adminFeeResult.value.toBigDecimal().div(FEE_PRECISION)

      pool.virtualPrice = vPrice

      pool.save()
      dailySnapshot.save()
    }
  }
}
