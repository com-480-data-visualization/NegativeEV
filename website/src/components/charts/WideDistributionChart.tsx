/**
 * Fat-tails view of the BTC Δ distribution.
 *
 * Thin wrapper around BtcDistributionChart that selects the wide bin set
 * (±3% range, 80 bins) from the shared data file. Exists as its own file
 * so consumers can mount it in a different section without re-stating the
 * binsKey / range every time.
 */
import BtcDistributionChart from '../BtcDistributionChart'

export default function WideDistributionChart() {
  return <BtcDistributionChart binsKey="wide_bins" xRange={[-3, 3]} xTickStep={0.5} />
}
