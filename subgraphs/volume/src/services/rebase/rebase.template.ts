import { Address, BigDecimal, BigInt } from '@graphprotocol/graph-ts'
import {
  BIG_DECIMAL_ZERO
} from '../../../../../packages/constants'
import { Pool } from '../../../generated/schema'
import { getATokenSnapshotPrice } from './snapshots'
import { growthRate } from '../../../../../packages/utils/maths'
import { DAY } from '../../../../../packages/utils/time'
{{{ importChainRebaseAprModule }}}

export function getATokenDailyApr(token: Address, timestamp: BigInt): BigDecimal {
  const previousScale = getATokenSnapshotPrice(token, timestamp.minus(DAY))
  const currentScale = getATokenSnapshotPrice(token, timestamp)
  return growthRate(currentScale, previousScale)
}

export function getDeductibleApr(pool: Pool, reserves: Array<BigDecimal>, timestamp: BigInt): BigDecimal {
  if (reserves.length != pool.coins.length) {
    return BIG_DECIMAL_ZERO
  }
  const tvl = reserves.reduce((a: BigDecimal, b: BigDecimal) => a.plus(b), BIG_DECIMAL_ZERO)
  if (tvl.le(BIG_DECIMAL_ZERO)) {
    return BIG_DECIMAL_ZERO
  }
  {{{ returnChainRebaseApr }}}
}
