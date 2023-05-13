import { Pool, TokenSnapshot, DailyPoolSnapshot } from '../../generated/schema'
import { Address, BigDecimal, BigInt, ethereum, log } from '@graphprotocol/graph-ts'
import { DAY, getIntervalFromTimestamp, HOUR } from 'utils/time'
import { BIG_DECIMAL_1E18, BIG_DECIMAL_ZERO, BIG_INT_ZERO, CTOKENS, FEE_PRECISION } from 'const'
import { BigDecimalToBigInt, bytesToAddress } from 'utils'
import { getPlatform } from './platform'
import { CurvePoolV2 } from '../../generated/templates/RegistryTemplate/CurvePoolV2'
import { exponentToBigDecimal } from 'utils/maths'
import { CurvePoolCoin128 } from '../../generated/templates/RegistryTemplate/CurvePoolCoin128'
import { ERC20 } from '../../generated/AddressProvider/ERC20'
import { CurveLendingPool } from '../../generated/templates/RegistryTemplate/CurveLendingPool'

export function getPoolLpTokenTotalSupply(pool: Pool): BigDecimal {
  const lpToken = bytesToAddress(pool.lpToken)
  const tokenContract = ERC20.bind(lpToken)
  const supplyResult = tokenContract.try_totalSupply()
  return supplyResult.reverted ? BIG_DECIMAL_ZERO : supplyResult.value.toBigDecimal().div(BIG_DECIMAL_1E18)
}

function getReserves(pool: Pool, dailySnapshot: DailyPoolSnapshot, poolContract: CurvePoolV2, timestamp: BigInt): void {
  const reserves = dailySnapshot.reserves
  const normalizedReserves = dailySnapshot.normalizedReserves

  for (let j = 0; j < pool.coins.length; j++) {
    let balance = BIG_INT_ZERO
    let balanceResult = poolContract.try_balances(BigInt.fromI32(j))
    if (balanceResult.reverted) {
      log.warning('Unable to fetch balances for {}, trying with int128 ABI', [pool.id])
      const poolContract128 = CurvePoolCoin128.bind(Address.fromString(pool.id))
      balanceResult = poolContract128.try_balances(BigInt.fromI32(j))
      if (!balanceResult.reverted) {
        balance = balanceResult.value
      }
    } else {
      balance = balanceResult.value
    }
    reserves.push(balance)
    const currentCoin = bytesToAddress(pool.coins[j])
    // need to handle the fact that balances doesn't actually return token balance
    // for cTokens
    const isCToken = CTOKENS.includes(currentCoin.toHexString())
    if (isCToken) {
      const tokenContract = ERC20.bind(currentCoin)
      const balanceResult = tokenContract.try_balanceOf(Address.fromString(pool.id))
      balance = balanceResult.reverted ? balance : balanceResult.value
    }
    // handle "normalized" reserves: all balances normalized to 1e18
    // and including exchange rate for c tokens
    normalizedReserves.push(
      isCToken
        ? BigDecimalToBigInt(
            balance.toBigDecimal().div(exponentToBigDecimal(pool.coinDecimals[j])).times(BIG_DECIMAL_1E18)
          )
        : BigDecimalToBigInt(
            balance.toBigDecimal().div(exponentToBigDecimal(pool.coinDecimals[j])).times(BIG_DECIMAL_1E18)
          )
    )
  }
  dailySnapshot.reserves = reserves
  dailySnapshot.normalizedReserves = normalizedReserves
}

function createNewSnapshot(snapId: string): DailyPoolSnapshot {
  const dailySnapshot = new DailyPoolSnapshot(snapId)
  dailySnapshot.reserves = new Array<BigInt>()
  dailySnapshot.normalizedReserves = new Array<BigInt>()
  dailySnapshot.fee = BIG_DECIMAL_ZERO
  dailySnapshot.adminFee = BIG_DECIMAL_ZERO
  dailySnapshot.offPegFeeMultiplier = BIG_DECIMAL_ZERO
  dailySnapshot.A = BIG_INT_ZERO
  dailySnapshot.xcpProfit = BIG_DECIMAL_ZERO
  dailySnapshot.xcpProfitA = BIG_DECIMAL_ZERO
  dailySnapshot.timestamp = BIG_INT_ZERO
  return dailySnapshot
}

export function getOffPegFeeMultiplierResult(pool: Address): ethereum.CallResult<BigInt> {
  const testLending = CurveLendingPool.bind(pool)
  return testLending.try_offpeg_fee_multiplier()
}

export function takePoolSnapshots(timestamp: BigInt): void {
  log.warning('Taking pool snapshots for {}', [timestamp.toString()])
  const platform = getPlatform()
  const time = getIntervalFromTimestamp(timestamp, DAY)
  if (platform.latestPoolSnapshot == time) {
    return
  }

  for (let i = 0; i < platform.poolAddresses.length; ++i) {
    const poolAddress = platform.poolAddresses[i]
    const pool = Pool.load(poolAddress.toHexString())
    if (!pool) {
      return
    }
    const snapId = pool.id + '-' + time.toString()
    if (!DailyPoolSnapshot.load(snapId)) {
      const dailySnapshot = createNewSnapshot(snapId)
      dailySnapshot.pool = pool.id
      const poolContract = CurvePoolV2.bind(Address.fromString(pool.id))
      const virtualPriceResult = poolContract.try_get_virtual_price()
      let vPrice = BIG_DECIMAL_ZERO
      if (virtualPriceResult.reverted) {
        log.warning('Unable to fetch virtual price for pool {}', [pool.id])
      } else {
        vPrice = virtualPriceResult.value.toBigDecimal()
      }
      dailySnapshot.virtualPrice = vPrice

      getReserves(pool, dailySnapshot, poolContract, timestamp)

      // fetch params
      const AResult = poolContract.try_A()
      dailySnapshot.A = AResult.reverted ? BIG_INT_ZERO : AResult.value
      const offPegFeeResult = getOffPegFeeMultiplierResult(bytesToAddress(poolAddress))
      dailySnapshot.offPegFeeMultiplier = offPegFeeResult.reverted
        ? BIG_DECIMAL_ZERO
        : offPegFeeResult.value.toBigDecimal().div(FEE_PRECISION)

      // compute lpUsdPrice from reserves & lp supply
      dailySnapshot.lpTokenSupply = getPoolLpTokenTotalSupply(pool)

      const feeResult = poolContract.try_fee()
      dailySnapshot.fee = feeResult.reverted ? BIG_DECIMAL_ZERO : feeResult.value.toBigDecimal().div(FEE_PRECISION)

      const adminFeeResult = poolContract.try_admin_fee()
      dailySnapshot.adminFee = adminFeeResult.reverted
        ? BIG_DECIMAL_ZERO
        : adminFeeResult.value.toBigDecimal().div(FEE_PRECISION)

      pool.virtualPrice = vPrice

      pool.save()
      dailySnapshot.save()
    }
  }
}
