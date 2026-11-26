import { parseRecording, parseRecordingIndex, type Recording } from '@/domain';

type FetchFn = typeof fetch;

const fetchJson = async (fetchFn: FetchFn, url: string): Promise<unknown> => {
  const response = await fetchFn(url);
  if (!response.ok) throw new Error(`RECORDINGS_NOT_FOUND: ${url} (${response.status})`);
  try {
    return await response.json();
  } catch {
    // The Vite dev server answers an unknown path with index.html, which is not JSON.
    throw new Error(`RECORDINGS_NOT_FOUND: ${url} is not JSON`);
  }
};

const loadOne = async (fetchFn: FetchFn, baseUrl: string, file: string): Promise<Recording> => {
  const parsed = parseRecording(await fetchJson(fetchFn, `${baseUrl}/${file}`));
  if (!parsed.ok) throw new Error(`RECORDING_INVALID: ${file}: ${parsed.error}`);
  return parsed.value;
};

/**
 * Loads every recording listed in `<baseUrl>/index.json`. One broken file fails the whole load:
 * a fallback that quietly drops a recording is worse than one that says what is wrong.
 */
export const loadRecordings = async (baseUrl = '/recordings', fetchFn: FetchFn = fetch): Promise<readonly Recording[]> => {
  const index = parseRecordingIndex(await fetchJson(fetchFn, `${baseUrl}/index.json`));
  if (!index.ok) throw new Error(`RECORDING_INVALID: index.json: ${index.error}`);
  if (index.value.recordings.length === 0) throw new Error('RECORDINGS_EMPTY: index.json lists no recordings');
  return Promise.all(index.value.recordings.map((entry) => loadOne(fetchFn, baseUrl, entry.file)));
};
