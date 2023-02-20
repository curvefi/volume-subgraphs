import { TokenSnapshot } from '../../../generated/schema'
import { DAY, getIntervalFromTimestamp } from 'utils/time'
import { RatioUpdate } from '../../../generated/AETH/AETH'

// We need to keep track of AETH ratio to compute the rebase APR
// because all the contract's variables are private and the graph does not
// yet support getStorageAt calls.
export function handleAethRewards(event: RatioUpdate): void {
  const token = event.address
  const day = getIntervalFromTimestamp(event.block.timestamp, DAY)
  const snapshotId = token.toHexString() + '-' + day.toString() + '-rebase'
  const snapshot = new TokenSnapshot(snapshotId)
  snapshot.price = event.params.newRatio.toBigDecimal()
  snapshot.token = token
  snapshot.timestamp = day
  snapshot.save()
}
