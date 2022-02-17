import { BigDecimal, BigInt, Bytes } from '@graphprotocol/graph-ts'
import { Candle, Pool } from '../../generated/schema'
import { BIG_DECIMAL_ZERO } from '../../../../packages/constants'

export function updateCandles(
  pool: Pool,
  timestamp: BigInt,
  token0: Bytes,
  token0Amount: BigDecimal,
  token1: Bytes,
  token1Amount: BigDecimal,
  price: BigDecimal,
  block: BigInt
): void {
  const periods: i32[] = [15 * 60, 60 * 60, 24 * 60 * 60, 7 * 24 * 60 * 60]
  for (let i = 0; i < periods.length; i++) {
    const time_id = timestamp.toI32() / periods[i]
    const candle_id =
      pool.id +
      '-' +
      token0.toHexString() +
      token1.toHexString() +
      '-' +
      time_id.toString() +
      '-' +
      periods[i].toString()
    let candle = Candle.load(candle_id)
    if (candle === null) {
      candle = new Candle(candle_id)
      candle.time = timestamp
      candle.period = periods[i]
      candle.token0 = token0
      candle.token1 = token1
      candle.open = price
      candle.low = price
      candle.high = price
      candle.token0TotalAmount = BIG_DECIMAL_ZERO
      candle.token1TotalAmount = BIG_DECIMAL_ZERO
    } else {
      if (price < candle.low) {
        candle.low = price
      }
      if (price > candle.high) {
        candle.high = price
      }
    }

    candle.close = price
    candle.lastBlock = block

    candle.token0TotalAmount = candle.token0TotalAmount.plus(token0Amount)
    candle.token1TotalAmount = candle.token1TotalAmount.plus(token1Amount)

    candle.save()
  }
}
