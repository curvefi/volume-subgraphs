import {
  AddMarket as AddMarketEvent,
  SetDebtCeiling as SetDebtCeilingEvent,
  MintForMarket as MintForMarketEvent,
  RemoveFromMarket as RemoveFromMarketEvent,
} from '../generated/crvUSDControllerFactory/crvUSDControllerFactory'
import { Amm, Burn, DebtCeiling, Market, Mint } from '../generated/schema'
import { BigDecimal, BigInt, Bytes, log } from '@graphprotocol/graph-ts'
import {
  Llamma as LlammaTemplate,
  ControllerTemplate,
  MonetaryPolicy as MonetaryPolicyTemplate,
} from '../generated/templates'
import { getOrCreatePolicy } from './services/policies'
import { Llamma as LlamaAbi } from '../generated/templates/Llamma/Llamma'
import { getDecimals, getName } from './services/erc20'
import { getPlatform } from './services/platform'

export function handleAddMarket(event: AddMarketEvent): void {

  const market = new Market(event.params.controller)
  market.collateral = event.params.collateral
  market.collateralPrecision = getDecimals(event.params.collateral)
  market.collateralName = getName(event.params.collateral)
  market.controller = event.params.controller
  market.monetaryPolicy = event.params.monetary_policy

  market.index = event.params.ix

  market.blockNumber = event.block.number
  market.blockTimestamp = event.block.timestamp
  market.transactionHash = event.transaction.hash
  market.amm = event.params.amm

  log.info('New market deployed. Collateral: {}, Controller: {}, AMM: {}, Monetary Policy: {}', [
    market.collateral.toHexString(),
    market.controller.toHexString(),
    market.amm.toHexString(),
    market.monetaryPolicy.toHexString(),
  ])

  ControllerTemplate.create(event.params.controller)

  const amm = new Amm(event.params.amm)
  const ammContract = LlamaAbi.bind(event.params.amm)

  const platform = getPlatform()

  const amms = platform.ammAddresses
  amms.push(event.params.amm)
  platform.ammAddresses = amms
  platform.save()

  amm.A = ammContract.A()
  amm.coins = new Array<Bytes>()
  amm.coinDecimals = new Array<BigInt>()
  amm.coinNames = new Array<string>()
  amm.basePrice = ammContract.get_base_price()

  amm.totalSwapVolume = BigDecimal.zero()
  amm.totalDepositVolume = BigDecimal.zero()
  amm.totalVolume = BigDecimal.zero()

  const coins = amm.coins
  const coinDecimals = amm.coinDecimals
  const coinNames = amm.coinNames

  let i = 0
  let coinResult = ammContract.try_coins(BigInt.fromI32(i))

  while (!coinResult.reverted) {
    coins.push(coinResult.value)
    coinNames.push(getName(coinResult.value))
    coinDecimals.push(getDecimals(coinResult.value))
    i += 1
    coinResult = ammContract.try_coins(BigInt.fromI32(i))
  }

  amm.coins = coins
  amm.coinNames = coinNames
  amm.coinDecimals = coinDecimals

  amm.priceOracle = ammContract.price_oracle_contract()
  amm.fee = ammContract.fee()
  amm.adminFee = ammContract.admin_fee()

  amm.market = event.params.controller
  amm.save()
  LlammaTemplate.create(event.params.amm)

  const policy = getOrCreatePolicy(event.params.monetary_policy)
  MonetaryPolicyTemplate.create(event.params.monetary_policy)

  market.save()
}

export function handleSetDebtCeiling(event: SetDebtCeilingEvent): void {
  log.info('Debt ceiling set for {} at {}', [event.params.addr.toHexString(), event.transaction.hash.toHexString()])

  const ceiling = new DebtCeiling(event.transaction.hash.concatI32(event.logIndex.toI32()))
  ceiling.addr = event.params.addr
  ceiling.debtCeiling = event.params.debt_ceiling

  ceiling.blockNumber = event.block.number
  ceiling.blockTimestamp = event.block.timestamp
  ceiling.transactionHash = event.transaction.hash

  ceiling.save()
}

export function handleMintForMarket(event: MintForMarketEvent): void {
  const mint = new Mint(event.transaction.hash.concatI32(event.logIndex.toI32()))
  log.info('Mint {} for {}', [event.params.amount.toString(), event.params.addr.toHexString()])
  mint.addr = event.params.addr
  mint.amount = event.params.amount
  mint.blockNumber = event.block.number
  mint.blockTimestamp = event.block.timestamp
  mint.transactionHash = event.transaction.hash
  mint.save()
}

export function handleRemoveFromMarket(event: RemoveFromMarketEvent): void {
  const burn = new Burn(event.transaction.hash.concatI32(event.logIndex.toI32()))
  log.info('Burn {} for {}', [event.params.amount.toString(), event.params.addr.toHexString()])
  burn.addr = event.params.addr
  burn.amount = event.params.amount
  burn.blockNumber = event.block.number
  burn.blockTimestamp = event.block.timestamp
  burn.transactionHash = event.transaction.hash
  burn.save()
}
