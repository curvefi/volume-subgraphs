import { Address, BigDecimal, BigInt } from '@graphprotocol/graph-ts'
import { TokenSnapshot } from '../../../generated/schema'
import { DAY, getIntervalFromTimestamp } from '../../../../../packages/utils/time'
import { AToken } from '../../../generated/templates/CurvePoolTemplate/AToken'
import { BIG_DECIMAL_ZERO, BIG_INT_ZERO } from '../../../../../packages/constants'

// Used to calculate rebase APR of aTokens
// We store the total supply / total supply scaled ratio as price
export function getATokenSnapshotPrice(token: Address, timestamp: BigInt): BigDecimal {
  const hour = getIntervalFromTimestamp(timestamp, DAY)
  const snapshotId = token.toHexString() + '-' + hour.toString() + '-rebase'
  let snapshot = TokenSnapshot.load(snapshotId)
  if (!snapshot) {
    snapshot = new TokenSnapshot(snapshotId)
    const aTokenContract = AToken.bind(token)
    const totalSupplyResult = aTokenContract.try_totalSupply()
    const scaledTotalSupplyResult = aTokenContract.try_scaledTotalSupply()
    if (totalSupplyResult.reverted || scaledTotalSupplyResult.reverted) {
      snapshot.price = BIG_DECIMAL_ZERO
    } else {
      const totalSupply = totalSupplyResult.value
      const scaledTotalSupply = scaledTotalSupplyResult.value
      snapshot.price =
        scaledTotalSupply == BIG_INT_ZERO
          ? BIG_DECIMAL_ZERO
          : totalSupply.toBigDecimal().div(scaledTotalSupply.toBigDecimal())
    }
    snapshot.token = token
    snapshot.timestamp = timestamp
    snapshot.save()
  }
  return snapshot.price
}
