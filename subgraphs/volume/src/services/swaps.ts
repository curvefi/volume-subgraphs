import { Address, BigDecimal, BigInt, Bytes, log } from '@graphprotocol/graph-ts'
import { Pool, SwapEvent } from '../../generated/schema'
import {
  getCryptoSwapTokenPriceFromSnapshot,
  getStableSwapTokenPriceFromSnapshot,
  getSwapSnapshot,
  takePoolSnapshots,
} from './snapshots'
import {
  ADDRESS_ZERO,
  BIG_DECIMAL_TWO,
  BIG_INT_ONE,
  BIG_INT_ZERO,
  LENDING,
  METAPOOL_FACTORY,
  STABLE_FACTORY,
} from 'const'
import { PERIODS } from 'utils/time'
import { getBasePool, getVirtualBaseLendingPool } from './pools'
import { bytesToAddress } from 'utils'
import { exponentToBigDecimal } from 'utils/maths'
import { updateCandles } from './candles'
import { updatePriceFeed } from './pricefeeds'

export function handleExchange(
  buyer: Address,
  sold_id: BigInt,
  bought_id: BigInt,
  tokens_sold: BigInt,
  tokens_bought: BigInt,
  timestamp: BigInt,
  blockNumber: BigInt,
  address: Address,
  txhash: Bytes,
  gasLimit: BigInt,
  gasUsed: BigInt,
  exchangeUnderlying: boolean
): void {
  const pool = Pool.load(address.toHexString())
  if (!pool) {
    return
  }
  takePoolSnapshots(timestamp)
  const soldId = sold_id.toI32()
  const boughtId = bought_id.toI32()
  let tokenSold: Bytes, tokenBought: Bytes
  let tokenSoldDecimals: BigInt, tokenBoughtDecimals: BigInt

  if (exchangeUnderlying && pool.poolType == LENDING) {
    const basePool = getVirtualBaseLendingPool(bytesToAddress(pool.basePool))
    if (soldId > basePool.coins.length - 1) {
      log.error('Undefined underlying sold Id {} for lending pool {} at tx {}', [
        soldId.toString(),
        pool.id,
        txhash.toHexString(),
      ])
      return
    }
    tokenSold = basePool.coins[soldId]
    tokenSoldDecimals = basePool.coinDecimals[soldId]
  } else if (exchangeUnderlying && soldId != 0) {
    const underlyingSoldIndex = soldId - 1
    const basePool = getBasePool(bytesToAddress(pool.basePool))
    if (underlyingSoldIndex > basePool.coins.length - 1) {
      log.error('Undefined underlying sold Id {} for pool {} at tx {}', [
        soldId.toString(),
        pool.id,
        txhash.toHexString(),
      ])
      return
    }
    tokenSold = basePool.coins[underlyingSoldIndex]
    if (
      ((pool.assetType == 2 && (pool.poolType == METAPOOL_FACTORY || pool.poolType == STABLE_FACTORY)) ||
        (pool.assetType == 0 && pool.poolType == STABLE_FACTORY)) &&
      boughtId == 0 &&
      !pool.isRebasing
    ) {
      // handling an edge-case in the way the dx is logged in the event
      // for BTC metapools and for USD Metapool from factory v1.2
      tokenSoldDecimals = BigInt.fromI32(18)
    } else {
      tokenSoldDecimals = basePool.coinDecimals[underlyingSoldIndex]
    }
  } else {
    if (soldId > pool.coins.length - 1) {
      log.error('Undefined sold Id {} for pool {} at tx {}', [soldId.toString(), pool.id, txhash.toHexString()])
      return
    }
    tokenSold = pool.coins[soldId]
    tokenSoldDecimals = pool.coinDecimals[soldId]
  }

  if (tokenSold == ADDRESS_ZERO) {
    log.error('Undefined SOLD token for pool {} at tx {}', [pool.id, txhash.toHexString()])
    return
  }

  if (exchangeUnderlying && pool.poolType == LENDING) {
    const basePool = getVirtualBaseLendingPool(bytesToAddress(pool.basePool))
    if (boughtId > basePool.coins.length - 1) {
      log.error('Undefined underlying bought Id {} for lending pool {} at tx {}', [
        boughtId.toString(),
        pool.id,
        txhash.toHexString(),
      ])
      return
    }
    tokenBought = basePool.coins[boughtId]
    tokenBoughtDecimals = basePool.coinDecimals[boughtId]
  } else if (exchangeUnderlying && boughtId != 0) {
    const underlyingBoughtIndex = boughtId - 1
    const basePool = getBasePool(bytesToAddress(pool.basePool))
    if (underlyingBoughtIndex > basePool.coins.length - 1) {
      log.error('Undefined underlying bought Id {} for pool {} at tx {}', [
        boughtId.toString(),
        pool.id,
        txhash.toHexString(),
      ])
    }
    tokenBought = basePool.coins[underlyingBoughtIndex]
    tokenBoughtDecimals = basePool.coinDecimals[underlyingBoughtIndex]
  } else {
    if (boughtId > pool.coins.length - 1) {
      log.error('Undefined bought Id {} for pool {} at tx {}', [boughtId.toString(), pool.id, txhash.toHexString()])
      return
    }
    tokenBought = pool.coins[boughtId]
    tokenBoughtDecimals = pool.coinDecimals[boughtId]
  }

  if (tokenBought == ADDRESS_ZERO) {
    log.error('Undefined BOUGHT token for pool {} at tx {}', [pool.id, txhash.toHexString()])
    return
  }

  const amountSold = tokens_sold.toBigDecimal().div(exponentToBigDecimal(tokenSoldDecimals))
  const amountBought = tokens_bought.toBigDecimal().div(exponentToBigDecimal(tokenBoughtDecimals))
  log.debug('Getting token snaphsot for {}', [pool.id])
  let amountBoughtUSD: BigDecimal, amountSoldUSD: BigDecimal
  if (!pool.isV2) {
    const latestBoughtSnapshotPrice = getStableSwapTokenPriceFromSnapshot(pool, bytesToAddress(tokenBought), timestamp)
    const latestSoldSnapshotPrice = getStableSwapTokenPriceFromSnapshot(pool, bytesToAddress(tokenSold), timestamp)
    amountBoughtUSD = amountBought.times(latestBoughtSnapshotPrice)
    amountSoldUSD = amountSold.times(latestSoldSnapshotPrice)
  } else {
    const latestBoughtSnapshotPrice = getCryptoSwapTokenPriceFromSnapshot(pool, bytesToAddress(tokenBought), timestamp)
    const latestSoldSnapshotPrice = getCryptoSwapTokenPriceFromSnapshot(pool, bytesToAddress(tokenSold), timestamp)
    amountBoughtUSD = amountBought.times(latestBoughtSnapshotPrice)
    amountSoldUSD = amountSold.times(latestSoldSnapshotPrice)
  }

  const swapEvent = new SwapEvent(txhash.toHexString() + '-' + amountBought.toString())
  swapEvent.pool = address.toHexString()
  swapEvent.block = blockNumber
  swapEvent.buyer = buyer
  swapEvent.tx = txhash
  swapEvent.gasLimit = gasLimit
  swapEvent.gasUsed = gasUsed ? gasUsed : BIG_INT_ZERO
  swapEvent.tokenBought = tokenBought
  swapEvent.tokenSold = tokenSold
  swapEvent.amountBought = amountBought
  swapEvent.amountSold = amountSold
  swapEvent.amountBoughtUSD = amountBoughtUSD
  swapEvent.amountSoldUSD = amountSoldUSD
  swapEvent.timestamp = timestamp
  swapEvent.save()

  updateCandles(pool, timestamp, tokenBought, amountBought, tokenSold, amountSold, blockNumber)

  updatePriceFeed(
    pool,
    tokenSold,
    tokenBought,
    amountSold,
    amountBought,
    soldId,
    boughtId,
    exchangeUnderlying,
    blockNumber,
    timestamp
  )

  const volume = amountSold.plus(amountBought).div(BIG_DECIMAL_TWO)
  let volumeUSD = amountSoldUSD.plus(amountBoughtUSD).div(BIG_DECIMAL_TWO)
  // sanity check for usd volume
  if (volumeUSD.gt(BigDecimal.fromString('1000000000'))) {
    volumeUSD = BigDecimal.zero()
  }
  // create hourly, daily & weekly snapshots
  for (let i = 0; i < PERIODS.length; i++) {
    const snapshot = getSwapSnapshot(pool, timestamp, PERIODS[i])
    snapshot.count = snapshot.count.plus(BIG_INT_ONE)
    snapshot.amountSold = snapshot.amountSold.plus(amountSold)
    snapshot.amountBought = snapshot.amountBought.plus(amountBought)
    snapshot.amountSoldUSD = snapshot.amountSoldUSD.plus(amountSoldUSD)
    snapshot.amountBoughtUSD = snapshot.amountBoughtUSD.plus(amountBoughtUSD)
    snapshot.volume = snapshot.volume.plus(volume)
    snapshot.volumeUSD = snapshot.volumeUSD.plus(volumeUSD)
    snapshot.save()
  }

  pool.cumulativeVolume = pool.cumulativeVolume.plus(volume)
  pool.cumulativeVolumeUSD = pool.cumulativeVolumeUSD.plus(volumeUSD)

  pool.save()
}
