import { BigDecimal } from '@graphprotocol/graph-ts/index'
import { ERC20 } from 'curve-pools/generated/Booster/ERC20'
import {
  BIG_DECIMAL_1E18,
  BIG_DECIMAL_ZERO,
  CVX_ADDRESS,
  CVX_CLIFF_COUNT,
  CVX_CLIFF_SIZE,
  CVX_MAX_SUPPLY,
} from '../constants'

export function getCvxMintAmount(crvEarned: BigDecimal): BigDecimal {
  const cvxSupplyResult = ERC20.bind(CVX_ADDRESS).try_totalSupply()
  if (!cvxSupplyResult.reverted) {
    const cvxSupply = cvxSupplyResult.value.toBigDecimal().div(BIG_DECIMAL_1E18)
    const currentCliff = cvxSupply.div(CVX_CLIFF_SIZE)
    if (currentCliff.lt(CVX_CLIFF_COUNT)) {
      const remaining = CVX_CLIFF_COUNT.minus(currentCliff)
      let cvxEarned = crvEarned.times(remaining).div(CVX_CLIFF_COUNT)
      const amountTillMax = CVX_MAX_SUPPLY.minus(cvxSupply)
      if (cvxEarned.gt(amountTillMax)) {
        cvxEarned = amountTillMax
      }
      return cvxEarned
    }
  }
  return BIG_DECIMAL_ZERO
}
