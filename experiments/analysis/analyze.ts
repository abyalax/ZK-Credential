/**
 * P6.3: turns experiments/results/p6-benchmark.json into tables (Markdown, CSV) and bar charts
 * (SVG) for the RQ4 and RQ5 chapters.
 *
 * Usage: pnpm experiment:p6:analyze [--file=p6-benchmark.json|p6-benchmark-nogas.json] [--timestamp=2024-01-15-143022]
 *
 * If --timestamp is not provided, the script will automatically use the latest timestamp folder.
 */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { REPOSITORY_ROOT } from '../../src/infrastructure/index.js';
import type { Summary } from '../benchmarks/stats.js';
import { findLatestTimestamp } from '../results-utils.js';

const RESULTS_DIR = join(REPOSITORY_ROOT, 'experiments', 'results');

interface Row {
  configuration: string;
  label: string;
  constraints: number | null;
  proofBytes: number;
  payloadBytes: number;
  peakRssMb: number;
  prove: Summary;
  verify: Summary;
  gas: number | null;
}

interface Report {
  generatedAt: string;
  mode: 'with-gas' | 'no-gas';
  protocol: { runs: number; warmup: number };
  environment: Record<string, unknown>;
  gas: { note: string };
  summary: Row[];
}

const fixed = (value: number, digits = 1): string => value.toFixed(digits);
const orDash = (value: number | null): string => (value === null ? '-' : String(value));

/** Relative change from `from` to `to` as a signed percentage string. */
const percent = (from: number, to: number): string =>
  from === 0 ? '-' : `${to >= from ? '+' : ''}${fixed(((to - from) / from) * 100)}%`;

const markdownTable = (header: readonly string[], rows: readonly (readonly string[])[]): string =>
  [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');

const absoluteTable = (rows: readonly Row[]): string =>
  markdownTable(
    [
      'Config',
      'Constraints',
      'Prove ms (mean ± std)',
      'Prove median',
      'Verify ms (mean ± std)',
      'Verify median',
      'Proof B',
      'Payload B',
      'Peak RSS MB',
      'Gas',
    ],
    rows.map((row) => [
      row.configuration,
      orDash(row.constraints),
      `${fixed(row.prove.mean)} ± ${fixed(row.prove.std)}`,
      fixed(row.prove.median),
      `${fixed(row.verify.mean, 2)} ± ${fixed(row.verify.std, 2)}`,
      fixed(row.verify.median, 2),
      String(row.proofBytes),
      String(row.payloadBytes),
      String(row.peakRssMb),
      orDash(row.gas),
    ]),
  );

/** Cost of each ablation step (B1 -> B2 -> B3 -> B4) and of B4 against the baseline A. */
const overheadRows = (rows: readonly Row[]) => {
  const byId = new Map(rows.map((row) => [row.configuration, row]));
  const pairs: readonly [string, string][] = [
    ['B1', 'B2'],
    ['B2', 'B3'],
    ['B3', 'B4'],
    ['B1', 'B4'],
    ['A', 'B4'],
  ];
  return pairs.flatMap(([from, to]) => {
    const a = byId.get(from);
    const b = byId.get(to);
    if (!(a && b)) return [];
    return [
      {
        step: `${from} -> ${to}`,
        constraints:
          a.constraints === null || b.constraints === null
            ? '-'
            : String(b.constraints - a.constraints),
        proveDeltaMs: fixed(b.prove.mean - a.prove.mean),
        provePercent: percent(a.prove.mean, b.prove.mean),
        verifyDeltaMs: fixed(b.verify.mean - a.verify.mean, 2),
        verifyPercent: percent(a.verify.mean, b.verify.mean),
        payloadDeltaBytes: String(b.payloadBytes - a.payloadBytes),
      },
    ];
  });
};

interface Bar {
  readonly label: string;
  readonly value: number;
  readonly error?: number;
}

/** Minimal dependency-free SVG bar chart; error bars are one standard deviation. */
const barChart = (title: string, unit: string, bars: readonly Bar[]): string => {
  const width = 640;
  const height = 360;
  const margin = { top: 48, right: 24, bottom: 56, left: 72 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const top = Math.max(...bars.map((bar) => bar.value + (bar.error ?? 0)), 1) * 1.1;
  const slot = plotWidth / bars.length;
  const y = (value: number): number => margin.top + plotHeight - (value / top) * plotHeight;

  const ticks = Array.from({ length: 5 }, (_, index) => (top / 4) * index);
  const grid = ticks
    .map(
      (tick) =>
        `<line x1="${margin.left}" x2="${width - margin.right}" y1="${y(tick)}" y2="${y(tick)}" stroke="#ddd"/>` +
        `<text x="${margin.left - 8}" y="${y(tick) + 4}" text-anchor="end" font-size="11">${fixed(tick, top < 10 ? 2 : 0)}</text>`,
    )
    .join('');
  const columns = bars
    .map((bar, index) => {
      const x = margin.left + index * slot + slot * 0.2;
      const barWidth = slot * 0.6;
      const center = x + barWidth / 2;
      const whisker = bar.error
        ? `<line x1="${center}" x2="${center}" y1="${y(bar.value - bar.error)}" y2="${y(bar.value + bar.error)}" stroke="#222"/>`
        : '';
      return (
        `<rect x="${x}" y="${y(bar.value)}" width="${barWidth}" height="${y(0) - y(bar.value)}" fill="#4a7bd0"/>` +
        whisker +
        `<text x="${center}" y="${y(bar.value) - 6}" text-anchor="middle" font-size="11">${fixed(bar.value, bar.value < 10 ? 2 : 0)}</text>` +
        `<text x="${center}" y="${height - margin.bottom + 20}" text-anchor="middle" font-size="12">${bar.label}</text>`
      );
    })
    .join('');

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" font-family="sans-serif">` +
    `<rect width="${width}" height="${height}" fill="#fff"/>` +
    `<text x="${width / 2}" y="24" text-anchor="middle" font-size="15" font-weight="bold">${title}</text>` +
    `<text x="16" y="${margin.top + plotHeight / 2}" transform="rotate(-90 16 ${margin.top + plotHeight / 2})" text-anchor="middle" font-size="12">${unit}</text>` +
    grid +
    columns +
    `</svg>\n`
  );
};

const loadReport = async (filename: string, timestamp?: string): Promise<Report> => {
  let filePath: string;

  if (timestamp) {
    // Try new timestamped structure: experiments/results/{timestamp}/{gas|no-gas}/{filename}
    const gasFolder = filename.includes('-nogas') ? 'no-gas' : 'gas';
    filePath = join(RESULTS_DIR, timestamp, gasFolder, filename);
  } else {
    // Try flat structure for backward compatibility
    filePath = join(RESULTS_DIR, filename);
  }

  const content = await readFile(filePath, 'utf8');
  return JSON.parse(content) as Report;
};

const buildMarkdownReport = (report: Report): string => {
  const rows = report.summary;
  const overhead = overheadRows(rows);

  return [
    '# P6 results',
    '',
    `Generated ${report.generatedAt}; ${report.protocol.warmup} warm-up + ${report.protocol.runs} measured runs per configuration.`,
    '',
    `**Mode:** ${report.mode === 'with-gas' ? 'With gas measurement' : 'No gas measurement'}`,
    '',
    '## Absolute metrics',
    '',
    absoluteTable(rows),
    '',
    '## Overhead per step',
    '',
    markdownTable(
      ['Step', 'Δ constraints', 'Δ prove ms', 'Δ prove', 'Δ verify ms', 'Δ verify', 'Δ payload B'],
      overhead.map((row) => [
        row.step,
        row.constraints,
        row.proveDeltaMs,
        row.provePercent,
        row.verifyDeltaMs,
        row.verifyPercent,
        row.payloadDeltaBytes,
      ]),
    ),
    '',
    `Gas: ${report.gas.note}.`,
    '',
    '## Environment',
    '',
    '```json',
    JSON.stringify(report.environment, null, 2),
    '```',
    '',
  ].join('\n');
};

const buildOverheadCsv = (report: Report): string => {
  const overhead = overheadRows(report.summary);

  return `${[
    'step,delta_constraints,delta_prove_ms,delta_prove_pct,delta_verify_ms,delta_verify_pct,delta_payload_bytes',
    ...overhead.map((row) =>
      [
        row.step,
        row.constraints,
        row.proveDeltaMs,
        row.provePercent,
        row.verifyDeltaMs,
        row.verifyPercent,
        row.payloadDeltaBytes,
      ].join(','),
    ),
  ].join('\n')}\n`;
};

const buildChartData = (report: Report) => {
  const rows = report.summary;

  return [
    {
      filename: 'p6-prove-time.svg',
      title: 'Proof generation time',
      unit: 'ms (mean ± std)',
      data: rows.map((row) => ({
        label: row.configuration,
        value: row.prove.mean,
        error: row.prove.std,
      })),
    },
    {
      filename: 'p6-verify-time.svg',
      title: 'Verification time',
      unit: 'ms (mean ± std)',
      data: rows.map((row) => ({
        label: row.configuration,
        value: row.verify.mean,
        error: row.verify.std,
      })),
    },
    {
      filename: 'p6-constraints.svg',
      title: 'R1CS constraints',
      unit: 'constraints',
      data: rows
        .filter((row) => row.constraints !== null)
        .map((row) => ({
          label: row.configuration,
          value: row.constraints ?? 0,
        })),
    },
    {
      filename: 'p6-payload-size.svg',
      title: 'Presentation size',
      unit: 'bytes',
      data: rows.map((row) => ({
        label: row.configuration,
        value: row.payloadBytes,
      })),
    },
    {
      filename: 'p6-memory.svg',
      title: 'Peak resident memory',
      unit: 'MB',
      data: rows.map((row) => ({
        label: row.configuration,
        value: row.peakRssMb,
      })),
    },
  ];
};

const writeChart = async (chart: ReturnType<typeof buildChartData>[number]): Promise<void> => {
  const svg = barChart(chart.title, chart.unit, chart.data);

  await writeFile(join(RESULTS_DIR, chart.filename), svg);
};

const writeBenchmarkResults = async (
  report: Report,
  inputFilename: string,
  timestamp?: string,
): Promise<void> => {
  let outputDir: string;

  if (timestamp) {
    // Write to timestamped folder: experiments/results/{timestamp}/{gas|no-gas}/
    const gasFolder = report.mode === 'no-gas' ? 'no-gas' : 'gas';
    outputDir = join(RESULTS_DIR, timestamp, gasFolder);
  } else {
    // Write to flat folder for backward compatibility
    outputDir = RESULTS_DIR;
  }

  await mkdir(outputDir, { recursive: true });

  const suffix = report.mode === 'no-gas' ? '-nogas' : '';

  const markdown = buildMarkdownReport(report);
  const csv = buildOverheadCsv(report);
  const charts = buildChartData(report);

  await Promise.all([
    writeFile(join(outputDir, `p6-table${suffix}.md`), markdown),
    writeFile(join(outputDir, `p6-overhead${suffix}.csv`), csv),
    ...charts.map((chart) =>
      writeFile(
        join(outputDir, chart.filename.replace('.svg', `${suffix}.svg`)),
        barChart(chart.title, chart.unit, chart.data),
      ),
    ),
  ]);
};

const main = async (): Promise<void> => {
  const args = process.argv.slice(2);
  const fileArg =
    args.find((arg) => arg.startsWith('--file='))?.split('=')[1] ?? 'p6-benchmark.json';
  let timestampArg = args.find((arg) => arg.startsWith('--timestamp='))?.split('=')[1];

  // If no timestamp provided, try to find the latest one
  if (!timestampArg) {
    timestampArg = await findLatestTimestamp(REPOSITORY_ROOT);
  }

  const report = await loadReport(fileArg, timestampArg);

  await writeBenchmarkResults(report, fileArg, timestampArg);

  const suffix = report.mode === 'no-gas' ? '-nogas' : '';
  const pathSuffix = timestampArg ? `/${timestampArg}/${report.mode === 'no-gas' ? 'no-gas' : 'gas'}` : '';
  process.stdout.write(
    `wrote experiments/results${pathSuffix}/p6-table${suffix}.md, p6-overhead${suffix}.csv, p6-*${suffix}.svg\n`,
  );
};

await main();
