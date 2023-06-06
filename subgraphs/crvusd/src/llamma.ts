import { Amm, LlammaDeposit, LlammaFee, LlammaRate, LlammaWithdrawal, TokenExchange } from '../generated/schema'
import { SetAdminFee, SetFee } from '../generated/templates/Llamma/Llamma'
import { BigInt } from '@graphprotocol/graph-ts'
import {
  TokenExchange as TokenExchangeEvent,
  Deposit as DepositEvent,
  Withdraw as WithdrawEvent,
  SetRate,
} from '../generated/crvUSDControllerFactory/Llamma'
import { getOrCreateUser } from './services/users'
import { takeSnapshot } from './services/snapshot'

export function handleTokenExchange(event: TokenExchangeEvent): void {
  let swap = new TokenExchange(event.transaction.hash.concatI32(event.logIndex.toI32()))
  let user = getOrCreateUser(event.params.buyer)
  swap.buyer = user.id
  swap.llamma = event.address
  swap.sold_id = event.params.sold_id
  swap.tokens_sold = event.params.sold_id
  swap.tokens_bought = event.params.tokens_bought
  swap.bought_id = event.params.bought_id
  swap.blockNumber = event.block.number
  swap.blockTimestamp = event.block.timestamp
  swap.transactionHash = event.transaction.hash
  swap.save()
  takeSnapshot(event.address, event.block)
}

export function handleWithdraw(event: WithdrawEvent): void {
  const withdrawal = new LlammaWithdrawal(event.transaction.hash.concatI32(event.logIndex.toI32()))
  withdrawal.llamma = event.address
  const user = getOrCreateUser(event.params.provider)
  withdrawal.provider = user.id
  withdrawal.amountBorrowed = event.params.amount_borrowed
  withdrawal.amountCollateral = event.params.amount_collateral

  withdrawal.blockNumber = event.block.number
  withdrawal.blockTimestamp = event.block.timestamp
  withdrawal.transactionHash = event.transaction.hash
  withdrawal.save()
  takeSnapshot(event.address, event.block)
}

export function handleDeposit(event: DepositEvent): void {
  const deposit = new LlammaDeposit(event.transaction.hash.concatI32(event.logIndex.toI32()))
  deposit.llamma = event.address
  const user = getOrCreateUser(event.params.provider)
  deposit.provider = user.id
  deposit.amount = event.params.amount
  deposit.n1 = event.params.n1
  deposit.n2 = event.params.n2

  deposit.blockNumber = event.block.number
  deposit.blockTimestamp = event.block.timestamp
  deposit.transactionHash = event.transaction.hash
  deposit.save()
  takeSnapshot(event.address, event.block)
}

export function handleSetRate(event: SetRate): void {
  const rate = new LlammaRate(event.transaction.hash.concatI32(event.logIndex.toI32()))
  rate.llamma = event.address
  rate.rate = event.params.rate
  rate.rateMul = event.params.rate_mul

  rate.blockNumber = event.block.number
  rate.blockTimestamp = event.block.timestamp
  rate.transactionHash = event.transaction.hash
  rate.save()
}

export function handleSetFee(event: SetFee): void {
  const fee = new LlammaFee(event.transaction.hash.concatI32(event.logIndex.toI32()))
  fee.llamma = event.address
  fee.fee = event.params.fee
  fee.adminFee = BigInt.zero()
  const llamma = Amm.load(event.address)
  if (llamma) {
    fee.adminFee = llamma.adminFee
    llamma.fee = event.params.fee
    llamma.save()
  }
  fee.save()
}

export function handleSetAdminFee(event: SetAdminFee): void {
  const fee = new LlammaFee(event.transaction.hash.concatI32(event.logIndex.toI32()))
  fee.llamma = event.address
  fee.adminFee = event.params.fee
  fee.fee = BigInt.zero()
  const llamma = Amm.load(event.address)
  if (llamma) {
    fee.fee = llamma.fee
    llamma.adminFee = event.params.fee
    llamma.save()
  }
  fee.save()
}
