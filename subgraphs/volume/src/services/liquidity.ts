import {
  DailyLiquidityVolumeSnapshot,
  HourlyLiquidityVolumeSnapshot,
  LiquidityEvent,
  Pool,
  WeeklyLiquidityVolumeSnapshot,
} from '../../generated/schema'
import { Address, BigDecimal, Bytes } from '@graphprotocol/graph-ts'
import { BigInt } from '@graphprotocol/graph-ts/index'
import { getCryptoTokenSnapshot, getTokenSnapshot, getTokenSnapshotByAssetType, takePoolSnapshots } from './snapshots'
import { BIG_DECIMAL_ZERO, BIG_INT_ONE, BIG_INT_ZERO, CTOKENS } from '../../../../packages/constants'
import { DAY, getIntervalFromTimestamp, HOUR, WEEK } from '../../../../packages/utils/time'
import { exponentToBigDecimal } from '../../../../packages/utils/maths'
import { bytesToAddress } from '../../../../packages/utils'

export function getHourlyLiquiditySnapshot(pool: Pool, timestamp: BigInt): HourlyLiquidityVolumeSnapshot {
  const hour = getIntervalFromTimestamp(timestamp, HOUR)
  const snapshotId = pool.id + '-' + hour.toString()
  let snapshot = HourlyLiquidityVolumeSnapshot.load(snapshotId)
  if (!snapshot) {
    snapshot = new HourlyLiquidityVolumeSnapshot(snapshotId)
    const coinArray = new Array<BigDecimal>()
    for (let i = 0; i < pool.coins.length; i++) {
      coinArray.push(BIG_DECIMAL_ZERO)
    }
    snapshot.pool = pool.id
    snapshot.timestamp = hour
    snapshot.amountAdded = coinArray
    snapshot.amountRemoved = coinArray
    snapshot.addCount = BIG_INT_ZERO
    snapshot.removeCount = BIG_INT_ZERO
    snapshot.volumeUSD = BIG_DECIMAL_ZERO
    snapshot.save()
  }
  return snapshot
}

export function getDailyLiquiditySnapshot(pool: Pool, timestamp: BigInt): DailyLiquidityVolumeSnapshot {
  const day = getIntervalFromTimestamp(timestamp, DAY)
  const snapshotId = pool.id + '-' + day.toString()
  let snapshot = DailyLiquidityVolumeSnapshot.load(snapshotId)
  if (!snapshot) {
    snapshot = new DailyLiquidityVolumeSnapshot(snapshotId)
    const coinArray = new Array<BigDecimal>()
    for (let i = 0; i < pool.coins.length; i++) {
      coinArray.push(BIG_DECIMAL_ZERO)
    }
    snapshot.pool = pool.id
    snapshot.timestamp = day
    snapshot.amountAdded = coinArray
    snapshot.amountRemoved = coinArray
    snapshot.addCount = BIG_INT_ZERO
    snapshot.removeCount = BIG_INT_ZERO
    snapshot.volumeUSD = BIG_DECIMAL_ZERO
    snapshot.save()
  }
  return snapshot
}

export function getWeeklyLiquiditySnapshot(pool: Pool, timestamp: BigInt): WeeklyLiquidityVolumeSnapshot {
  const week = getIntervalFromTimestamp(timestamp, WEEK)
  const snapshotId = pool.id + '-' + week.toString()
  let snapshot = WeeklyLiquidityVolumeSnapshot.load(snapshotId)
  if (!snapshot) {
    snapshot = new WeeklyLiquidityVolumeSnapshot(snapshotId)
    const coinArray = new Array<BigDecimal>()
    for (let i = 0; i < pool.coins.length; i++) {
      coinArray.push(BIG_DECIMAL_ZERO)
    }
    snapshot.pool = pool.id
    snapshot.timestamp = week
    snapshot.amountAdded = coinArray
    snapshot.amountRemoved = coinArray
    snapshot.addCount = BIG_INT_ZERO
    snapshot.removeCount = BIG_INT_ZERO
    snapshot.volumeUSD = BIG_DECIMAL_ZERO
    snapshot.save()
  }
  return snapshot
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
  const hourlySnapshot = getHourlyLiquiditySnapshot(pool, timestamp)
  const dailySnapshot = getDailyLiquiditySnapshot(pool, timestamp)
  const weeklySnapshot = getWeeklyLiquiditySnapshot(pool, timestamp)
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
      const latestSnapshot = pool.isV2
        ? getCryptoTokenSnapshot(bytesToAddress(pool.coins[i]), timestamp, pool)
        : CTOKENS.includes(pool.coins[i].toHexString())
        ? getTokenSnapshot(bytesToAddress(pool.coins[i]), timestamp, false)
        : getTokenSnapshotByAssetType(pool, timestamp)
      const latestPrice = latestSnapshot.price
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
  const hourlySnapshot = getHourlyLiquiditySnapshot(pool, timestamp)
  const dailySnapshot = getDailyLiquiditySnapshot(pool, timestamp)
  const weeklySnapshot = getWeeklyLiquiditySnapshot(pool, timestamp)
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
      const latestSnapshot = pool.isV2
        ? getCryptoTokenSnapshot(bytesToAddress(pool.coins[i]), timestamp, pool)
        : CTOKENS.includes(pool.coins[i].toHexString())
        ? getTokenSnapshot(bytesToAddress(pool.coins[i]), timestamp, false)
        : getTokenSnapshotByAssetType(pool, timestamp)
      const latestPrice = latestSnapshot.price
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
