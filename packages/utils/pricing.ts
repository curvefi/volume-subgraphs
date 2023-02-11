import { Address, BigDecimal, BigInt, log } from '@graphprotocol/graph-ts'
import {
  ADDRESS_ZERO,
  BIG_DECIMAL_1E18,
  BIG_DECIMAL_ONE,
  CRV_FRAX_ADDRESS,
  FRAXBP_ADDRESS,
  BIG_DECIMAL_ZERO,
  BIG_INT_ZERO,
  CTOKENS,
  SIDECHAIN_SUBSTITUTES,
  SUSHI_FACTORY_ADDRESS,
  THREE_CRV_ADDRESS,
  UNI_FACTORY_ADDRESS,
  UNI_V3_FACTORY_ADDRESS,
  UNI_V3_QUOTER_ADDRESS,
  USDT_ADDRESS,
  WBTC_ADDRESS,
  WETH_ADDRESS,
  YTOKENS, TRIPOOL_ADDRESS
} from 'const'
import { Factory } from '../../subgraphs/volume/generated/templates/CurvePoolTemplateV2/Factory'
import { Pair } from '../../subgraphs/volume/generated/templates/CurvePoolTemplateV2/Pair'
import { exponentToBigDecimal, exponentToBigInt } from './maths'
import { FactoryV3 } from '../../subgraphs/volume/generated/templates/CurvePoolTemplateV2/FactoryV3'
import { Quoter } from '../../subgraphs/volume/generated/templates/CurvePoolTemplateV2/Quoter'
import { ERC20 } from '../../subgraphs/volume/generated/templates/CurvePoolTemplateV2/ERC20'
import { CToken } from '../../subgraphs/volume/generated/templates/CurvePoolTemplateV2/CToken'
import { YToken } from '../../subgraphs/volume/generated/templates/CurvePoolTemplateV2/YToken'
import { CurvePoolV2 } from '../../subgraphs/volume/generated/templates/RegistryTemplate/CurvePoolV2'

export function getRateFromUniFork(token: Address, numeraire: Address, factoryContract: Address): BigDecimal {
  const factory = Factory.bind(factoryContract)
  const address = factory.getPair(token, numeraire)
  if (address == ADDRESS_ZERO) {
    log.debug('No pair found for {} on {}', [token.toHexString(), factoryContract.toHexString()])
    return BIG_DECIMAL_ZERO
  }
  const pair = Pair.bind(address)
  const reserves = pair.getReserves()
  // if reserves are below a certain threshold we consider them invalid
  // ideally we'd account for different decimals, but this would increase
  // number of calls. so we only filter for a common lower denom for dust.
  if (reserves.value1.lt(BigInt.fromI32(100000000)) || reserves.value0.lt(BigInt.fromI32(100000000))) {
    log.debug('Low reserves found for {} on {}', [token.toHexString(), factoryContract.toHexString()])
    return BIG_DECIMAL_ZERO
  }
  const price =
    pair.token0() == numeraire
      ? reserves.value0.toBigDecimal().times(BIG_DECIMAL_1E18).div(reserves.value1.toBigDecimal())
      : reserves.value1.toBigDecimal().times(BIG_DECIMAL_1E18).div(reserves.value0.toBigDecimal())

  return price.div(BIG_DECIMAL_1E18)
}

export function getNumeraireRate(token: Address, numeraire: Address): BigDecimal {

  if (token != numeraire) {
    const sushiPrice = getRateFromUniFork(token, numeraire, SUSHI_FACTORY_ADDRESS)
    if (sushiPrice != BIG_DECIMAL_ZERO) {
      return sushiPrice
    }
    const uniV2Price = getRateFromUniFork(token, numeraire, UNI_FACTORY_ADDRESS)
    if (uniV2Price != BIG_DECIMAL_ZERO) {
      return uniV2Price
    }
    log.debug('No Uni v2 pair found for {}', [token.toHexString()])
    return getRateUniV3(token, numeraire)
  }
  return BIG_DECIMAL_ONE
}

export function getEthRate(token: Address): BigDecimal {
  return getNumeraireRate(token, WETH_ADDRESS)
}

export function getRateUniV3(token: Address, numeraire: Address): BigDecimal {
  const factory = FactoryV3.bind(UNI_V3_FACTORY_ADDRESS)
  let fee = 3000
  // first try the 0.3% pool
  let poolCall = factory.try_getPool(token, numeraire, fee)
  if (poolCall.reverted || poolCall.value == ADDRESS_ZERO) {
    log.debug('No Uni v3 pair (.3%) found for {}', [token.toHexString()])
    // if it fails, try 1%
    fee = 10000
    poolCall = factory.try_getPool(token, numeraire, fee)
    if (poolCall.reverted || poolCall.value == ADDRESS_ZERO) {
      log.debug('No Uni v3 pair (1%) found for {}', [token.toHexString()])
      return BIG_DECIMAL_ZERO
    }
  }
  const quoter = Quoter.bind(UNI_V3_QUOTER_ADDRESS)
  const decimals = getDecimals(token)
  const rate = quoter.try_quoteExactInputSingle(token, numeraire, fee, exponentToBigInt(decimals), BIG_INT_ZERO)
  if (!rate.reverted) {
    log.debug('Rate for {}: {}', [token.toHexString(), rate.value.toString()])
    return rate.value.toBigDecimal().div(exponentToBigDecimal(decimals))
  }
  log.error('Error getting a quote for {} at fee {}', [token.toHexString(), fee.toString()])
  return BIG_DECIMAL_ZERO
}

export function getDecimals(token: Address): BigInt {
  const tokenContract = ERC20.bind(token)
  const decimalsResult = tokenContract.try_decimals()
  return decimalsResult.reverted ? BigInt.fromI32(18) : BigInt.fromI32(decimalsResult.value)
}

export function getName(token: Address): string {
  const tokenContract = ERC20.bind(token)
  const nameResult = tokenContract.try_symbol()
  return nameResult.reverted ? token.toHexString().slice(0, 6) : nameResult.value
}

// Computes the value of one unit of Token A in units of Token B
// Only works if both tokens have an ETH pair on Sushi
export function getTokenAValueInTokenB(tokenA: Address, tokenB: Address): BigDecimal {
  if (tokenA == tokenB) {
    return BIG_DECIMAL_ONE
  }
  const decimalsA = getDecimals(tokenA)
  const decimalsB = getDecimals(tokenB)
  const ethRateA = getEthRate(tokenA).times(BIG_DECIMAL_1E18)
  const ethRateB = getEthRate(tokenB).times(BIG_DECIMAL_1E18)
  if (ethRateB == BIG_DECIMAL_ZERO) {
    log.error('Error calculating rate for token A {} ({}) and token B {} ({})', [
      tokenA.toHexString(),
      ethRateA.toString(),
      tokenB.toHexString(),
      ethRateB.toString(),
    ])
    return BIG_DECIMAL_ZERO
  }
  return ethRateA.div(ethRateB).times(exponentToBigDecimal(decimalsA)).div(exponentToBigDecimal(decimalsB))
}

export function getCTokenExchangeRate(token: Address): BigDecimal {
  const ctoken = CToken.bind(token)
  const underlyingResult = ctoken.try_underlying()
  const exchangeRateResult = ctoken.try_exchangeRateStored()
  if (underlyingResult.reverted || exchangeRateResult.reverted) {
    // if fail we use the beginning rate
    log.error('Failed to get underlying or rate for ctoken {}', [token.toHexString()])
    return BigDecimal.fromString('0.02')
  }
  const underlying = underlyingResult.value
  const exchangeRate = exchangeRateResult.value
  const underlyingDecimalsResult = ERC20.bind(underlying).try_decimals()
  const underlyingDecimals = underlyingDecimalsResult.reverted ? 18 : underlyingDecimalsResult.value
  // scaling formula: https://compound.finance/docs/ctokens
  const rateScale = exponentToBigDecimal(BigInt.fromI32(10 + underlyingDecimals))
  return exchangeRate.toBigDecimal().div(rateScale)
}

export function getYTokenExchangeRate(token: Address): BigDecimal {
  const yToken = YToken.bind(token)
  const pricePerShareResult = yToken.try_getPricePerFullShare()
  if (pricePerShareResult.reverted) {
    // if fail we use 1
    log.error('Failed to get underlying or rate for yToken {}', [token.toHexString()])
    return BIG_DECIMAL_ONE
  }
  const exchangeRate = pricePerShareResult.value
  return exchangeRate.toBigDecimal().div(BIG_DECIMAL_1E18)
}

export function getFraxBpVirtualPrice(): BigDecimal {
  const poolContract = CurvePoolV2.bind(FRAXBP_ADDRESS)
  const virtualPriceResult = poolContract.try_get_virtual_price()
  let vPrice = BIG_DECIMAL_ONE
  if (virtualPriceResult.reverted) {
    log.warning('Unable to fetch virtual price for FraxBP', [])
  } else {
    vPrice = virtualPriceResult.value.toBigDecimal().div(BIG_DECIMAL_1E18)
  }
  return vPrice
}


export function get3CrvVirtualPrice(): BigDecimal {
  const poolContract = CurvePoolV2.bind(TRIPOOL_ADDRESS)
  const virtualPriceResult = poolContract.try_get_virtual_price()
  let vPrice = BIG_DECIMAL_ONE
  if (virtualPriceResult.reverted) {
    log.warning('Unable to fetch virtual price for TriPool', [])
  } else {
    vPrice = virtualPriceResult.value.toBigDecimal().div(BIG_DECIMAL_1E18)
  }
  return vPrice
}

export function getUsdRate(token: Address): BigDecimal {
  const usdt = BIG_DECIMAL_ONE
  if (SIDECHAIN_SUBSTITUTES.has(token.toHexString())) {
    token = SIDECHAIN_SUBSTITUTES[token.toHexString()]
  }
  if (CTOKENS.includes(token.toHexString())) {
    return getCTokenExchangeRate(token)
  } else if (YTOKENS.includes(token.toHexString())) {
    return getYTokenExchangeRate(token)
  } else if (token == CRV_FRAX_ADDRESS) {
    return getFraxBpVirtualPrice()
  }
  else if (token == THREE_CRV_ADDRESS) {
    return get3CrvVirtualPrice()
  }
  else if (token != USDT_ADDRESS) {
    let usdPrice = getTokenAValueInTokenB(token, USDT_ADDRESS)
    // if it fails we try to go directly via a stable pair
    if (usdPrice == BIG_DECIMAL_ZERO) {
      usdPrice = getNumeraireRate(token, USDT_ADDRESS)
      // TODO: add attempt to price in native token if still fails
    }
    return usdPrice
  }
  return usdt
}

export function getBtcRate(token: Address): BigDecimal {
  const wbtc = BIG_DECIMAL_ONE

  if (token != WBTC_ADDRESS) {
    return getTokenAValueInTokenB(token, WBTC_ADDRESS)
  }

  return wbtc
}
