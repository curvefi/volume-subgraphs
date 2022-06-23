import { DailyPoolSnapshot, LiquidityEvent, Pool } from '../../generated/schema'
import { Address, Bytes } from '@graphprotocol/graph-ts'
import { BigInt } from '@graphprotocol/graph-ts/index'
import {
  getCryptoSwapTokenPriceFromSnapshot,
  getLiquiditySnapshot,
  getStableSwapTokenPriceFromSnapshot,
  takePoolSnapshots,
} from './snapshots'
import { BIG_DECIMAL_ZERO, BIG_INT_ONE, BIG_INT_ZERO } from '../../../../packages/constants'
import { DAY, getIntervalFromTimestamp, HOUR, WEEK } from '../../../../packages/utils/time'
import { exponentToBigDecimal } from '../../../../packages/utils/maths'
import { bytesToAddress } from '../../../../packages/utils'

export function processFeesFromAddLiquidity(pool: Pool, fees: Array<BigInt>, timestamp: BigInt): void {
  let totalFeesUsd = BIG_DECIMAL_ZERO
  const time = getIntervalFromTimestamp(timestamp, DAY)
  for (let i = 0; i < pool.coins.length; i++) {
    const latestPrice = pool.isV2
      ? getCryptoSwapTokenPriceFromSnapshot(pool, bytesToAddress(pool.coins[i]), timestamp)
      : getStableSwapTokenPriceFromSnapshot(pool, bytesToAddress(pool.coins[i]), timestamp)
    totalFeesUsd = totalFeesUsd.plus(
      fees[i].toBigDecimal().div(exponentToBigDecimal(pool.coinDecimals[i])).times(latestPrice)
    )
  }
  const snapId = pool.id + '-' + time.toString()
  const snapshot = DailyPoolSnapshot.load(snapId)
  if (snapshot) {
    const adminFees = totalFeesUsd.times(snapshot.adminFee)
    snapshot.adminFeesUSD = snapshot.adminFeesUSD.plus(adminFees)
    snapshot.lpFeesUSD = snapshot.lpFeesUSD.plus(totalFeesUsd.minus(adminFees))
    snapshot.totalDailyFeesUSD = snapshot.totalDailyFeesUSD.plus(totalFeesUsd)
    snapshot.save()
  }
  pool.cumulativeFeesUSD = pool.cumulativeFeesUSD.plus(totalFeesUsd)
  pool.save()
}

export function processLiquidityRemoval(
  pool: Pool,
  provider: Address,
  tokenAmounts: Array<BigInt>,
  timestamp: BigInt,
  block: BigInt,
  hash: Bytes
): void {
  takePoolSnapshots(timestamp)

  // initialise snapshot entities:
  // need 3 different variables due to how array updates are handled by the graph
  const hourlySnapshot = getLiquiditySnapshot(pool, timestamp, HOUR)
  const dailySnapshot = getLiquiditySnapshot(pool, timestamp, DAY)
  const weeklySnapshot = getLiquiditySnapshot(pool, timestamp, WEEK)
  const liquidityEvent = new LiquidityEvent(hash.toHexString())

  // get volume of liquidity event:
  let coinAmountRemoved = BIG_DECIMAL_ZERO
  let volumeUSD = BIG_DECIMAL_ZERO
  const hourlyAmountRemoved = hourlySnapshot.amountRemoved
  const dailyAmountRemoved = dailySnapshot.amountRemoved
  const weeklyAmountRemoved = weeklySnapshot.amountRemoved
  for (let i = 0; i < pool.coins.length; i++) {
    coinAmountRemoved = tokenAmounts[i].toBigDecimal().div(exponentToBigDecimal(pool.coinDecimals[i]))
    hourlyAmountRemoved[i] = hourlyAmountRemoved[i].plus(coinAmountRemoved)
    dailyAmountRemoved[i] = dailyAmountRemoved[i].plus(coinAmountRemoved)
    weeklyAmountRemoved[i] = weeklyAmountRemoved[i].plus(coinAmountRemoved)
    if (tokenAmounts[i].gt(BIG_INT_ZERO)) {
      const latestPrice = pool.isV2
        ? getCryptoSwapTokenPriceFromSnapshot(pool, bytesToAddress(pool.coins[i]), timestamp)
        : getStableSwapTokenPriceFromSnapshot(pool, bytesToAddress(pool.coins[i]), timestamp)
      volumeUSD = volumeUSD.plus(coinAmountRemoved.times(latestPrice))
    }
  }

  // update entities:
  hourlySnapshot.amountRemoved = hourlyAmountRemoved
  dailySnapshot.amountRemoved = dailyAmountRemoved
  weeklySnapshot.amountRemoved = weeklyAmountRemoved

  hourlySnapshot.removeCount = hourlySnapshot.removeCount.plus(BIG_INT_ONE)
  dailySnapshot.removeCount = dailySnapshot.removeCount.plus(BIG_INT_ONE)
  weeklySnapshot.removeCount = weeklySnapshot.removeCount.plus(BIG_INT_ONE)

  hourlySnapshot.volumeUSD = hourlySnapshot.volumeUSD.plus(volumeUSD)
  dailySnapshot.volumeUSD = dailySnapshot.volumeUSD.plus(volumeUSD)
  weeklySnapshot.volumeUSD = weeklySnapshot.volumeUSD.plus(volumeUSD)

  liquidityEvent.liquidityProvider = provider
  liquidityEvent.timestamp = timestamp
  liquidityEvent.block = block
  liquidityEvent.pool = pool.id
  liquidityEvent.tokenAmounts = tokenAmounts
  liquidityEvent.volumeUSD = volumeUSD
  liquidityEvent.removal = true

  hourlySnapshot.save()
  dailySnapshot.save()
  weeklySnapshot.save()
  liquidityEvent.save()
}

export function processAddLiquidity(
  pool: Pool,
  provider: Address,
  tokenAmounts: Array<BigInt>,
  timestamp: BigInt,
  block: BigInt,
  hash: Bytes
): void {
  takePoolSnapshots(timestamp)

  // initialise snapshot entities:
  const hourlySnapshot = getLiquiditySnapshot(pool, timestamp, HOUR)
  const dailySnapshot = getLiquiditySnapshot(pool, timestamp, DAY)
  const weeklySnapshot = getLiquiditySnapshot(pool, timestamp, WEEK)
  const liquidityEvent = new LiquidityEvent(hash.toHexString())

  // get volume of liquidity event:
  let coinAmountAdded = BIG_DECIMAL_ZERO
  let volumeUSD = BIG_DECIMAL_ZERO
  const hourlyAmountAdded = hourlySnapshot.amountAdded
  const dailyAmountAdded = dailySnapshot.amountAdded
  const weeklyAmountAdded = weeklySnapshot.amountAdded
  for (let i = 0; i < pool.coins.length; i++) {
    coinAmountAdded = tokenAmounts[i].toBigDecimal().div(exponentToBigDecimal(pool.coinDecimals[i]))
    hourlyAmountAdded[i] = hourlyAmountAdded[i].plus(coinAmountAdded)
    dailyAmountAdded[i] = dailyAmountAdded[i].plus(coinAmountAdded)
    weeklyAmountAdded[i] = weeklyAmountAdded[i].plus(coinAmountAdded)
    if (tokenAmounts[i].gt(BIG_INT_ZERO)) {
      const latestPrice = pool.isV2
        ? getCryptoSwapTokenPriceFromSnapshot(pool, bytesToAddress(pool.coins[i]), timestamp)
        : getStableSwapTokenPriceFromSnapshot(pool, bytesToAddress(pool.coins[i]), timestamp)
      volumeUSD = volumeUSD.plus(coinAmountAdded.times(latestPrice))
    }
  }
  hourlySnapshot.amountAdded = hourlyAmountAdded
  dailySnapshot.amountAdded = dailyAmountAdded
  weeklySnapshot.amountAdded = weeklyAmountAdded

  // update entities:
  hourlySnapshot.addCount = hourlySnapshot.addCount.plus(BIG_INT_ONE)
  dailySnapshot.addCount = dailySnapshot.addCount.plus(BIG_INT_ONE)
  weeklySnapshot.addCount = weeklySnapshot.addCount.plus(BIG_INT_ONE)

  hourlySnapshot.volumeUSD = hourlySnapshot.volumeUSD.plus(volumeUSD)
  dailySnapshot.volumeUSD = dailySnapshot.volumeUSD.plus(volumeUSD)
  weeklySnapshot.volumeUSD = weeklySnapshot.volumeUSD.plus(volumeUSD)

  liquidityEvent.liquidityProvider = provider
  liquidityEvent.timestamp = timestamp
  liquidityEvent.block = block
  liquidityEvent.pool = pool.id
  liquidityEvent.tokenAmounts = tokenAmounts
  liquidityEvent.volumeUSD = volumeUSD
  liquidityEvent.removal = false

  hourlySnapshot.save()
  dailySnapshot.save()
  weeklySnapshot.save()
  liquidityEvent.save()
}
