import { Pool } from '../../../generated/schema'
import { BigDecimal, BigInt, log } from '@graphprotocol/graph-ts'
import { getATokenDailyApr } from './rebase'
import { AVALANCHE_ATOKENS, BIG_DECIMAL_ZERO, MATIC_ATOKENS } from '../../../../../packages/constants'
import { bytesToAddress } from '../../../../../packages/utils'

function getATokenMaticPoolApr(
  pool: Pool,
  reserves: Array<BigDecimal>,
  timestamp: BigInt,
  tvl: BigDecimal
): BigDecimal {
  let totalApr = BIG_DECIMAL_ZERO
  for (let i = 0; i < pool.coins.length; i++) {
    if (MATIC_ATOKENS.includes(pool.coins[i].toHexString())) {
      const currentCoinApr = getATokenDailyApr(bytesToAddress(pool.coins[i]), timestamp)
      const aprRatio = tvl == BIG_DECIMAL_ZERO ? BIG_DECIMAL_ZERO : reserves[i].div(tvl)
      log.info('Deductible APR for aToken ({}): {} APR, {} Ratio', [
        pool.coins[i].toHexString(),
        currentCoinApr.toString(),
        aprRatio.toString(),
      ])
      totalApr = totalApr.plus(currentCoinApr.times(aprRatio))
    }
  }
  return totalApr
}

export function getMaticPoolApr(
  pool: Pool,
  reserves: Array<BigDecimal>,
  timestamp: BigInt,
  tvl: BigDecimal
): BigDecimal {
  return getATokenMaticPoolApr(pool, reserves, timestamp, tvl)
}
