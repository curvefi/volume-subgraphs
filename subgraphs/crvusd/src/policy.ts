import {
  AddPegKeeper,
  RemovePegKeeper,
  SetRate,
  SetTargetDebtFraction,
} from '../generated/templates/MonetaryPolicy/MonetaryPolicy'
import { PegKeeper as PegKeeperAbi } from '../generated/templates/MonetaryPolicy/PegKeeper'
import { BenchmarkRate, DebtFraction, MonetaryPolicy, PegKeeper } from '../generated/schema'
import { BigInt, log } from '@graphprotocol/graph-ts'
import { PegKeeper as PegKeeperTemplate } from '../generated/templates'
import { getOrCreatePolicyPegKeeper } from './services/policies'

export function handleAddPegKeeper(event: AddPegKeeper): void {
  log.info('Added peg keeper {} for policy {}', [event.params.peg_keeper.toHexString(), event.address.toHexString()])
  let keeper = PegKeeper.load(event.params.peg_keeper)
  if (!keeper) {
    PegKeeperTemplate.create(event.params.peg_keeper)
    const keeperContract = PegKeeperAbi.bind(event.params.peg_keeper)
    keeper = new PegKeeper(event.params.peg_keeper)
    keeper.active = true
    keeper.pool = keeperContract.pool()
    keeper.debt = BigInt.zero()
    keeper.totalProfit = BigInt.zero()
    keeper.totalProvided = BigInt.zero()
    keeper.totalWithdrawn = BigInt.zero()
    keeper.save()
  }
  getOrCreatePolicyPegKeeper(event.address, event.params.peg_keeper)
  const policy = MonetaryPolicy.load(event.address)
  if (policy) {
    const keepers = policy.keepers
    if (policy.keepers.indexOf(event.params.peg_keeper) < 0) {
      keepers.push(event.params.peg_keeper)
    }
    policy.keepers = keepers
    policy.save()
  }
}

export function handleRemovePegKeeper(event: RemovePegKeeper): void {
  const keeper = PegKeeper.load(event.params.peg_keeper)
  if (!keeper) {
    log.error('Keeper {} removed from policy {} but was not tracked', [
      event.params.peg_keeper.toHexString(),
      event.address.toHexString(),
    ])
    return
  }
  keeper.active = false
  keeper.save()
}

export function handleSetTargetDebtFraction(event: SetTargetDebtFraction): void {
  const fraction = new DebtFraction(event.transaction.hash.concatI32(event.logIndex.toI32()))
  fraction.policy = event.address
  fraction.target = event.params.target_debt_fraction

  fraction.blockNumber = event.block.number
  fraction.blockTimestamp = event.block.timestamp
  fraction.transactionHash = event.transaction.hash
  fraction.save()
}

export function handleSetRate(event: SetRate): void {
  const rate = new BenchmarkRate(event.transaction.hash.concatI32(event.logIndex.toI32()))
  rate.policy = event.address
  rate.rate = event.params.rate
  rate.blockNumber = event.block.number
  rate.blockTimestamp = event.block.timestamp
  rate.transactionHash = event.transaction.hash
  rate.save()
}
