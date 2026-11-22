# P6 results

Generated 2026-11-22T01:19:20.232Z; 5 warm-up + 30 measured runs per configuration.

**Mode:** No gas measurement

## Absolute metrics

| Config | Constraints | Prove ms (mean ± std) | Prove median | Verify ms (mean ± std) | Verify median | Proof B | Payload B | Peak RSS MB | Gas |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A | - | 0.0 ± 0.0 | 0.0 | 28.28 ± 12.58 | 22.10 | 255 | 580 | 371.3 | - |
| B1 | 62 | 71.8 ± 31.4 | 58.1 | 11.93 ± 2.52 | 11.05 | 721 | 755 | 466.4 | - |
| B2 | 9896 | 788.5 ± 309.0 | 616.7 | 686.00 ± 262.56 | 589.00 | 723 | 836 | 798.1 | - |
| B3 | 10311 | 979.1 ± 315.4 | 868.8 | 728.22 ± 279.87 | 618.81 | 724 | 837 | 798.1 | - |
| B4 | 10313 | 1034.1 ± 310.0 | 1125.2 | 694.74 ± 260.61 | 599.40 | 725 | 920 | 811.2 | - |

## Overhead per step

| Step | Δ constraints | Δ prove ms | Δ prove | Δ verify ms | Δ verify | Δ payload B |
| --- | --- | --- | --- | --- | --- | --- |
| B1 -> B2 | 9834 | 716.7 | +998.2% | 674.07 | +5649.9% | 81 |
| B2 -> B3 | 415 | 190.6 | +24.2% | 42.22 | +6.2% | 1 |
| B3 -> B4 | 2 | 55.0 | +5.6% | -33.48 | -4.6% | 83 |
| B1 -> B4 | 10251 | 962.3 | +1340.2% | 682.81 | +5723.2% | 165 |
| A -> B4 | - | 1034.0 | +3088531.8% | 666.46 | +2356.6% | 340 |

Gas: Skipped (--no-gas).

## Environment

```json
{
  "node": "v22.23.5",
  "os": "win32 10.0.26300 (x64)",
  "cpuModel": "13th Gen Intel(R) Core(TM) i5-13420H",
  "cpuCores": 12,
  "totalMemoryGb": 23.7,
  "nativeCircom": "circom compiler 2.2.3",
  "packages": {
    "snarkjs": "0.7.6",
    "circomlibjs": "0.1.7",
    "circomlib": "2.0.5",
    "circom2": "0.2.23",
    "hardhat": "3.22.0",
    "viem": "2.58.1",
    "tsx": "4.23.15"
  }
}
```
