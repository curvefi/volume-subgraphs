import { Address, BigDecimal, BigInt, log } from '@graphprotocol/graph-ts'
import {
  BIG_DECIMAL_ZERO, YC_LENDING_TOKENS
} from '../../../../../packages/constants'
import { Pool } from '../../../generated/schema'
import { getATokenSnapshotPrice } from './snapshots'
import { growthRate } from '../../../../../packages/utils/maths'
import { DAY } from '../../../../../packages/utils/time'
import { getTokenSnapshot } from '../snapshots'
import { bytesToAddress } from '../../../../../packages/utils'

{{{ importChainRebaseAprModule }}}

export function getCompOrYPoolApr(pool: Pool, reserves: Array<BigDecimal>, timestamp: BigInt, tvl: BigDecimal): BigDecimal {
  let totalApr = BIG_DECIMAL_ZERO
  for (let i = 0; i < pool.coins.length; i++) {
    if (!YC_LENDING_TOKENS.includes(pool.coins[i].toHexString())) {
      continue
    }
    const previousSnapshot = getTokenSnapshot(bytesToAddress(pool.coins[i]), timestamp.minus(DAY), false)
    const currentSnapshot = getTokenSnapshot(bytesToAddress(pool.coins[i]), timestamp, false)
    const currentCoinApr = growthRate(currentSnapshot.price, previousSnapshot.price)
    const aprRatio = tvl == BIG_DECIMAL_ZERO ? BIG_DECIMAL_ZERO : reserves[i].div(tvl)
    log.info('Deductible APR for lending c/y token ({}): {} APR, {} Ratio', [
      pool.coins[i].toHexString(),
      currentCoinApr.toString(),
      aprRatio.toString(),
    ])
    totalApr = totalApr.plus(currentCoinApr.times(aprRatio))
  }
  return totalApr
}

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
