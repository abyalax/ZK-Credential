# P6 results

Generated 2026-11-22T01:19:01.974Z; 5 warm-up + 30 measured runs per configuration.

**Mode:** With gas measurement

## Absolute metrics

| Config | Constraints | Prove ms (mean ± std) | Prove median | Verify ms (mean ± std) | Verify median | Proof B | Payload B | Peak RSS MB | Gas    |
| ------ | ----------- | --------------------- | ------------ | ---------------------- | ------------- | ------- | --------- | ----------- | ------ |
| A      | -           | 0.0 ± 0.0             | 0.0          | 21.19 ± 3.71           | 20.46         | 255     | 580       | 350.6       | -      |
| B1     | 62          | 48.1 ± 6.3            | 46.6         | 10.80 ± 1.75           | 10.64         | 723     | 757       | 448.4       | -      |
| B2     | 9896        | 651.4 ± 85.3          | 649.3        | 474.98 ± 73.94         | 489.41        | 722     | 835       | 823.2       | -      |
| B3     | 10311       | 1173.3 ± 448.1        | 1216.7       | 630.67 ± 130.39        | 663.91        | 723     | 836       | 849.2       | -      |
| B4     | 10313       | 884.2 ± 349.3         | 734.4        | 546.87 ± 138.63        | 533.00        | 725     | 920       | 849.2       | 251374 |

## Overhead per step

| Step     | Δ constraints | Δ prove ms | Δ prove     | Δ verify ms | Δ verify | Δ payload B |
| -------- | ------------- | ---------- | ----------- | ----------- | -------- | ----------- |
| B1 -> B2 | 9834          | 603.3      | +1253.4%    | 464.19      | +4300.0% | 78          |
| B2 -> B3 | 415           | 521.9      | +80.1%      | 155.68      | +32.8%   | 1           |
| B3 -> B4 | 2             | -289.2     | -24.6%      | -83.80      | -13.3%   | 84          |
| B1 -> B4 | 10251         | 836.0      | +1737.0%    | 536.07      | +4965.9% | 163         |
| A -> B4  | -             | 884.1      | +2929574.9% | 525.67      | +2480.3% | 340         |

Gas: estimateGas of CredentialVerifier.verifyCredential on in-process Hardhat; challenge check is off-chain (no gas).

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
