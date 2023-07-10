import {
  Amm,
  LlammaDeposit,
  LlammaFee,
  LlammaRate,
  LlammaWithdrawal,
  Market, Snapshot,
  TokenExchange
} from '../generated/schema'
import { SetAdminFee, SetFee } from '../generated/templates/Llamma/Llamma'
import { Address, BigDecimal, BigInt, log } from '@graphprotocol/graph-ts'
import {
  TokenExchange as TokenExchangeEvent,
  Deposit as DepositEvent,
  Withdraw as WithdrawEvent,
  SetRate,
} from '../generated/crvUSDControllerFactory/Llamma'
import { getOrCreateUser } from './services/users'
import { getVolumeSnapshot, takeSnapshots, toDecimal } from './services/snapshot'
import { DAY, getIntervalFromTimestamp, HOUR } from './services/time'

export function handleTokenExchange(event: TokenExchangeEvent): void {
  takeSnapshots(event.block)
  const swap = new TokenExchange(event.transaction.hash.concatI32(event.logIndex.toI32()))
  const user = getOrCreateUser(event.params.buyer)
  swap.buyer = user.id
  swap.llamma = event.address
  swap.soldId = event.params.soldId
  swap.tokensSold = event.params.tokensSold
  swap.tokensBought = event.params.tokensBought
  swap.tokensBoughtUSD = BigDecimal.zero()
  swap.tokensSoldUSD = BigDecimal.zero()
  swap.boughtId = event.params.boughtId
  swap.blockNumber = event.block.number
  swap.blockTimestamp = event.block.timestamp
  swap.transactionHash = event.transaction.hash
  swap.save()

  const llamma = Amm.load(event.address)
  if (!llamma) {
    log.error('Received event from unknown amm {}', [event.address.toHexString()])
    return
  }
  const market = Market.load(llamma.market)

  if (!market) {
    log.error('Unable to load market {} for amm {}', [llamma.market.toHexString(), llamma.id.toHexString()])
    return
  }

  const snapshot = Snapshot.load(event.address.toHexString()+ '-' + getIntervalFromTimestamp(event.block.timestamp, HOUR).toString())
  if (!snapshot) {
    log.error('Unable to generate snapshot to process exchange volume', [])
    return
  }


  const periods = [HOUR, DAY]

  let soldAmountUsd = BigDecimal.zero()
  let boughtAmountUsd = BigDecimal.zero()
  if (llamma.coins[event.params.boughtId.toI32()] == market.collateral) {
    boughtAmountUsd = toDecimal(event.params.tokensBought, market.collateralPrecision.toString()).times(snapshot.oraclePrice)
    soldAmountUsd = toDecimal(event.params.tokensSold, '18')
  } else {
    soldAmountUsd = toDecimal(event.params.tokensSold, market.collateralPrecision.toString()).times(snapshot.oraclePrice)
    boughtAmountUsd = toDecimal(event.params.tokensBought, '18')
  }
  const volumeUsd = soldAmountUsd.plus(boughtAmountUsd).div(BigDecimal.fromString('2'))

  swap.tokensBoughtUSD = boughtAmountUsd
  swap.tokensSoldUSD = soldAmountUsd
  swap.save()

  for (let i = 0; i < periods.length; i++) {
    const volumeSnapshot = getVolumeSnapshot(event.block.timestamp, periods[i], event.address)
    volumeSnapshot.amountBoughtUSD = volumeSnapshot.amountBoughtUSD.plus(boughtAmountUsd)
    volumeSnapshot.amountSoldUSD = volumeSnapshot.amountSoldUSD.plus(soldAmountUsd)
    volumeSnapshot.swapVolumeUSD = volumeSnapshot.swapVolumeUSD.plus(volumeUsd)
    volumeSnapshot.count = volumeSnapshot.count.plus(BigInt.fromI32(1))
    volumeSnapshot.save()
  }
  llamma.totalSwapVolume = llamma.totalSwapVolume.plus(volumeUsd)
  llamma.save()
}

export function updateLiquiditySnapshot(amountCollateral: BigInt, amountStableCoin: BigInt, timestamp: BigInt, address: Address, deposit: boolean): void {

  const periods = [HOUR, DAY]

  const llamma = Amm.load(address)
  if (!llamma) {
    log.error('Received event from unknown amm {}', [address.toHexString()])
    return
  }

  const market = Market.load(llamma.market)

  if (!market) {
    log.error('Unable to load market {} for amm {}', [llamma.market.toHexString(), llamma.id.toHexString()])
    return
  }

  const snapshot = Snapshot.load(address.toHexString()+ '-' + getIntervalFromTimestamp(timestamp, HOUR).toString())
  if (!snapshot) {
    log.error('Unable to generate snapshot to process liquidity volume', [])
    return
  }

  const amountCollateralUsd = toDecimal(amountCollateral, market.collateralPrecision.toString()).times(snapshot.oraclePrice)
  const amountUsd = amountCollateralUsd + toDecimal(amountStableCoin, '18')

  for (let i = 0; i < periods.length; i++) {
    const volumeSnapshot = getVolumeSnapshot(timestamp, periods[i], address)
    if (deposit) {
      volumeSnapshot.amountDepositedUSD = volumeSnapshot.amountDepositedUSD.plus(amountUsd)
    }
    else {
      volumeSnapshot.amountWithdrawnUSD = volumeSnapshot.amountWithdrawnUSD.plus(amountUsd)
    }
    volumeSnapshot.count = volumeSnapshot.count.plus(BigInt.fromI32(1))
    volumeSnapshot.save()
  }

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
  takeSnapshots(event.block)
  updateLiquiditySnapshot(
    event.params.amount_collateral,
    event.params.amount_borrowed,
    event.block.timestamp,
    event.address,
    false
  )
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
  takeSnapshots(event.block)
  updateLiquiditySnapshot(
    event.params.amount,
    BigInt.zero(),
    event.block.timestamp,
    event.address,
    false
  )
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
