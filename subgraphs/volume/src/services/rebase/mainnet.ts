import { Pool, TokenSnapshot } from '../../../generated/schema'
import { BigDecimal, BigInt, log } from '@graphprotocol/graph-ts'
import { LidoOracle } from '../../../generated/templates/CurvePoolTemplate/LidoOracle'
import { getAethSnapshotPrice, getCBETHSnapshotRate, getLidoSnapshotPrice, getUsdnSnapshotPrice } from './snapshots'
import {
  AETH_POOL,
  ATOKEN_POOLS,
  BIG_DECIMAL_ONE,
  BIG_DECIMAL_ZERO,
  CBETH_ADDRESS,
  LIDO_ORACLE_ADDRESS,
  STETH_POOLS,
  USDN_POOL,
  Y_AND_C_POOLS,
} from 'const'
import { bytesToAddress } from 'utils'
import { DAY } from 'utils/time'
import { growthRate } from 'utils/maths'
import { getATokenDailyApr, getCompOrYPoolApr } from './rebase'

function getLidoApr(pool: Pool, reserves: Array<BigDecimal>, timestamp: BigInt, tvl: BigDecimal): BigDecimal {
  // rebase only applies to steth part of the pool
  const stEthRatio = reserves[1].div(tvl)

  if (timestamp.lt(BigInt.fromI32(1682899200))) {
    // V2 launched may 2nd, should replace by block #17172465
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
    log.info('Deductible APR for LIDO: {} APR, {} Ratio', [userApr.toString(), stEthRatio.toString()])
    return userApr.times(stEthRatio)
  } else {
    const apr = getLidoSnapshotPrice(timestamp.minus(DAY))
    log.info('Deductible APR for LIDO V2: {} APR, {} Ratio', [apr.toString(), stEthRatio.toString()])
    return apr.times(stEthRatio)
  }
}

function getAavePoolApr(pool: Pool, reserves: Array<BigDecimal>, timestamp: BigInt, tvl: BigDecimal): BigDecimal {
  let totalApr = BIG_DECIMAL_ZERO
  for (let i = 0; i < pool.coins.length; i++) {
    const currentCoinApr = getATokenDailyApr(bytesToAddress(pool.coins[i]), timestamp)
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

function getUsdnPoolApr(pool: Pool, reserves: Array<BigDecimal>, timestamp: BigInt, tvl: BigDecimal): BigDecimal {
  // we take the previous day's snapshot as reward distribution may not have happened yet
  const growthRate = getUsdnSnapshotPrice(timestamp.minus(DAY))
  const usdnRatio = reserves[0].div(tvl)
  log.info('Deductible APR for USDN: {} APR, {} Ratio', [growthRate.toString(), usdnRatio.toString()])
  return growthRate.times(usdnRatio)
}

function getAethPoolApr(pool: Pool, reserves: Array<BigDecimal>, timestamp: BigInt, tvl: BigDecimal): BigDecimal {
  // we take the two previous day's snapshot as reward distribution may not have happened yet
  const lastRatio = getAethSnapshotPrice(timestamp.minus(DAY))
  const prevRatio = getAethSnapshotPrice(timestamp.minus(DAY))
  const growthRate = lastRatio == BIG_DECIMAL_ZERO ? BIG_DECIMAL_ZERO : prevRatio.minus(lastRatio).div(lastRatio)
  const aethRatio = reserves[0].div(tvl)
  log.info('Deductible APR for AETH: {} APR, {} Ratio', [growthRate.toString(), aethRatio.toString()])
  return growthRate.times(aethRatio)
}

export function getCbEthDailyApr(timestamp: BigInt): BigDecimal {
  const previousScale = getCBETHSnapshotRate(timestamp.minus(DAY))
  const currentScale = getCBETHSnapshotRate(timestamp)
  return growthRate(currentScale, previousScale)
}

function getCbEthPoolApr(pool: Pool, reserves: Array<BigDecimal>, timestamp: BigInt, tvl: BigDecimal): BigDecimal {
  const tokenIndex = pool.coins.indexOf(CBETH_ADDRESS)
  const cbethRatio = reserves[tokenIndex].div(tvl)
  const growthRate = getCbEthDailyApr(timestamp)
  log.info('Deductible APR for CBETH: {} APR, {} Ratio', [growthRate.toString(), cbethRatio.toString()])
  return growthRate.times(cbethRatio)
}

export function getMainnetPoolApr(
  pool: Pool,
  reserves: Array<BigDecimal>,
  timestamp: BigInt,
  tvl: BigDecimal
): BigDecimal {
  if (STETH_POOLS.includes(pool.id)) {
    return getLidoApr(pool, reserves, timestamp, tvl)
  } else if (ATOKEN_POOLS.includes(pool.id)) {
    return getAavePoolApr(pool, reserves, timestamp, tvl)
  } else if (Y_AND_C_POOLS.includes(pool.id)) {
    return getCompOrYPoolApr(pool, reserves, timestamp, tvl)
  } else if (pool.id == USDN_POOL) {
    return getUsdnPoolApr(pool, reserves, timestamp, tvl)
  } else if (pool.coins.indexOf(CBETH_ADDRESS) >= 0) {
    return getCbEthPoolApr(pool, reserves, timestamp, tvl)
  } else if (pool.id == AETH_POOL) {
    return getAethPoolApr(pool, reserves, timestamp, tvl)
  }
  return BIG_DECIMAL_ZERO
}
