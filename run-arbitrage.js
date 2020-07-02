require("dotenv").config();
const Web3 = require("web3");
const abis = require("./abis");
const { ChainId, TokenAmount, Pair, Token } = require("@uniswap/sdk");
const { mainnet: addresses } = require("./addresses");
const web3 = new Web3(
  new Web3.providers.WebsocketProvider(process.env.INFURA_URL)
);

//connecting with kyber network contract
const kyber = new web3.eth.Contract(
  abis.kyber.kyberNetworkProxy,
  addresses.kyber.kyberNetworkProxy
);

//adding the web3 wallet
web3.eth.accounts.wallet.add(process.env.PRIVATE_KEY);

//specify the amounts
const AMOUNT_ETH = 100;
const RECENT_ETH_PRICE = 230;
const AMOUNT_ETH_WEI = web3.utils.toWei(AMOUNT_ETH.toString());
const AMOUNT_DAI_WEI = web3.utils.toWei(
  (AMOUNT_ETH * RECENT_ETH_PRICE).toString()
);

//polling the uniswap prices
const init = async () => {
  const WETH = new Token(
    ChainId.MAINNET,
    addresses.tokens.weth,
    18,
    "WETH",
    "Wrapped Ether"
  );
  const DAI = new Token(
    ChainId.MAINNET,
    addresses.tokens.dai,
    18,
    "DAI",
    "DAI Stablecoin"
  );

  const [dai, weth] = await Promise.all(
    [addresses.tokens.dai, addresses.tokens.weth].map((tokenAddress) =>
      Token.fetchData(ChainId.MAINNET, tokenAddress)
    )
  );
  daiWeth = await Pair.fetchData(dai, weth);

  //creating a new instance and using a subscribe method to subscribe everytime there is new block
  web3.eth
    .subscribe("newBlockHeaders")
    .on("data", async (block) => {
      console.log(`New Block received. Block # ${block.number}`);
      const kyberResult = await Promise.all([
        //buy price in terms of dai per eth
        //buying ETH tokens using DAI
        kyber.methods
          .getExpectedRate(
            addresses.tokens.dai,
            "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
            AMOUNT_DAI_WEI
          )
          .call(),
        //sell price in terms of dai per eth
        //selling ETH tokens and getting DAI
        kyber.methods
          .getExpectedRate(
            "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
            addresses.tokens.dai,
            AMOUNT_ETH_WEI
          )
          .call(),
      ]);

      const uniswapResults = await Promise.all([
        daiWeth.getOutputAmount(new TokenAmount(DAI, AMOUNT_DAI_WEI)),
        daiWeth.getOutputAmount(new TokenAmount(WETH, AMOUNT_ETH_WEI)),
      ]);
      const kyberRates = {
        buy: parseFloat(1 / (kyberResult[0].expectedRate / 10 ** 18)),
        sell: parseFloat(kyberResult[1].expectedRate / 10 ** 18),
      };
      const uniswapRates = {
        buy: parseFloat(
          AMOUNT_DAI_WEI / (uniswapResults[0][0].toExact() * 10 ** 18)
        ),
        sell: parseFloat(uniswapResults[1][0].toExact() / AMOUNT_ETH),
      };

      console.log("**************Uniswap Result:***************");
      console.log(uniswapResults);
      console.log("**************Acutall result:***************");
      console.log(`Acutall result: ${JSON.stringify(kyberResult)}`);
      console.log(`--------------Normalised Result ETH/DAI--------------`);
      console.log(`Normalised Result ETH/DAI:  ${JSON.stringify(kyberRates)}`);
      console.log(`**************Uniswap ETH/DAI**************`);
      console.log(uniswapRates);

      //estimating the gas price
      const gasPrice = await web3.eth.getGasPrice();
      //arbitrarily picked gas price 2000000
      const txCost = 200000 * parseInt(gasPrice);
      console.log("txCost:", txCost);
      const currentEthPrice = (uniswapRates.buy + uniswapRates.sell) / 2;
      console.log(`currentEthPrice: ${currentEthPrice}`);
      const profit1 =
        (parseInt(AMOUNT_ETH_WEI) / 10 ** 18) *
          (uniswapRates.sell - kyberRates.buy) -
        (txCost / 10 ** 18) * currentEthPrice;
      console.log(`profit 1: ${profit1}`);
      const profit2 =
        (parseInt(AMOUNT_ETH_WEI) / 10 ** 18) *
          (kyberRates.sell - uniswapRates.buy) -
        (txCost / 10 ** 18) * currentEthPrice;
      console.log(`profit 2: ${profit2}`);
      if (profit1 > 0) {
        console.log("Arb opportunity found!");
        console.log(`Buy ETH on Kyber at ${kyberRates.buy} dai`);
        console.log(`Sell ETH on Uniswap at ${uniswapRates.sell} dai`);
        console.log(`Expected profit: ${profit1} dai`);
        //Execute arb Kyber <=> Uniswap
      } else if (profit2 > 0) {
        console.log("Arb opportunity found!");
        console.log(`Buy ETH from Uniswap at ${uniswapRates.buy} dai`);
        console.log(`Sell ETH from Kyber at ${kyberRates.sell} dai`);
        console.log(`Expected profit: ${profit2} dai`);
        //Execute arb Uniswap <=> Kyber
      } else {
        console.log(`no profit `);
      }
    })
    .on("error", (error) => console.log(`error: ${error}`));
};

init();
