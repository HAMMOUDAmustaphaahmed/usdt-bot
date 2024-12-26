import React, { useState, useEffect } from "react";

interface Chandelier {
  time: number;
  open: number;
  close: number;
  high: number;
  low: number;
}

interface Pair {
  pair: string;
  chandelierOfReferenceLow: number;
  chandelierOfReferenceHigh: number;
  chandelierOfReferenceOpen: number;
  chandelierOfReferenceClose: number;
  chandelierOfReferenceIndex: number;
  currentPrice: number;
  chandeliers: Chandelier[];
}

const App = () => {
  const [timeFrame, setTimeFrame] = useState("1d");
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [loading, setLoading] = useState(false);
  const [start, setStart] = useState(false);

  const getTimeFrame = () => {
    switch (timeFrame) {
      case "1d":
      case "1h":
      case "6h":
      case "12h":
      case "1w":
      case "1M":
        return timeFrame;
      default:
        return "1d";
    }
  };

  const getChandeliers = async (pair: string) => {
    const response = await fetch(
      `https://api.binance.com/api/v3/klines?symbol=${pair}&interval=${getTimeFrame()}`
    );
    if (!response.ok) {
      throw new Error("Failed to fetch chandeliers");
    }
    return await response.json();
  };

  const findChandelierOfReference = (chandeliers: any[]) => {
    let maxDifference = 0;
    let chandelierOfReferenceIndex = -1;

    // Only process the last 10 candles (index length - 10 to length)
    const validChandeliers = chandeliers.slice(-10);

    validChandeliers.forEach((chandelier, index) => {
      const open = parseFloat(chandelier[1]);
      const close = parseFloat(chandelier[4]);
      const difference = close - open;

      // The reference candle must be green (close > open) and have the largest difference
      if (difference > maxDifference && close > open) {
        maxDifference = difference;
        chandelierOfReferenceIndex = chandeliers.length - 10 + index;
      }
    });

    if (
      chandelierOfReferenceIndex === -1 ||
      chandelierOfReferenceIndex >= chandeliers.length - 3
    ) {
      // If the reference candle is one of the last three, return null
      return null;
    }

    const refCandle = chandeliers[chandelierOfReferenceIndex];
    return {
      chandelierOfReferenceLow: parseFloat(refCandle[3]),
      chandelierOfReferenceHigh: parseFloat(refCandle[2]),
      chandelierOfReferenceOpen: parseFloat(refCandle[1]),
      chandelierOfReferenceClose: parseFloat(refCandle[4]),
      chandelierOfReferenceIndex,
    };
  };

  const validateFollowingChandeliers = (
    chandeliers: any[],
    chandelierOfReference: {
      chandelierOfReferenceLow: number;
      chandelierOfReferenceHigh: number;
      chandelierOfReferenceOpen: number;
      chandelierOfReferenceClose: number;
      chandelierOfReferenceIndex: number;
    }
  ): boolean => {
    const { chandelierOfReferenceOpen, chandelierOfReferenceClose } =
      chandelierOfReference;

    // Calculate the moyenne (average) of reference candle's open and close
    const moyenne =
      (chandelierOfReferenceOpen + chandelierOfReferenceClose) / 2;

    // Validate from the reference candle to the end of the last 10 candles
    for (
      let i = chandelierOfReference.chandelierOfReferenceIndex + 1;
      i < chandeliers.length;
      i++
    ) {
      const low = parseFloat(chandeliers[i][3]); // Current low
      const high = parseFloat(chandeliers[i][2]); // Current high
      const open = parseFloat(chandeliers[i][1]); // Current open
      const close = parseFloat(chandeliers[i][4]); // Current close

      // Check if both open and close are bounded by [moyenne, chandelierOfReferenceClose]
      if (
        !(
          open >= moyenne && // Open should be >= moyenne
          open <= chandelierOfReferenceClose && // Open should be <= chandelierOfReferenceClose
          close >= moyenne && // Close should be >= moyenne
          close <= chandelierOfReferenceClose && // Close should be <= chandelierOfReferenceClose
          close >= 0.8 * chandelierOfReferenceClose
        ) // Close should be >= 95% of chandelierOfReferenceClose
      ) {
        return false; // Return false if any condition is violated
      }
    }

    return true; // Return true if all conditions are met
  };

  const getCurrentPrice = async (pair: string) => {
    const response = await fetch(
      `https://api.binance.com/api/v3/ticker/price?symbol=${pair}`
    );
    if (!response.ok) {
      throw new Error("Failed to fetch current price");
    }
    const data = await response.json();
    return parseFloat(data.price);
  };

  const handleTimeFrameChange = (
    event: React.ChangeEvent<HTMLSelectElement>
  ) => {
    setTimeFrame(event.target.value);
  };

  const handleStartClick = () => {
    setStart(true);
    setPairs([]);
  };

  useEffect(() => {
    if (!start) return;

    const fetchPairs = async () => {
      setLoading(true);
      try {
        const response = await fetch(
          "https://api.binance.com/api/v3/ticker/price"
        );
        if (!response.ok) {
          throw new Error("Failed to fetch pairs");
        }

        const products = await response.json();
        const usdtPairs = products.filter((product: any) => {
          const pair = product.symbol;
          const price = parseFloat(product.price);
          return (
            pair.endsWith("USDT") &&
            !pair.startsWith("BTC") &&
            !pair.startsWith("ETH") &&
            !pair.startsWith("BNB") &&
            price > 0
          );
        });

        for (const pair of usdtPairs) {
          const chandeliers = await getChandeliers(pair.symbol);
          const chandelierOfReference = findChandelierOfReference(chandeliers);

          if (
            chandelierOfReference &&
            validateFollowingChandeliers(chandeliers, chandelierOfReference)
          ) {
            const currentPrice = await getCurrentPrice(pair.symbol);
            setPairs((prevPairs) => [
              ...prevPairs,
              {
                pair: pair.symbol,
                chandelierOfReferenceLow:
                  chandelierOfReference.chandelierOfReferenceLow,
                chandelierOfReferenceHigh:
                  chandelierOfReference.chandelierOfReferenceHigh,
                chandelierOfReferenceOpen:
                  chandelierOfReference.chandelierOfReferenceOpen,
                chandelierOfReferenceClose:
                  chandelierOfReference.chandelierOfReferenceClose,
                chandelierOfReferenceIndex:
                  chandelierOfReference.chandelierOfReferenceIndex,
                currentPrice,
                chandeliers: chandeliers.map((chandelier: any) => ({
                  time: chandelier[0],
                  open: parseFloat(chandelier[1]),
                  close: parseFloat(chandelier[4]),
                  high: parseFloat(chandelier[2]),
                  low: parseFloat(chandelier[3]),
                })),
              },
            ]);
          }
        }
      } catch (error) {
        console.error(error);
      }
      setLoading(false);
    };

    fetchPairs();
  }, [start]);

  return (
    <div className="max-w-7xl mx-auto p-4 bg-gradient-to-r from-purple-700 via-pink-500 to-red-500 text-white">
      <div className="flex justify-between items-center mb-4">
        <select
          value={timeFrame}
          onChange={handleTimeFrameChange}
          className="bg-gray-800 border-2 border-purple-300 rounded-lg p-2"
        >
          <option value="1d">1 day</option>
          <option value="1h">1 hour</option>
          <option value="6h">6 hours</option>
          <option value="12h">12 hours</option>
          <option value="1w">1 week</option>
          <option value="1M">1 month</option>
        </select>
        <button
          onClick={handleStartClick}
          className="bg-indigo-500 hover:bg-indigo-700 text-white p-2 rounded-lg transition-colors"
        >
          Start
        </button>
      </div>
      {loading && pairs.length === 0 ? (
        <div className="text-center">
          <svg
            className="animate-spin h-8 w-8 text-white"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            ></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
          <p className="mt-2">Fetching data...</p>
        </div>
      ) : (
        <div>
          <p className="text-lg font-bold mb-4">{pairs.length} pairs</p>
          <table className="w-full table-auto border-2 border-gray-300 rounded-lg bg-gray-800">
            <thead className="bg-gray-700">
              <tr>
                <th className="p-2 border-2 border-gray-600">Pair</th>
                <th className="p-2 border-2 border-gray-600">
                  Reference (Low / High)
                </th>
                <th className="p-2 border-2 border-gray-600">
                  Reference (Open / Close)
                </th>
                <th className="p-2 border-2 border-gray-600">Current Price</th>
              </tr>
            </thead>
            <tbody>
              {pairs.map((pair) => (
                <tr
                  key={pair.pair}
                  className="hover:bg-gray-600 transition-colors"
                >
                  <td className="p-2 border-2 border-gray-600">{pair.pair}</td>
                  <td className="p-2 border-2 border-gray-600">
                    {pair.chandelierOfReferenceLow} /{" "}
                    {pair.chandelierOfReferenceHigh}
                  </td>
                  <td className="p-2 border-2 border-gray-600">
                    {pair.chandelierOfReferenceOpen} /{" "}
                    {pair.chandelierOfReferenceClose}
                  </td>
                  <td className="p-2 border-2 border-gray-600">
                    <span
                      className={
                        pair.currentPrice >=
                          0.95 * pair.chandelierOfReferenceClose &&
                        pair.currentPrice < pair.chandelierOfReferenceClose
                          ? "text-green-400"
                          : "text-white"
                      }
                    >
                      {pair.currentPrice}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default App;
