import { PegKeeper, Profit, Provide, Withdraw } from '../generated/schema'
import {
  Provide as ProvideEvent,
  Withdraw as WithdrawEvent,
  Profit as ProfitEvent,
} from '../generated/templates/PegKeeper/PegKeeper'
import { BigInt, log } from '@graphprotocol/graph-ts'

export function handleProvide(event: ProvideEvent): void {
  const provide = new Provide(event.transaction.hash.concatI32(event.logIndex.toI32()))
  provide.keeper = event.address
  provide.amount = event.params.amount
  provide.debt = BigInt.zero()
  provide.blockNumber = event.block.number
  provide.blockTimestamp = event.block.timestamp
  provide.transactionHash = event.transaction.hash

  const keeper = PegKeeper.load(event.address)
  if (keeper) {
    keeper.totalProvided = keeper.totalProvided.plus(event.params.amount)
    keeper.debt = keeper.debt.plus(event.params.amount)
    provide.debt = keeper.debt
    keeper.save()
  } else {
    log.error('Could not find keeper {} at tx {}', [event.address.toHexString(), event.transaction.hash.toHexString()])
  }
  provide.save()
}

export function handleWithdraw(event: WithdrawEvent): void {
  const withdraw = new Withdraw(event.transaction.hash.concatI32(event.logIndex.toI32()))
  withdraw.keeper = event.address
  withdraw.amount = event.params.amount
  withdraw.debt = BigInt.zero()
  withdraw.blockNumber = event.block.number
  withdraw.blockTimestamp = event.block.timestamp
  withdraw.transactionHash = event.transaction.hash

  const keeper = PegKeeper.load(event.address)
  if (keeper) {
    keeper.totalProvided = keeper.totalProvided.minus(event.params.amount)
    keeper.debt = keeper.debt.minus(event.params.amount)
    withdraw.debt = keeper.debt
    keeper.save()
  } else {
    log.error('Could not find keeper {} at tx {}', [event.address.toHexString(), event.transaction.hash.toHexString()])
  }

  withdraw.save()
}

export function handleProfit(event: ProfitEvent): void {
  const profit = new Profit(event.transaction.hash.concatI32(event.logIndex.toI32()))
  profit.keeper = event.address
  profit.amount = event.params.lp_amount
  profit.blockNumber = event.block.number
  profit.blockTimestamp = event.block.timestamp
  profit.transactionHash = event.transaction.hash

  const keeper = PegKeeper.load(event.address)
  if (keeper) {
    keeper.totalProfit = keeper.totalProfit.plus(event.params.lp_amount)
    keeper.save()
  }
  profit.save()
}
