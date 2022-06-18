import fetch from 'node-fetch'
import readline from 'readline'

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
})

const GRAPH_ENDPOINT = 'https://api.thegraph.com/subgraphs/name/convex-community/volume-mainnet-staging'
const POOL_PRICE_QUERY = `
{
  pools(first: 1000) {
    id
    name
    candles(first: 1 where: {high_gt: 100000}) {
      close
    }
  }
}
`

async function testNoAbnormalPrice(endpoint) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: POOL_PRICE_QUERY }),
  })
  let error = false
  const data = await res.json()
  data.data.pools.map((poolResults) => {
    if (poolResults.candles.length > 0) {
      error = true
      console.log('\x1b[31mError: \x1b[0m Pool %s (%s) has abnormal price', poolResults.name, poolResults.id)
    }
  })
  return error
}

function logSuccessOrFail(error) {
  if (error) {
    console.log('\x1b[31mTest failed\x1b[0m\n\n')
  } else {
    console.log('\x1b[36mTest passed\x1b[0m\n\n')
  }
}

async function main() {
  let url = await new Promise((resolve) => {
    rl.question('Endpoint (default = staging)? ', resolve)
  })
  if (url == '') {
    url = GRAPH_ENDPOINT
  }
  console.log('>>> Testing for price aberrations')
  logSuccessOrFail(await testNoAbnormalPrice(url))

  console.log('>>> Testing for USD volume aberrations')

  rl.close()
}

main()
