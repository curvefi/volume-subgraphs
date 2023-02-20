import { Reward, USDN } from '../../../generated/USDN/USDN'
import { TokenSnapshot } from '../../../generated/schema'
import { DAY, getIntervalFromTimestamp } from 'utils/time'
import { BIG_DECIMAL_ZERO, BIG_INT_ZERO } from 'const'

// We need to keep track of USDN rewards to compute the rebase APR
// because all the contract's variables are private and the graph does not
// yet support getStorageAt calls.
export function handleUsdnRewards(event: Reward): void {
  const token = event.address
  const usdnContract = USDN.bind(token)
  const totalSupplyResult = usdnContract.try_totalSupply()
  const totalSupply = totalSupplyResult.reverted ? BIG_INT_ZERO : totalSupplyResult.value
  const preSupply = totalSupply.gt(event.params.amount) ? totalSupply.minus(event.params.amount) : BIG_INT_ZERO
  const dailyApr = preSupply.gt(BIG_INT_ZERO)
    ? event.params.amount.toBigDecimal().div(preSupply.toBigDecimal())
    : BIG_DECIMAL_ZERO

  const day = getIntervalFromTimestamp(event.block.timestamp, DAY)
  const snapshotId = token.toHexString() + '-' + day.toString() + '-rebase'
  const snapshot = new TokenSnapshot(snapshotId)
  snapshot.price = dailyApr
  snapshot.token = token
  snapshot.timestamp = day
  snapshot.save()
}
