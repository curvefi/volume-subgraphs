import {
  Amm,
  PegKeeper,
  MonetaryPolicy as MonetaryPolicyEntity,
  Market,
  Snapshot,
  Band,
  VolumeSnapshot,
} from '../../generated/schema'

import { Address, BigDecimal, BigInt, Bytes, ethereum, log } from '@graphprotocol/graph-ts'
import { DAY, getIntervalFromTimestamp, HOUR, YEAR } from './time'
import { Multicall } from '../../generated/templates/Llamma/Multicall'
import { MonetaryPolicy } from '../../generated/templates/Llamma/MonetaryPolicy'
import { getBalanceOf, getDecimals } from './erc20'
import { getPlatform } from './platform'
import { takeUserStateSnapshot } from './userstate'

const MULTICALL = '0xeefba1e63905ef1d7acba5a8513c70307c1ce441'
const CRVUSD = Address.fromString('0xf939E0A03FB07F59A73314E73794Be0E57ac1b4E')
const multicall = Multicall.bind(Address.fromString(MULTICALL))
export const BIG_DECIMAL_TWO = BigDecimal.fromString('2')
export const BIG_DECIMAL_ONE = BigDecimal.fromString('1')
export const MAX_U256 = BigInt.fromString(
  '115792089237316195423570985008687907853269984665640564039457584007913129639935'
)

// a fast approximation of (1 + rate)^exponent
// https://github.com/messari/subgraphs/blob/fa253e06de13f9b78849efe8da3481d53d92620a/subgraphs/_reference_/src/common/utils/numbers.ts
export function bigDecimalExponential(rate: BigDecimal, exponent: BigDecimal): BigDecimal {
  // binomial expansion to obtain (1 + x)^n : (1 + rate)^exponent
  // 1 + n *x + (n/2*(n-1))*x**2+(n/6*(n-1)*(n-2))*x**3+(n/12*(n-1)*(n-2)*(n-3))*x**4
  // this is less precise, but more efficient than `powerBigDecimal` when power is big
  const firstTerm = exponent.times(rate)
  const secondTerm = exponent.div(BIG_DECIMAL_TWO).times(exponent.minus(BIG_DECIMAL_ONE)).times(rate.times(rate))
  const thirdTerm = exponent
    .div(BigDecimal.fromString('6'))
    .times(exponent.minus(BIG_DECIMAL_TWO))
    .times(rate.times(rate).times(rate))
  const fourthTerm = exponent
    .div(BigDecimal.fromString('12'))
    .times(exponent.minus(BigDecimal.fromString('3')))
    .times(rate.times(rate).times(rate).times(rate))
  return firstTerm.plus(secondTerm).plus(thirdTerm).plus(fourthTerm)
}

// Aggregate calls to single contract
export function aggregateCalls(target: Address, inputValueTypes: string[][]): BigInt[] | null {
  const params: Array<ethereum.Tuple> = []
  for (let i = 0; i < inputValueTypes.length; i++) {
    params.push(
      changetype<ethereum.Tuple>([
        ethereum.Value.fromAddress(target),
        ethereum.Value.fromBytes(Bytes.fromHexString(inputValueTypes[i][0])),
      ])
    )
  }
  const callResult = multicall.tryCall('aggregate', 'aggregate((address,bytes)[]):(uint256,bytes[])', [
    ethereum.Value.fromTupleArray(params),
  ])
  if (callResult.reverted) {
    return null
  }
  const multiResults = callResult.value[1].toBytesArray()
  const intResults: Array<BigInt> = []
  for (let i = 0; i < multiResults.length; i++) {
    const res = ethereum.decode(inputValueTypes[i][1], multiResults[i])
    intResults.push(res ? res.toBigInt() : BigInt.zero())
  }
  return intResults
}

export function toDecimal(number: BigInt, decimals: string): BigDecimal {
  return number.toBigDecimal().div(BigDecimal.fromString('1e' + decimals))
}

export function getVolumeSnapshot(timestamp: BigInt, period: BigInt, llamma: Address): VolumeSnapshot {
  const interval = getIntervalFromTimestamp(timestamp, period)
  const volId = llamma.toHexString() + '-' + period.toString() + '-' + interval.toString()
  let volumeSnapshot = VolumeSnapshot.load(volId)
  if (!volumeSnapshot) {
    volumeSnapshot = new VolumeSnapshot(volId)
    volumeSnapshot.llamma = llamma
    volumeSnapshot.amountBoughtUSD = BigDecimal.zero()
    volumeSnapshot.amountSoldUSD = BigDecimal.zero()
    volumeSnapshot.swapVolumeUSD = BigDecimal.zero()
    volumeSnapshot.amountDepositedUSD = BigDecimal.zero()
    volumeSnapshot.amountWithdrawnUSD = BigDecimal.zero()
    volumeSnapshot.count = BigInt.zero()
    volumeSnapshot.timestamp = timestamp
    volumeSnapshot.roundedTimestamp = interval
    volumeSnapshot.period = period
    volumeSnapshot.save()
  }
  return volumeSnapshot
}

function getInfoFromLlamma(snapshot: Snapshot, precision: string): void {
  const signaturesAmm = [
    ['0x2c4e722e', 'uint256'], // rate()
    ['0xd1fea733', 'uint256'], // admin_fees_x()
    ['0x89960ba7', 'uint256'], // admin_fees_y()
    ['0xaaa615fc', 'int256'], // max_band()
    ['0xca72a821', 'int256'], // min_band()
    ['0x8f8654c5', 'int256'], // active_band()
    ['0xa7db79a5', 'uint256'], // get_base_price()
    ['0xf2388acb', 'uint256'], // get_p()
    ['0x86fc88d3', 'uint256'], // price_oracle()
  ]

  const results = aggregateCalls(Address.fromBytes(snapshot.llamma), signaturesAmm)

  if (!results) {
    log.error('Multicall to Llamma {} failed {}', [snapshot.llamma.toHexString(), snapshot.id])
    snapshot.rate = BigDecimal.zero()
    snapshot.crvUsdAdminFees = BigDecimal.zero()
    snapshot.collateralAdminFees = BigDecimal.zero()
    snapshot.maxBand = BigInt.zero()
    snapshot.minBand = BigInt.zero()
    snapshot.activeBand = BigInt.zero()
    snapshot.basePrice = BigDecimal.zero()
    snapshot.ammPrice = BigDecimal.zero()
    snapshot.oraclePrice = BigDecimal.zero()
    return
  }
  snapshot.rate = bigDecimalExponential(toDecimal(results[0], '18'), YEAR.toBigDecimal())
  snapshot.crvUsdAdminFees = toDecimal(results[1], '18')
  snapshot.collateralAdminFees = toDecimal(results[2], precision)
  snapshot.maxBand = results[3]
  snapshot.minBand = results[4]
  snapshot.activeBand = results[5]
  snapshot.basePrice = toDecimal(results[6], '18')
  snapshot.ammPrice = toDecimal(results[7], '18')
  snapshot.oraclePrice = toDecimal(results[8], '18')
}

function getInfoFromController(snapshot: Snapshot): void {
  const signaturesController = [
    ['0x627d2b83', 'uint256'], // liquidation_discount()
    ['0x5449b9cb', 'uint256'], // loan_discount()
    ['0x6cce39be', 'uint256'], // n_loans()
    ['0x31dc3ca8', 'uint256'], // total_debt()
    ['0x4f02c420', 'uint256'], // minted()
    ['0xe231bff0', 'uint256'], // redeemed()
    ['1b1800e3cf', 'uint256'], // admin_fees()
  ]

  const results = aggregateCalls(Address.fromBytes(snapshot.market), signaturesController)

  if (!results) {
    log.error('Multicall to Controller {} failed {}', [snapshot.market.toHexString(), snapshot.id])
    snapshot.liquidationDiscount = BigDecimal.zero()
    snapshot.loanDiscount = BigDecimal.zero()
    snapshot.nLoans = BigInt.zero()
    snapshot.totalDebt = BigDecimal.zero()
    snapshot.minted = BigDecimal.zero()
    snapshot.redeemed = BigDecimal.zero()
    snapshot.adminBorrowingFees = BigDecimal.zero()
    return
  }

  snapshot.liquidationDiscount = toDecimal(results[0], '18')
  snapshot.loanDiscount = toDecimal(results[1], '18')
  snapshot.nLoans = results[2]
  snapshot.totalDebt = toDecimal(results[3], '18')
  snapshot.minted = toDecimal(results[4], '18')
  snapshot.redeemed = toDecimal(results[5], '18')
  snapshot.adminBorrowingFees = toDecimal(results[6], '18')
}

function getKeepersDebt(policyAddress: Address): BigInt {
  const policy = MonetaryPolicyEntity.load(policyAddress)
  let totalDebt = BigInt.zero()
  if (!policy) {
    log.error('Unable find monetary policy entity for {}', [policyAddress.toHexString()])
    return totalDebt
  }
  for (let i = 0; i < policy.keepers.length; i++) {
    const keeper = PegKeeper.load(policy.keepers[i])
    if (!keeper) {
      log.error('Unable to load keeper entity {} for policy {}', [
        policy.keepers[i].toHexString(),
        policyAddress.toHexString(),
      ])
      continue
    }
    totalDebt = totalDebt.plus(keeper.debt)
  }
  return totalDebt
}

function toHexSignedAndPadded(value: i32): string {
  let bigIntValue = BigInt.fromI32(value)
  if (value < 0) {
    bigIntValue = MAX_U256.plus(bigIntValue.plus(BigInt.fromI32(1)))
  }
  return bigIntValue.toHexString().slice(2).padStart(64, '0')
}

function makeBands(snapshot: Snapshot): void {
  const minBand = snapshot.minBand.toI32()
  const maxBand = snapshot.maxBand.toI32()
  const multiParamBands: string[][] = []
  let currentBand = minBand
  while (currentBand <= maxBand) {
    // bands_x signature with input for current band
    const bandX = '0xebcb0067' + toHexSignedAndPadded(currentBand)
    multiParamBands.push([bandX, 'uint256'])
    // bands_y signature with input for current band
    const bandY = '0x31f7e306' + toHexSignedAndPadded(currentBand)
    multiParamBands.push([bandY, 'uint256'])
    currentBand += 1
  }
  const priceOracleCallData = '0x2eb858e7' + toHexSignedAndPadded(minBand)
  multiParamBands.push([priceOracleCallData, 'uint256'])
  const results = aggregateCalls(Address.fromBytes(snapshot.llamma), multiParamBands)
  if (!results) {
    log.error('Multicall for bands failed {}', [snapshot.id])
    return
  }

  currentBand = minBand
  let priceOracleUp = toDecimal(results[results.length - 1], '18')
  const amp = snapshot.A.toBigDecimal()
  const multiplier = amp.minus(BIG_DECIMAL_ONE).div(amp)

  let resultIndex = 0
  while (currentBand <= maxBand) {
    const band = new Band(snapshot.id + currentBand.toString())
    band.snapshot = snapshot.id
    band.index = BigInt.fromI32(currentBand)
    band.stableCoin = toDecimal(results[resultIndex], '18')
    resultIndex += 1
    band.collateral = toDecimal(results[resultIndex], '18')
    band.collateralUsd = band.collateral.times(snapshot.oraclePrice)
    band.priceOracleUp = priceOracleUp
    priceOracleUp = priceOracleUp.times(multiplier)
    band.priceOracleDown = priceOracleUp
    resultIndex += 1
    currentBand += 1
    band.save()
  }
}

export function takeSnapshots(block: ethereum.Block): void {
  const platform = getPlatform()
  for (let i = 0; i < platform.ammAddresses.length; ++i) {
    const amm = Address.fromBytes(platform.ammAddresses[i])
    const llamma = Amm.load(amm)
    if (!llamma) {
      log.error('Received event from unknown amm {}', [amm.toHexString()])
      continue
    }
    // we snapshot the params every hour but the bands daily
    const hour = getIntervalFromTimestamp(block.timestamp, HOUR)
    const day = getIntervalFromTimestamp(block.timestamp, DAY)
    const id = llamma.id.toHexString() + '-' + hour.toString()
    const market = Market.load(llamma.market)

    if (!market) {
      log.error('Unable to load market {} for amm {}', [llamma.market.toHexString(), llamma.id.toHexString()])
      continue
    }

    const policy = MonetaryPolicy.bind(Address.fromBytes(market.monetaryPolicy))
    let snapshot = Snapshot.load(id)
    if (!snapshot) {
      snapshot = new Snapshot(id)
      snapshot.market = llamma.market
      snapshot.llamma = llamma.id
      snapshot.policy = market.monetaryPolicy

      snapshot.timestamp = block.timestamp
      snapshot.blockNumber = block.number

      snapshot.A = llamma.A
      const precision = market.collateralPrecision.toString()
      getInfoFromController(snapshot)
      getInfoFromLlamma(snapshot, precision)
      // general parameters
      snapshot.fee = toDecimal(llamma.fee, '18')
      snapshot.adminFee = toDecimal(llamma.adminFee, '18')
      const policyRate = policy.rate()
      snapshot.futureRate = bigDecimalExponential(toDecimal(policyRate, '18'), YEAR.toBigDecimal())
      snapshot.totalKeeperDebt = toDecimal(getKeepersDebt(Address.fromBytes(market.monetaryPolicy)), '18')
      snapshot.totalSupply = snapshot.minted.minus(snapshot.redeemed)
      const llammaStableBalance = toDecimal(getBalanceOf(CRVUSD, amm), '18')
      snapshot.available = toDecimal(getBalanceOf(CRVUSD, Address.fromBytes(llamma.market)), '18')
      const llammaCollatBalance = toDecimal(getBalanceOf(Address.fromBytes(market.collateral), amm), precision)
      snapshot.totalStableCoin = llammaStableBalance.minus(snapshot.crvUsdAdminFees)
      snapshot.totalCollateral = llammaCollatBalance.minus(snapshot.collateralAdminFees)
      snapshot.totalCollateralUsd = snapshot.totalCollateral.times(snapshot.oraclePrice)
      snapshot.bandSnapshot = false
      snapshot.userStateSnapshot = false
      if (hour == day) {
        snapshot.bandSnapshot = true
        makeBands(snapshot)
      } else if (((hour.toI32() - day.toI32()) / HOUR.toI32()) % 4 == 0) {
        takeUserStateSnapshot(snapshot)
        snapshot.userStateSnapshot = true
      }
      snapshot.save()
    }
  }
}
