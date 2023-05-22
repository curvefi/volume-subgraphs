import { BigInt } from '@graphprotocol/graph-ts'

export const YEAR = BigInt.fromI32(60 * 60 * 24 * 365)
export const DAY = BigInt.fromI32(60 * 60 * 24)
export const WEEK = BigInt.fromI32(60 * 60 * 24 * 7)
export const HOUR = BigInt.fromI32(60 * 60)
export const PERIODS = [HOUR, DAY, WEEK]

export function getIntervalFromTimestamp(timestamp: BigInt, interval: BigInt): BigInt {
  return timestamp.div(interval).times(interval)
}
