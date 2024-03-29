import {
  Market,
  UserState,
  Borrow,
  Repayment,
  Removal,
  Liquidation,
  Snapshot,
  CollectedFee,
  Leverage,
} from '../generated/schema'
import {
  Borrow as BorrowEvent,
  RemoveCollateral as RemoveCollateralEvent,
  Liquidate as LiquidateEvent,
  UserState as UserStateEvent,
  Repay as RepayEvent,
  SetMonetaryPolicy,
} from '../generated/templates/ControllerTemplate/Controller'
import { getOrCreateDeposit, getOrCreateUser } from './services/users'
import { MonetaryPolicy as MonetaryPolicyTemplate } from '../generated/templates'
import { Address, BigDecimal, BigInt, log } from '@graphprotocol/graph-ts'
import { takeSnapshots, toDecimal } from './services/snapshot'
import { CollectFees, Create_loan_extendedCall } from '../generated/templates/Llamma/Controller'
import { getIntervalFromTimestamp, HOUR } from './services/time'
import { getOrCreatePolicy } from './services/policies'
import { Llamma } from '../generated/templates/Llamma/Llamma'

export function handleBorrow(event: BorrowEvent): void {
  const user = getOrCreateUser(event.params.user, event.block.number)
  const deposit = getOrCreateDeposit(event.params.user, event.address)
  deposit.depositedCollateral = deposit.depositedCollateral.plus(event.params.collateral_increase)
  deposit.save()
  const borrow = new Borrow(event.transaction.hash.concatI32(event.logIndex.toI32()))
  borrow.market = event.address
  borrow.user = user.id
  borrow.collateralIncrease = event.params.collateral_increase
  borrow.loanIncrease = event.params.loan_increase

  borrow.blockNumber = event.block.number
  borrow.blockTimestamp = event.block.timestamp
  borrow.transactionHash = event.transaction.hash
  borrow.save()
}

export function handleRepay(event: RepayEvent): void {
  const user = getOrCreateUser(event.params.user, event.block.number)
  const deposit = getOrCreateDeposit(event.params.user, event.address)
  deposit.depositedCollateral = deposit.depositedCollateral.minus(event.params.collateral_decrease)
  deposit.save()
  const repay = new Repayment(event.transaction.hash.concatI32(event.logIndex.toI32()))
  repay.user = user.id
  repay.market = event.address
  repay.collateralDecrease = event.params.collateral_decrease
  repay.loanDecrease = event.params.loan_decrease

  repay.blockNumber = event.block.number
  repay.blockTimestamp = event.block.timestamp
  repay.transactionHash = event.transaction.hash
  repay.save()
}

export function handleRemoveCollateral(event: RemoveCollateralEvent): void {
  const user = getOrCreateUser(event.params.user, event.block.number)
  const deposit = getOrCreateDeposit(event.params.user, event.address)
  deposit.depositedCollateral = deposit.depositedCollateral.minus(event.params.collateral_decrease)
  deposit.save()
  const removal = new Removal(event.transaction.hash.concatI32(event.logIndex.toI32()))
  removal.user = user.id
  removal.market = event.address
  removal.collateralDecrease = event.params.collateral_decrease

  removal.blockNumber = event.block.number
  removal.blockTimestamp = event.block.timestamp
  removal.transactionHash = event.transaction.hash
  removal.save()
}

export function handleLiquidate(event: LiquidateEvent): void {
  const user = getOrCreateUser(event.params.user, event.block.number)
  const liquidation = new Liquidation(event.transaction.hash.concatI32(event.logIndex.toI32()))
  const liquidator = getOrCreateUser(event.params.liquidator, event.block.number)
  liquidation.user = user.id
  liquidation.market = event.address
  liquidation.collateralReceived = event.params.collateral_received
  liquidation.stablecoinReceived = event.params.stablecoin_received
  liquidation.liquidator = liquidator.id
  liquidation.debt = event.params.debt

  liquidation.blockNumber = event.block.number
  liquidation.blockTimestamp = event.block.timestamp
  liquidation.transactionHash = event.transaction.hash

  const market = Market.load(event.address)
  let priceOracle = BigInt.zero()
  if (market) {
    const llammaContract = Llamma.bind(Address.fromBytes(market.amm))
    const oracleResult = llammaContract.try_price_oracle()
    if (!oracleResult.reverted) {
      priceOracle = oracleResult.value
    }
  }
  liquidation.oraclePrice = priceOracle
  liquidation.save()
}

export function handleSetMonetaryPolicy(event: SetMonetaryPolicy): void {
  const market = Market.load(event.address)
  if (!market) {
    log.error('Error: monetary policy {} from non existent market {} at {}', [
      event.params.monetary_policy.toHexString(),
      event.address.toHexString(),
      event.transaction.hash.toHexString(),
    ])
    return
  }
  const policy = getOrCreatePolicy(event.params.monetary_policy)
  policy.save()

  MonetaryPolicyTemplate.create(event.params.monetary_policy)
  market.monetaryPolicy = event.params.monetary_policy
  market.save()
}

export function handleUserState(event: UserStateEvent): void {
  const user = getOrCreateUser(event.params.user, event.block.number)
  const userState = new UserState(event.transaction.hash.concatI32(event.logIndex.toI32()))

  userState.user = user.id
  userState.market = event.address
  userState.liquidationDiscount = event.params.liquidation_discount
  userState.n1 = event.params.n1
  userState.n2 = event.params.n2
  userState.debt = event.params.debt
  userState.collateral = event.params.collateral

  userState.blockNumber = event.block.number
  userState.blockTimestamp = event.block.timestamp
  userState.transactionHash = event.transaction.hash
  userState.save()
  takeSnapshots(event.block)
}

export function handleCollectFees(event: CollectFees): void {
  const market = Market.load(event.address)
  if (!market) {
    log.error('Unable to find market {} for collect fee events at {}', [
      event.address.toHexString(),
      event.transaction.hash.toHexString(),
    ])
    return
  }
  // AMM fees are not logged so we retrieve them from latest snapshot
  // we don't want to take a new snapshot as the values would already be null at this block
  const hour = getIntervalFromTimestamp(event.block.timestamp, HOUR)
  let back = 0
  let latestSnapshot: Snapshot | null = null
  while (!latestSnapshot && back < 24) {
    const id = market.amm.toHexString() + '-' + hour.minus(HOUR.times(BigInt.fromI32(back))).toString()
    latestSnapshot = Snapshot.load(id)
    back += 1
  }

  if (!latestSnapshot) {
    log.error('Could not find a snapshot within 24 hours for collect fees for {} at {} (time: {})', [
      event.address.toHexString(),
      event.transaction.hash.toHexString(),
      event.block.timestamp.toString(),
    ])
  }
  const feeCollected = new CollectedFee(event.transaction.hash.concatI32(event.logIndex.toI32()))
  feeCollected.market = event.address
  feeCollected.borrowingFees = toDecimal(event.params.amount, '18')
  feeCollected.ammCollateralFees = latestSnapshot ? latestSnapshot.collateralAdminFees : BigDecimal.zero()
  feeCollected.ammCollateralFeesUsd = latestSnapshot
    ? latestSnapshot.collateralAdminFees.times(latestSnapshot.oraclePrice)
    : BigDecimal.zero()
  feeCollected.ammBorrowingFees = latestSnapshot ? latestSnapshot.crvUsdAdminFees : BigDecimal.zero()
  feeCollected.blockNumber = event.block.number
  feeCollected.blockTimestamp = event.block.timestamp
  feeCollected.transactionHash = event.transaction.hash
  feeCollected.save()
}

export function handleCreateLoanExtended(call: Create_loan_extendedCall): void {
  const leverage = new Leverage(call.transaction.hash)
  leverage.transactionHash = call.transaction.hash
  leverage.blockNumber = call.block.number
  leverage.blockTimestamp = call.block.timestamp
  leverage.user = call.from
  leverage.market = call.to
  leverage.receivedCollateral = BigDecimal.zero()
  leverage.leverage = BigDecimal.zero()
  const market = Market.load(call.to)
  if (!market) {
    log.error('Unable to find market {} for leverage tx at {}', [
      call.to.toHexString(),
      call.transaction.hash.toHexString(),
    ])
    return
  }
  const precision = market.collateralPrecision.toString()
  leverage.depositedCollateral = toDecimal(call.inputs.collateral, precision)
  // hackish but no other way to retrieve event data
  let borrow: Borrow | null
  for (let i = 0; i < 1024; i++) {
    borrow = Borrow.load(call.transaction.hash.concatI32(i))
    if (borrow) {
      break
    }
  }
  if (borrow) {
    leverage.receivedCollateral = toDecimal(borrow.collateralIncrease, precision)
    leverage.leverage = leverage.receivedCollateral.gt(BigDecimal.zero())
      ? leverage.receivedCollateral.div(leverage.depositedCollateral)
      : BigDecimal.zero()
  }
  leverage.save()
}
