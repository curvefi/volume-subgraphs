import { BigDecimal, BigInt, log } from '@graphprotocol/graph-ts'
import { LidoOracle } from '../../generated/templates/CurvePoolTemplate/LidoOracle'
import {
  BIG_DECIMAL_ONE,
  BIG_DECIMAL_ZERO,
  LIDO_ORACLE_ADDRESS,
  LIDO_POOL_ADDRESS,
} from '../../../../packages/constants'
import { Pool } from '../../generated/schema'

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

export function getDeductibleApr(pool: Pool, reserves: Array<BigInt>): BigDecimal {
  if (pool.id == LIDO_POOL_ADDRESS.toHexString() && reserves.length > 1) {
    const lidoApr = getLidoApr()
    // rebase only applies to steth part of the pool
    const stEthRatio = reserves[0].plus(reserves[1]).toBigDecimal().div(reserves[1].toBigDecimal())
    return lidoApr.times(stEthRatio)
  }
  return BIG_DECIMAL_ZERO
}
