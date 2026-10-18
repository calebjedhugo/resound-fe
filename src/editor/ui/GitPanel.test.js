/**
 * @jest-environment jsdom
 */

/**
 * GitPanel — status refresh and button state.
 *
 * fetch stands in for the dev server's /api/git endpoints. Each status read
 * spawns git on that server, so the panel must never run two at once, and a
 * refresh asked for mid-read must still end on a read that saw it. An
 * action's result stays up through refreshes that read the same status.
 */
import GitPanel from 'editor/ui/GitPanel';

describe('GitPanel', () => {
  let container;
  let changedCount;
  let pendingReads; // resolvers for status reads the "server" has not answered yet

  /** Answer the oldest outstanding status read with the tree as it is NOW. */
  async function answerRead() {
    const resolve = pendingReads.shift();
    resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          ok: true,
          branch: 'main',
          changedCount,
          files: [],
          ahead: 0,
          behind: 0,
          hasUpstream: false,
        }),
    });
    await jest.advanceTimersByTimeAsync(0);
  }

  /** Answer status reads until none is outstanding. */
  async function answerReads() {
    while (pendingReads.length) {
      // eslint-disable-next-line no-await-in-loop -- one read at a time, as the panel asks
      await answerRead();
    }
  }

  const button = (label) =>
    [...container.querySelectorAll('button')].find((b) => b.textContent === label);
  const statusText = () => container.querySelector('.git-status').textContent;

  /** Click an action button and answer the status reads it leads to. */
  async function runAction(label) {
    button(label).click();
    await jest.advanceTimersByTimeAsync(0);
    await answerReads();
  }

  /** Refresh as a landed write does, and answer the read. */
  async function refreshAfterWrite(panel) {
    const refreshed = panel.refresh();
    await answerReads();
    await refreshed;
  }

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    changedCount = 0;
    pendingReads = [];
    global.fetch = jest.fn((url) => {
      if (url === '/api/git/status') {
        return new Promise((resolve) => {
          pendingReads.push(resolve);
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
    });
  });

  afterEach(() => {
    container.remove();
    delete global.fetch;
  });

  it('runs one status read at a time and folds refreshes asked for mid-read into one more', async () => {
    const panel = new GitPanel(container, {});
    expect(pendingReads).toHaveLength(1); // the first read is in flight

    changedCount = 1; // a write lands while the first read is out
    const settled = [panel.refresh(), panel.refresh(), panel.refresh()];
    expect(pendingReads).toHaveLength(1); // nothing new spawned yet

    await answerRead(); // the first read finishes; ONE trailing read starts
    expect(pendingReads).toHaveLength(1);
    await answerRead();

    await Promise.all(settled);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('1 puzzle file changed');
    expect(button('Commit').disabled).toBe(false);
  });

  it('leaves Commit and Revert off after a commit empties the tree', async () => {
    changedCount = 1;
    const onCommit = jest.fn(async () => {
      changedCount = 0; // the commit took every change
      return 'Committed abc123';
    });
    new GitPanel(container, { onCommit }); // eslint-disable-line no-new -- the panel wires itself into `container`
    await answerRead();
    expect(button('Commit').disabled).toBe(false);

    container.querySelector('.git-message').value = 'Save the level';
    button('Commit').click();
    await jest.advanceTimersByTimeAsync(0);
    await answerRead(); // the post-commit status read

    expect(onCommit).toHaveBeenCalledWith('Save the level');
    expect(button('Commit').disabled).toBe(true);
    expect(button('Revert').disabled).toBe(true);
    expect(button('Pull').disabled).toBe(false);
  });

  describe("an action's result", () => {
    let panel;

    beforeEach(async () => {
      changedCount = 1;
      panel = new GitPanel(container, {
        onRevert: async () => {
          changedCount = 0;
          return 'Reverted — ⌘Z to restore';
        },
        onCommit: async () => {
          throw new Error('Commit message required');
        },
        onPush: async () => undefined,
      });
      await answerReads();
    });

    it('stays up through a later read of the same status', async () => {
      await runAction('Revert');
      expect(statusText()).toBe('Reverted — ⌘Z to restore');

      await refreshAfterWrite(panel); // a write git sees no change from

      expect(statusText()).toBe('Reverted — ⌘Z to restore');
    });

    it('keeps an error up through a later read of the same status', async () => {
      await runAction('Commit');
      await refreshAfterWrite(panel);

      expect(statusText()).toBe('Commit message required');
      expect(container.querySelector('.git-status').classList).toContain('git-error');
    });

    it('gives way to the status line when the status changes', async () => {
      await runAction('Revert');

      changedCount = 1; // an edit was saved
      await refreshAfterWrite(panel);

      expect(statusText()).toBe('main · 1 puzzle file changed');
    });

    it('gives way to the next action', async () => {
      await runAction('Revert');
      await runAction('Push'); // reports nothing of its own

      expect(statusText()).toBe('main · 0 puzzle files changed');
    });

    it('gives way to the status line once it no longer holds', async () => {
      await runAction('Revert');

      panel.clearNote();
      await refreshAfterWrite(panel);

      expect(statusText()).toBe('main · 0 puzzle files changed');
    });
  });
});
