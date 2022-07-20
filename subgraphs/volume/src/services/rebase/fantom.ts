import { Pool } from '../../../generated/schema'
import { BigDecimal, BigInt, log } from '@graphprotocol/graph-ts'
import { getATokenDailyApr, getCompOrYPoolApr } from './rebase'
import { AVALANCHE_ATOKENS, BIG_DECIMAL_ZERO, GEIST_POOL_FTM, IB_POOL_FTM } from '../../../../../packages/constants'
import { bytesToAddress } from '../../../../../packages/utils'

function getFantomGeistPoolApr(
  pool: Pool,
  reserves: Array<BigDecimal>,
  timestamp: BigInt,
  tvl: BigDecimal
): BigDecimal {
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

export function getFantomPoolApr(
  pool: Pool,
  reserves: Array<BigDecimal>,
  timestamp: BigInt,
  tvl: BigDecimal
): BigDecimal {
  if (pool.id == GEIST_POOL_FTM) {
    return getFantomGeistPoolApr(pool, reserves, timestamp, tvl)
  } else if (pool.id == IB_POOL_FTM) {
    return getCompOrYPoolApr(pool, reserves, timestamp, tvl)
  }
  return BIG_DECIMAL_ZERO
}
