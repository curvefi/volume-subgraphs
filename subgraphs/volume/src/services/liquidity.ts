import { LiquidityEvent, Pool } from '../../generated/schema'
import { Address, Bytes } from '@graphprotocol/graph-ts'
import { BigInt } from '@graphprotocol/graph-ts/index'
import { takePoolSnapshots } from './snapshots'

export function processLiquidityEvent(
  pool: Pool,
  provider: Address,
  tokenAmounts: Array<BigInt>,
  tokenSupply: BigInt,
  timestamp: BigInt,
  block: BigInt,
  hash: Bytes,
  index: BigInt,
  removal: boolean
): void {
  takePoolSnapshots(timestamp)

  const liquidityEvent = new LiquidityEvent(hash.toHexString() + '-' + index.toString())

  liquidityEvent.liquidityProvider = provider
  liquidityEvent.timestamp = timestamp
  liquidityEvent.block = block
  liquidityEvent.pool = pool.id
  liquidityEvent.tokenAmounts = tokenAmounts
  liquidityEvent.removal = removal
  liquidityEvent.totalSupply = tokenSupply
  liquidityEvent.save()
}
