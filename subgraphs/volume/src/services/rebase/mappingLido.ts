import { TokenSnapshot } from '../../../generated/schema'
import { DAY, getIntervalFromTimestamp, YEAR } from 'utils/time'
import { TokenRebased } from '../../../generated/Lido/Lido'
import { BigDecimal } from '@graphprotocol/graph-ts'

// https://docs.lido.fi/integrations/api#last-lido-apr-for-steth
// V2 APR calculation formula
export function handleLidoRebase(event: TokenRebased): void {
  const token = event.address
  const day = getIntervalFromTimestamp(event.block.timestamp, DAY)
  const snapshotId = token.toHexString() + '-' + day.toString() + '-rebase'
  const snapshot = new TokenSnapshot(snapshotId)
  const decimals = BigDecimal.fromString('1000000000000000000000000000')
  const preShareRate = event.params.preTotalEther
    .toBigDecimal()
    .times(decimals)
    .div(event.params.preTotalShares.toBigDecimal())
  const postShareRate = event.params.postTotalEther
    .toBigDecimal()
    .times(decimals)
    .div(event.params.postTotalShares.toBigDecimal())

  const userAPR = YEAR.toBigDecimal()
    .times(postShareRate.minus(preShareRate).div(preShareRate))
    .div(event.params.timeElapsed.toBigDecimal())
  snapshot.price = userAPR
  snapshot.token = token
  snapshot.timestamp = day
  snapshot.save()
}
