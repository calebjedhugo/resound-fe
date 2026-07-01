/**
 * repoPersistence Tests
 *
 * Tests the dev-only write path that saves the current model back into
 * the repo's puzzle files. fetch is mocked; the id-guard is the key
 * behavior (never POST an empty/invalid id).
 */
import { savePuzzleToRepo } from 'editor/io/repoPersistence';
import EditorPuzzleModel from 'editor/model/EditorPuzzleModel';

describe('savePuzzleToRepo', () => {
  let model;

  beforeEach(() => {
    model = new EditorPuzzleModel();
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) })
    );
  });

  afterEach(() => {
    delete global.fetch;
  });

  it('does not POST when the puzzle has no id', async () => {
    const written = await savePuzzleToRepo(model);

    expect(written).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not POST when the id contains illegal characters', async () => {
    model.setMetadata({ id: 'bad id/../etc' });

    const written = await savePuzzleToRepo(model);

    expect(written).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('POSTs the serialized puzzle to the id-scoped endpoint', async () => {
    model.setMetadata({ id: 'my-level', name: 'My Level' });

    const written = await savePuzzleToRepo(model);

    expect(written).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = fetch.mock.calls[0];
    expect(url).toBe('/api/puzzles/my-level');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body).id).toBe('my-level');
  });

  it('throws with the server error message on a failed write', async () => {
    model.setMetadata({ id: 'my-level' });
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        statusText: 'Internal Server Error',
        json: () => Promise.resolve({ error: 'disk full' }),
      })
    );

    await expect(savePuzzleToRepo(model)).rejects.toThrow('disk full');
  });
});
