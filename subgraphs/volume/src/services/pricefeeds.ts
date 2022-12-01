import { Pool, PriceFeed } from '../../generated/schema'
import { BIG_DECIMAL_ZERO, BIG_INT_ZERO } from 'const'
import { Address, BigDecimal, Bytes } from '@graphprotocol/graph-ts'
import { BigInt } from '@graphprotocol/graph-ts/index'

export function getPriceFeed(
  pool: Pool,
  token0: Bytes,
  token1: Bytes,
  fromIndex: i32,
  toIndex: i32,
  isUnderlying: boolean
): PriceFeed {
  const priceId = pool.id + '-' + token0.toHexString() + '-' + token1.toHexString()
  let feed = PriceFeed.load(priceId)
  if (!feed) {
    feed = new PriceFeed(priceId)
    feed.lastUpdated = BIG_INT_ZERO
    feed.lastBlock = BIG_INT_ZERO
    feed.price = BIG_DECIMAL_ZERO
    feed.pool = pool.id
    feed.token0 = token0
    feed.token1 = token1
    feed.fromIndex = fromIndex
    feed.toIndex = toIndex
    feed.isUnderlying = isUnderlying
    feed.save()
  }
  return feed
}

export function updatePriceFeed(
  pool: Pool,
  tokenSold: Bytes,
  tokenBought: Bytes,
  amountSold: BigDecimal,
  amountBought: BigDecimal,
  soldId: i32,
  boughtId: i32,
  isUnderlying: boolean,
  blockNumber: BigInt,
  timestamp: BigInt
): void {
  if (amountBought == BIG_DECIMAL_ZERO || amountSold == BIG_DECIMAL_ZERO) {
    return
  }
  const assetPrice = amountBought.div(amountSold)
  // sanity check for prices
  if (assetPrice.gt(BigDecimal.fromString("10000000"))) {
    return
  }
  const price = getPriceFeed(pool, tokenSold, tokenBought, soldId, boughtId, isUnderlying)
  price.lastBlock = blockNumber
  price.lastUpdated = timestamp
  price.price = assetPrice
  price.save()
}
