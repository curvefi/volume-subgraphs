import { BigDecimal, BigInt, log } from '@graphprotocol/graph-ts'
import { LidoOracle } from '../../../generated/templates/CurvePoolTemplate/LidoOracle'
import {
  AAVE_POOL_ADDRESS,
  BIG_DECIMAL_ONE,
  BIG_DECIMAL_ZERO,
  LIDO_ORACLE_ADDRESS,
  LIDO_POOL_ADDRESS,
} from '../../../../../packages/constants'
import { Pool } from '../../../generated/schema'
import { getATokenSnapshotPrice } from './snapshots'
import { DAY } from '../../../../../packages/utils/time'
import { bytesToAddress } from '../../../../../packages/utils'
import { growthRate } from '../../../../../packages/utils/maths'

export function getLidoApr(): BigDecimal {
  const lidoOracleContract = LidoOracle.bind(LIDO_ORACLE_ADDRESS)
  const reportResult = lidoOracleContract.try_getLastCompletedReportDelta()
  if (reportResult.reverted) {
    log.warning('LIDO oracle call reverted', [])
    return BIG_DECIMAL_ZERO
  }
  const baseApr = reportResult.value.value0
    .minus(reportResult.value.value1)
    .toBigDecimal()
    .div(reportResult.value.value1.toBigDecimal())
  // TODO: get fee from lido contract dynamically
  const feeResult = BigDecimal.fromString('1000').div(BigDecimal.fromString('10000'))
  const userApr = baseApr.times(BIG_DECIMAL_ONE.minus(feeResult))
  return userApr
}

export function getDeductibleApr(pool: Pool, reserves: Array<BigDecimal>, timestamp: BigInt): BigDecimal {
  if (reserves.length != pool.coins.length) {
    return BIG_DECIMAL_ZERO
  }
  if (pool.id == LIDO_POOL_ADDRESS.toHexString()) {
    const lidoApr = getLidoApr()
    // rebase only applies to steth part of the pool
    const stEthRatio = reserves[0].plus(reserves[1]).div(reserves[1])
    return lidoApr.times(stEthRatio)
  } else if (pool.id == AAVE_POOL_ADDRESS.toHexString()) {
    const tvl = reserves.reduce((a: BigDecimal, b: BigDecimal) => a.plus(b), BIG_DECIMAL_ZERO)
    let totalApr = BIG_DECIMAL_ZERO
    for (let i = 0; i < pool.coins.length; i++) {
      const previousScale = getATokenSnapshotPrice(bytesToAddress(pool.coins[i]), timestamp.minus(DAY))
      const currentScale = getATokenSnapshotPrice(bytesToAddress(pool.coins[i]), timestamp)
      const currentCoinApr = growthRate(currentScale, previousScale)
      const aprRatio = tvl == BIG_DECIMAL_ZERO ? BIG_DECIMAL_ZERO : reserves[i].div(tvl)
      log.info('Deductible APR for aToken ({}): {} APR, {} Ratio', [
        pool.coins[i].toHexString(),
        currentCoinApr.toString(),
        aprRatio.toString(),
      ])
      totalApr = totalApr.plus(currentCoinApr.times(aprRatio))
    }
    return totalApr
  }
  return BIG_DECIMAL_ZERO
}
