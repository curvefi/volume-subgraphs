import { Address, BigDecimal, BigInt } from '@graphprotocol/graph-ts'
import { TokenSnapshot } from '../../../generated/schema'
import { DAY, getIntervalFromTimestamp } from 'utils/time'
import { AToken } from '../../../generated/templates/CurvePoolTemplate/AToken'
import { BIG_DECIMAL_ZERO, BIG_INT_ZERO, USDN_TOKEN, AETH_TOKEN } from 'const'

// Used to calculate rebase APR of aTokens
// We store the total supply / total supply scaled ratio as price
export function getATokenSnapshotPrice(token: Address, timestamp: BigInt): BigDecimal {
  const day = getIntervalFromTimestamp(timestamp, DAY)
  const snapshotId = token.toHexString() + '-' + day.toString() + '-rebase'
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

// Used to calculate rebase APR of USDN
export function getUsdnSnapshotPrice(timestamp: BigInt): BigDecimal {
  const day = getIntervalFromTimestamp(timestamp, DAY)
  const snapshotId = USDN_TOKEN + '-' + day.toString() + '-rebase'
  const snapshot = TokenSnapshot.load(snapshotId)
  if (!snapshot) {
    return BIG_DECIMAL_ZERO
  }
  return snapshot.price
}

// Used to calculate rebase APR of AETH
export function getAethSnapshotPrice(timestamp: BigInt): BigDecimal {
  const day = getIntervalFromTimestamp(timestamp, DAY)
  const snapshotId = AETH_TOKEN + '-' + day.toString() + '-rebase'
  const snapshot = TokenSnapshot.load(snapshotId)
  if (!snapshot) {
    return BIG_DECIMAL_ZERO
  }
  return snapshot.price
}
