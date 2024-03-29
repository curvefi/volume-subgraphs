## Rebasing tokens deductible rate

Rebasing tokens carry an APR that is included in the base APR calculated as the pool's virtual price growth rate. To estimate fees generated from swaps and liquidity events, the rebase APR needs to be deducted from the virtual price growth rate.

The deductible APR however needs to be scaled as it may only apply to some of the tokens in the pool (or different tokens may have different rebasing APRs)

### stETH

For the LIDO stETH pools, the APR is calculated based on the growth rate of total pooled Ether calculated from the values returned by the stETH oracle.

`(postTotalPooledEther - preTotalPooledEther) / preTotalPooledEther`

### aTokens

For the aToken pools, we get each token's APR by computing the growth rate of the ratio `totalSupply / scaledTotalSupply` based on the values obtained from the tokens' contracts.

### cTokens

For cTokens pools, we get the daily growth rate of the cToken's exchange rate (available in the token's snapshots as they are used for volume accounting) and deduct in proportion of each token's ratio in the pool.

### yTokens

For yTokens pools, the logic is the same as for cTokens (growth rate of exchange rate)

### USDN

For the USDN pool, we track the token's contract and the events for reward updates. We then use the daily growth rate of rewards as deductible APR.

Note: we also need to handle the fact that all rewards for the USDN pool are claimed by the burner contract before being redistributed 50/50 to LPs and DAO.

### AETH

For the Ankr ETH pool, we track the token's contract and the events that broadcast updates to the redeemability ratio. We use the inverse growth rate of the ratio as deductible APR.
