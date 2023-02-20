import { Pool } from '../../../generated/schema'
import { BigDecimal, BigInt, log } from '@graphprotocol/graph-ts'
import { getATokenDailyApr } from './rebase'
import { AVALANCHE_ATOKENS, BIG_DECIMAL_ZERO } from 'const'
import { bytesToAddress } from 'utils'

function getGeneralAvalanchePoolApr(
  pool: Pool,
  reserves: Array<BigDecimal>,
  timestamp: BigInt,
  tvl: BigDecimal
): BigDecimal {
  let totalApr = BIG_DECIMAL_ZERO
  for (let i = 0; i < pool.coins.length; i++) {
    if (AVALANCHE_ATOKENS.includes(pool.coins[i].toHexString())) {
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

export function getAvalanchePoolApr(
  pool: Pool,
  reserves: Array<BigDecimal>,
  timestamp: BigInt,
  tvl: BigDecimal
): BigDecimal {
  // many avax pools use aTokens or a mix of aTokens and regular assets
  // we consider this to be the general case - edge cases can be added later
  return getGeneralAvalanchePoolApr(pool, reserves, timestamp, tvl)
}
