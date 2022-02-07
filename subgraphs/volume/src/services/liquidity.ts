import { Pool, LiquidityEvent } from '../../generated/schema'
import {
  getTokenSnapshotByAssetType,
  getDailyLiquiditySnapshot,
  getHourlyLiquiditySnapshot,
  getWeeklyLiquiditySnapshot,
  takePoolSnapshots,
} from './snapshots'
import { BIG_DECIMAL_ZERO, BIG_INT_ONE } from '../../../../packages/constants'
import { exponentToBigDecimal } from '../../../../packages/utils/maths'
import {
  AddLiquidity,
  CurvePool,
  Remove_liquidity_one_coinCall,
  RemoveLiquidity,
  RemoveLiquidityImbalance,
} from '../../generated/templates/CurvePoolTemplate/CurvePool'
import { BigInt } from '@graphprotocol/graph-ts'

export function processAddLiquidity(event: AddLiquidity): void {
  const pool = Pool.load(event.address.toHexString())
  if (!pool) {
    return
  }
  takePoolSnapshots(event.block.timestamp)
  const timestamp = event.block.timestamp
  const block = event.block.number
  const provider = event.params.provider
  const tokenAmount = event.params.token_amounts
  const removal = false

  // initialise snapshot entities:
  const hourlySnapshot = getHourlyLiquiditySnapshot(pool, timestamp)
  const dailySnapshot = getDailyLiquiditySnapshot(pool, timestamp)
  const weeklySnapshot = getWeeklyLiquiditySnapshot(pool, timestamp)
  const liquidityEvent = new LiquidityEvent(event.transaction.hash.toHexString())

  // get volume of liquidity event:
  const latestSnapshot = getTokenSnapshotByAssetType(pool, timestamp)
  const latestPrice = latestSnapshot.price
  let coinAmountAdded = BIG_DECIMAL_ZERO
  let volumeUSD = BIG_DECIMAL_ZERO
  const hourlyAmountAdded = hourlySnapshot.amountAdded
  const dailyAmountAdded = dailySnapshot.amountAdded
  const weeklyAmountAdded = weeklySnapshot.amountAdded
  for (let i = 0; i < pool.coins.length; i++) {
    coinAmountAdded = tokenAmount[i].toBigDecimal().div(exponentToBigDecimal(pool.coinDecimals[i]))
    hourlyAmountAdded[i] = hourlyAmountAdded[i].plus(coinAmountAdded)
    dailyAmountAdded[i] = dailyAmountAdded[i].plus(coinAmountAdded)
    weeklyAmountAdded[i] = weeklyAmountAdded[i].plus(coinAmountAdded)
    volumeUSD = volumeUSD.plus(coinAmountAdded.times(latestPrice))
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
  liquidityEvent.poolAddress = pool.address
  liquidityEvent.tokenAmount = tokenAmount
  liquidityEvent.volumeUSD = volumeUSD
  liquidityEvent.removal = removal

  hourlySnapshot.save()
  dailySnapshot.save()
  weeklySnapshot.save()
  liquidityEvent.save()
}

export function processRemoveLiquidity(event: RemoveLiquidity): void {
  const pool = Pool.load(event.address.toHexString())
  if (!pool) {
    return
  }
  takePoolSnapshots(event.block.timestamp)
  const timestamp = event.block.timestamp
  const block = event.block.number
  const provider = event.params.provider
  const tokenAmount = event.params.token_amounts
  const removal = true

  // initialise snapshot entities:
  const hourlySnapshot = getHourlyLiquiditySnapshot(pool, timestamp)
  const dailySnapshot = getDailyLiquiditySnapshot(pool, timestamp)
  const weeklySnapshot = getWeeklyLiquiditySnapshot(pool, timestamp)
  const liquidityEvent = new LiquidityEvent(event.transaction.hash.toHexString())

  // get volume of liquidity event:
  const latestSnapshot = getTokenSnapshotByAssetType(pool, timestamp)
  const latestPrice = latestSnapshot.price
  let coinAmountRemoved = BIG_DECIMAL_ZERO
  let volumeUSD = BIG_DECIMAL_ZERO
  const hourlyAmountRemoved = hourlySnapshot.amountRemoved
  const dailyAmountRemoved = dailySnapshot.amountRemoved
  const weeklyAmountRemoved = weeklySnapshot.amountRemoved
  for (let i = 0; i < pool.coins.length; i++) {
    coinAmountRemoved = tokenAmount[i].toBigDecimal().div(exponentToBigDecimal(pool.coinDecimals[i]))
    hourlyAmountRemoved[i] = hourlyAmountRemoved[i].plus(coinAmountRemoved)
    dailyAmountRemoved[i] = dailyAmountRemoved[i].plus(coinAmountRemoved)
    weeklyAmountRemoved[i] = weeklyAmountRemoved[i].plus(coinAmountRemoved)
    volumeUSD = volumeUSD.plus(coinAmountRemoved.times(latestPrice))
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
  liquidityEvent.poolAddress = pool.address
  liquidityEvent.tokenAmount = tokenAmount
  liquidityEvent.volumeUSD = volumeUSD
  liquidityEvent.removal = removal

  hourlySnapshot.save()
  dailySnapshot.save()
  weeklySnapshot.save()
  liquidityEvent.save()
}

export function processRemoveLiquidityImbalance(event: RemoveLiquidityImbalance): void {
  const pool = Pool.load(event.address.toHexString())
  if (!pool) {
    return
  }
  takePoolSnapshots(event.block.timestamp)
  const timestamp = event.block.timestamp
  const block = event.block.number
  const provider = event.params.provider
  const tokenAmount = event.params.token_amounts
  const removal = true

  // initialise snapshot entities:
  const hourlySnapshot = getHourlyLiquiditySnapshot(pool, timestamp)
  const dailySnapshot = getDailyLiquiditySnapshot(pool, timestamp)
  const weeklySnapshot = getWeeklyLiquiditySnapshot(pool, timestamp)
  const liquidityEvent = new LiquidityEvent(event.transaction.hash.toHexString())

  // get volume of liquidity event:
  const latestSnapshot = getTokenSnapshotByAssetType(pool, timestamp)
  const latestPrice = latestSnapshot.price
  let coinAmountRemoved = BIG_DECIMAL_ZERO
  let volumeUSD = BIG_DECIMAL_ZERO
  const hourlyAmountRemoved = hourlySnapshot.amountRemoved
  const dailyAmountRemoved = dailySnapshot.amountRemoved
  const weeklyAmountRemoved = weeklySnapshot.amountRemoved
  for (let i = 0; i < pool.coins.length; i++) {
    coinAmountRemoved = tokenAmount[i].toBigDecimal().div(exponentToBigDecimal(pool.coinDecimals[i]))
    hourlyAmountRemoved[i] = hourlyAmountRemoved[i].plus(coinAmountRemoved)
    dailyAmountRemoved[i] = dailyAmountRemoved[i].plus(coinAmountRemoved)
    weeklyAmountRemoved[i] = weeklyAmountRemoved[i].plus(coinAmountRemoved)
    volumeUSD = volumeUSD.plus(coinAmountRemoved.times(latestPrice))
  }
  hourlySnapshot.amountRemoved = hourlyAmountRemoved
  dailySnapshot.amountRemoved = dailyAmountRemoved
  weeklySnapshot.amountRemoved = weeklyAmountRemoved

  // update entities:
  hourlySnapshot.removeCount = hourlySnapshot.removeCount.plus(BIG_INT_ONE)
  dailySnapshot.removeCount = dailySnapshot.removeCount.plus(BIG_INT_ONE)
  weeklySnapshot.removeCount = weeklySnapshot.removeCount.plus(BIG_INT_ONE)

  hourlySnapshot.volumeUSD = hourlySnapshot.volumeUSD.plus(volumeUSD)
  dailySnapshot.volumeUSD = dailySnapshot.volumeUSD.plus(volumeUSD)
  weeklySnapshot.volumeUSD = weeklySnapshot.volumeUSD.plus(volumeUSD)

  liquidityEvent.liquidityProvider = provider
  liquidityEvent.timestamp = timestamp
  liquidityEvent.block = block
  liquidityEvent.poolAddress = pool.address
  liquidityEvent.tokenAmount = tokenAmount
  liquidityEvent.volumeUSD = volumeUSD
  liquidityEvent.removal = removal

  hourlySnapshot.save()
  dailySnapshot.save()
  weeklySnapshot.save()
  liquidityEvent.save()
}

// Need to use call instead of event as: no coin indices from
export function processRemoveLiquidityOneCall(call: Remove_liquidity_one_coinCall): void {
  const pool = Pool.load(call.to.toHexString())
  if (!pool) {
    return
  }
  takePoolSnapshots(call.block.timestamp)
  const timestamp = call.block.timestamp
  const block = call.block.number
  const provider = call.from
  const tokenAmount = call.inputs._min_received
  const removal = true
  const coinIndex = call.inputs.i.toI32()

  // initialise snapshot entities:
  const hourlySnapshot = getHourlyLiquiditySnapshot(pool, timestamp)
  const dailySnapshot = getDailyLiquiditySnapshot(pool, timestamp)
  const weeklySnapshot = getWeeklyLiquiditySnapshot(pool, timestamp)
  const liquidityEvent = new LiquidityEvent(call.transaction.hash.toHexString())

  // get volume of liquidity event:
  const latestSnapshot = getTokenSnapshotByAssetType(pool, timestamp)
  const latestPrice = latestSnapshot.price
  const coinAmountRemoved = tokenAmount.toBigDecimal().div(exponentToBigDecimal(pool.coinDecimals[coinIndex]))
  const volumeUSD = coinAmountRemoved.times(latestPrice)

  const hourlyAmountRemoved = hourlySnapshot.amountRemoved
  const dailyAmountRemoved = dailySnapshot.amountRemoved
  const weeklyAmountRemoved = weeklySnapshot.amountRemoved

  hourlyAmountRemoved[coinIndex] = hourlyAmountRemoved[coinIndex].plus(coinAmountRemoved)
  dailyAmountRemoved[coinIndex] = dailyAmountRemoved[coinIndex].plus(coinAmountRemoved)
  weeklyAmountRemoved[coinIndex] = weeklyAmountRemoved[coinIndex].plus(coinAmountRemoved)

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
  liquidityEvent.poolAddress = pool.address
  liquidityEvent.tokenAmount[coinIndex] = tokenAmount
  liquidityEvent.volumeUSD = volumeUSD
  liquidityEvent.removal = removal

  hourlySnapshot.save()
  dailySnapshot.save()
  weeklySnapshot.save()
  liquidityEvent.save()
}
