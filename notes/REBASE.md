## Rebasing tokens deductible rate

Rebasing tokens carry an APR that is included in the base APR calculated as the pool's virtual price growth rate. To estimate fees generated from swaps and liquidity events, the rebase APR needs to be deducted from the virtual price growth rate.

The deductible APR however needs to be scaled as it may only apply to some of the tokens in the pool (or different tokens may have different rebasing APRs)

### stETH

For the LIDO stETH pools, the APR is calculated based on the growth rate of total pooled Ether calculated from the values returned by the stETH oracle.

`(postTotalPooledEther - preTotalPooledEther) / preTotalPooledEther`

### aTokens

For the aToken pools, we get each token's APR by computing the growth rate of the ratio `totalSupply / scaledTotalSupply` based on the values obtained from the tokens' contracts.
