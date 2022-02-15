import { Address, BigDecimal, BigInt } from '@graphprotocol/graph-ts'

export const CURVE_PLATFORM_ID = 'Curve'

export const BIG_DECIMAL_1E8 = BigDecimal.fromString('1e8')
export const BIG_DECIMAL_1E18 = BigDecimal.fromString('1e18')
export const BIG_DECIMAL_ZERO = BigDecimal.fromString('0')
export const BIG_DECIMAL_ONE = BigDecimal.fromString('1')
export const BIG_DECIMAL_TWO = BigDecimal.fromString('2')

export const BIG_INT_ZERO = BigInt.fromString('0')
export const BIG_INT_ONE = BigInt.fromString('1')

export const NATIVE_PLACEHOLDER_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'
export const NATIVE_PLACEHOLDER = Address.fromString(NATIVE_PLACEHOLDER_ADDRESS)
export const NATIVE_TOKEN = '{{ native_token }}'
export const NATIVE_TOKEN_ADDRESS = Address.fromString(NATIVE_TOKEN)
export const ADDRESS_ZERO = Address.fromString('0x0000000000000000000000000000000000000000')

export const THREE_CRV_TOKEN = '{{ three_crv_token }}'
export const THREE_CRV_ADDRESS = Address.fromString(THREE_CRV_TOKEN)

export const WETH_TOKEN = '{{ weth_token }}'
export const WBTC_TOKEN = '{{ wbtc_token }}'
export const USDT_TOKEN = '{{ usdt_token }}'
export const WETH_ADDRESS = Address.fromString(WETH_TOKEN)
export const USDT_ADDRESS = Address.fromString(USDT_TOKEN)
export const WBTC_ADDRESS = Address.fromString(WBTC_TOKEN)

// for Forex and EUR pool, map lp token to Chainlink price feed
export const EURT_LP_TOKEN = '0xfd5db7463a3ab53fd211b4af195c5bccc1a03890'
export const EURS_LP_TOKEN = '0x194ebd173f6cdace046c53eacce9b953f28411d1'
export const EURN_LP_TOKEN = '0x3fb78e61784c9c637d560ede23ad57ca1294c14a'

// Fixed forex proper
export const EUR_LP_TOKEN = '0x19b080fe1ffa0553469d20ca36219f17fcf03859'
export const JPY_LP_TOKEN = '0x8818a9bb44fbf33502be7c15c500d0c783b73067'
export const KRW_LP_TOKEN = '0x8461a004b50d321cb22b7d034969ce6803911899'
export const GBP_LP_TOKEN = '0xd6ac1cb9019137a896343da59dde6d097f710538'
export const AUD_LP_TOKEN = '0x3f1b0278a9ee595635b61817630cc19de792f506'
export const CHF_LP_TOKEN = '0x9c2c8910f113181783c249d8f6aa41b51cde0f0c'

// Mixed USDT-forex (USDT-Forex) pools
export const EURS_USDC_LP_TOKEN = '0x3d229e1b4faab62f621ef2f6a610961f7bd7b23b'
export const EURT_USDT_LP_TOKEN = '0x3b6831c0077a1e44ed0a21841c3bc4dc11bce833'

// On chains like avalanche, pools use aave synthetics instead of the wrapped tokens
export const SIDECHAIN_SUBSTITUTES = new Map<string, Address>()
SIDECHAIN_SUBSTITUTES.set('0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'.toLowerCase(), NATIVE_TOKEN_ADDRESS)
SIDECHAIN_SUBSTITUTES.set('0x686bef2417b6dc32c50a3cbfbcc3bb60e1e9a15d', WBTC_ADDRESS)
SIDECHAIN_SUBSTITUTES.set('0x53f7c5869a859f0aec3d334ee8b4cf01e3492f21', WETH_ADDRESS)

// On certain chains, metapools were created by the deployer, not the factory
// and don't implement the `base_pool` method, so the graph has no way of knowing
// they're metapools. need a manual mapping
export const UNKNOWN_METAPOOLS = new Map<string, Address>()
UNKNOWN_METAPOOLS.set(
  '0x92d5ebf3593a92888c25c0abef126583d4b5312e',
  Address.fromString('0x27E611FD27b276ACbd5Ffd632E5eAEBEC9761E40')
)

export const FOREX_ORACLES = new Map<string, Address>()
FOREX_ORACLES.set(EURT_USDT_LP_TOKEN, Address.fromString('0xb49f677943BC038e9857d61E7d053CaA2C1734C1'))
FOREX_ORACLES.set(EURS_USDC_LP_TOKEN, Address.fromString('0xb49f677943BC038e9857d61E7d053CaA2C1734C1'))
FOREX_ORACLES.set(EURT_LP_TOKEN, Address.fromString('0xb49f677943BC038e9857d61E7d053CaA2C1734C1'))
FOREX_ORACLES.set(EURS_LP_TOKEN, Address.fromString('0xb49f677943BC038e9857d61E7d053CaA2C1734C1'))
FOREX_ORACLES.set(EURN_LP_TOKEN, Address.fromString('0xb49f677943BC038e9857d61E7d053CaA2C1734C1'))
FOREX_ORACLES.set(EUR_LP_TOKEN, Address.fromString('0xb49f677943BC038e9857d61E7d053CaA2C1734C1'))
FOREX_ORACLES.set(KRW_LP_TOKEN, Address.fromString('0x01435677FB11763550905594A16B645847C1d0F3'))
FOREX_ORACLES.set(JPY_LP_TOKEN, Address.fromString('0xBcE206caE7f0ec07b545EddE332A47C2F75bbeb3'))
FOREX_ORACLES.set(GBP_LP_TOKEN, Address.fromString('0x5c0Ab2d9b5a7ed9f470386e82BB36A3613cDd4b5'))
FOREX_ORACLES.set(AUD_LP_TOKEN, Address.fromString('0x77F9710E7d0A19669A13c055F62cd80d313dF022'))
FOREX_ORACLES.set(CHF_LP_TOKEN, Address.fromString('0x449d117117838fFA61263B61dA6301AA2a88B13A'))

export const SUSHI_FACTORY = '{{ unifork_1_factory }}'
export const SUSHI_FACTORY_ADDRESS = Address.fromString(SUSHI_FACTORY)

export const UNI_FACTORY = '{{ unifork_2_factory }}'
export const UNI_FACTORY_ADDRESS = Address.fromString(UNI_FACTORY)
export const UNI_V3_FACTORY = '{{ uni_v3_factory }}'
export const UNI_V3_FACTORY_ADDRESS = Address.fromString(UNI_V3_FACTORY)
export const UNI_V3_QUOTER = '{{ uni_v3_quoter }}'
export const UNI_V3_QUOTER_ADDRESS = Address.fromString(UNI_V3_QUOTER)

export const CURVE_REGISTRY = Address.fromString('0x90e00ace148ca3b23ac1bc8c240c2a7dd9c2d7f5')
export const CURVE_REGISTRY_V2 = Address.fromString('0x4AacF35761d06Aa7142B9326612A42A2b9170E33')
export const CURVE_FACTORY_V1 = Address.fromString('0x0959158b6040d32d04c301a72cbfd6b39e21c9ae')
export const CURVE_FACTORY_V1_2 = Address.fromString('0xb9fc157394af804a3578134a6585c0dc9cc990d4')
export const CURVE_FACTORY_V2 = Address.fromString('0xf18056bbd320e96a48e3fbf8bc061322531aac99')

export const TRIPOOL_ADDRESS = Address.fromString('0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7')

export const TRICRYPTO2_POOL = '{{ tricrypto2_pool }}'
export const TRICRYPTO2_POOL_ADDRESS = Address.fromString(TRICRYPTO2_POOL)
// Pools that are v2 but were originally added to v1 registry
export const EURT_USD_POOL = Address.fromString('0x9838eCcC42659FA8AA7daF2aD134b53984c9427b')
export const EURS_USDC_POOL = Address.fromString('0x98a7F18d4E56Cfe84E3D081B40001B3d5bD3eB8B')
export const TRICRYPTO_V1_POOL = Address.fromString('0x80466c64868E1ab14a1Ddf27A676C3fcBE638Fe5')
export const EARLY_V2_POOLS = [TRICRYPTO2_POOL_ADDRESS, EURS_USDC_POOL, EURT_USD_POOL]

export const FACTORY_V10 = 'FACTORY_V10'
export const FACTORY_V12 = 'FACTORY_V12'
export const FACTORY_V20 = 'FACTORY_V20'
export const CRYPTO_FACTORY = 'CRYPTO_FACTORY'
export const STABLE_FACTORY = 'STABLE_FACTORY'
export const REGISTRY_V1 = 'REGISTRY_V1'
export const REGISTRY_V2 = 'REGISTRY_V2'
export const LENDING = 'LENDING'
