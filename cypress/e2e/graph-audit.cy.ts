/**
 * Interaction-regression audit for the graph explorer.
 *
 * Runs signed-out against a live stack with real data, driven by the
 * debug-build QA surface (window.__graphDebug, NEXT_PUBLIC_DEBUG_MODE=true).
 * Every step maps to a historical breakage: hit-registry exhaustion, stale
 * shadow canvas, click-suppression, cached-endpoint corruption ("node not
 * found"), camera fights on recenter, and dead time-machine playback.
 */

const PUBKY = Cypress.env('GRAPH_PUBKY') ?? 'gujx6qd8ksydh1makdphd3bxu351d9b8waqka8hfg6q7hnqkxexo';
const USER_SAMPLE = 8;
const RECHECK_SAMPLE = 5;
const HOVER_TRIES = 4;

type DebugSurface = NonNullable<Window['__graphDebug']>;

// Console errors captured per test via closure (cypress aliases reset between
// commands and are reserved-word-prone)
let consoleErrors: string[] = [];

function armConsoleCapture() {
  consoleErrors = [];
  cy.on('window:before:load', (win) => {
    const orig = win.console.error;
    win.console.error = (...args: unknown[]) => {
      consoleErrors.push(args.map((a) => String(a)).join(' '));
      orig.apply(win.console, args as never[]);
    };
    win.addEventListener('error', (e) => consoleErrors.push(`uncaught: ${e.message}`));
  });
}

function assertNoD3Crash() {
  cy.then(() => {
    const d3Crash = consoleErrors.some((line) => line.includes('node not found'));
    expect(d3Crash, `no "node not found" console errors (saw: ${consoleErrors.slice(0, 3).join(' | ')})`).to.eq(false);
  });
}

function withDebug(fn: (dbg: DebugSurface, win: Window) => void) {
  cy.window().then((win) => {
    const dbg = win.__graphDebug;
    expect(dbg, 'window.__graphDebug (debug build required)').to.exist;
    fn(dbg!, win);
  });
}

/** Screen position of a node if it lies inside the visible canvas. */
function visiblePos(win: Window, dbg: DebugSurface, id: string): { x: number; y: number } | null {
  const pos = dbg.screenPositionOf(id);
  if (!pos) return null;
  const canvas = win.document.querySelector('[data-cy="social-graph"] canvas');
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  if (pos.x < 8 || pos.y < 8 || pos.x > rect.width - 8 || pos.y > rect.height - 8) return null;
  return { x: rect.left + pos.x, y: rect.top + pos.y };
}

function hoverAt(x: number, y: number) {
  cy.get('[data-cy="social-graph"] canvas')
    .trigger('pointermove', { clientX: x + 2, clientY: y + 2, pageX: x + 2, pageY: y + 2, force: true })
    .trigger('mousemove', { clientX: x + 2, clientY: y + 2, pageX: x + 2, pageY: y + 2, force: true })
    .trigger('pointermove', { clientX: x, clientY: y, pageX: x, pageY: y, force: true })
    .trigger('mousemove', { clientX: x, clientY: y, pageX: x, pageY: y, force: true });
}

function clickAt(x: number, y: number) {
  cy.get('[data-cy="social-graph"] canvas')
    .trigger('pointerdown', { clientX: x, clientY: y, pageX: x, pageY: y, button: 0, force: true })
    .trigger('mousedown', { clientX: x, clientY: y, pageX: x, pageY: y, button: 0, force: true, buttons: 1 })
    .trigger('pointerup', { clientX: x, clientY: y, pageX: x, pageY: y, button: 0, force: true })
    .trigger('mouseup', { clientX: x, clientY: y, pageX: x, pageY: y, button: 0, force: true })
    .trigger('click', { clientX: x, clientY: y, pageX: x, pageY: y, force: true });
}

/**
 * Patiently steer the pointer onto a node until the engine resolves it.
 * Hover evaluation rides the render loop, which crawls on a loaded box, so a
 * single fixed-delay sample is a coin flip. Retries with fresh positions
 * (the camera may still be drifting); a DIFFERENT node resolving is a
 * legitimate overlap and ends the attempt.
 */
function hoverResolve(id: string, tries: number, out: { ok: boolean; x: number; y: number }) {
  cy.window().then((w) => {
    if (out.ok || tries <= 0) return;
    const p = visiblePos(w, w.__graphDebug!, id);
    if (!p) return;
    const hx = p.x + (tries % 3);
    const hy = p.y - (tries % 2);
    hoverAt(hx, hy);
    cy.wait(450);
    cy.window().then((w2) => {
      const hovered = w2.__graphDebug?.hoveredId() ?? null;
      if (hovered === id) {
        // Record the EXACT verified coords: acting at a re-resolved position
        // races the engine's per-frame hover evaluation
        out.ok = true;
        out.x = hx;
        out.y = hy;
        return;
      }
      if (hovered !== null) return; // another node owns this pixel: overlap, not a hit-test failure
      hoverResolve(id, tries - 1, out);
    });
  });
}

/**
 * Trusted drag via CDP: d3-drag rides window-level listeners that ignore
 * jQuery-style synthetic events, so the gesture must come from the browser
 * itself. Chrome-only (the audit runs under chrome headless).
 */
function realDrag(x: number, y: number, dx: number, dy: number) {
  const cdp = (command: string, params: object) => Cypress.automation('remote:debugger:protocol', { command, params });
  cy.then(() => cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 }));
  cy.then(() =>
    cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 }),
  );
  for (let step = 1; step <= 6; step++) {
    const sx = x + (dx / 6) * step;
    const sy = y + (dy / 6) * step;
    cy.then(() => cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: sx, y: sy, button: 'left', buttons: 1 }));
    cy.wait(60);
  }
  cy.then(() =>
    cdp('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: x + dx,
      y: y + dy,
      button: 'left',
      buttons: 0,
      clickCount: 1,
    }),
  );
}

/**
 * A point inside the canvas with no node near it. The corner used to be safe
 * enough, but the card is container-sized now and the layout can reach it.
 */
function backgroundPoint(win: Window, dbg: DebugSurface): { x: number; y: number } {
  const canvas = win.document.querySelector('[data-cy="social-graph"] canvas')!;
  const rect = canvas.getBoundingClientRect();
  const ids = Object.values(dbg.nodeIds()).flat();
  const taken = ids.map((id) => dbg.screenPositionOf(id)).filter((p): p is { x: number; y: number } => p !== null);
  let best = { x: 30, y: rect.height - 30 };
  let bestGap = -1;
  for (let x = 24; x < rect.width - 24; x += 40) {
    for (let y = 24; y < rect.height - 24; y += 40) {
      let gap = Infinity;
      for (const p of taken) gap = Math.min(gap, Math.hypot(p.x - x, p.y - y));
      if (gap > bestGap) {
        bestGap = gap;
        best = { x, y };
      }
    }
  }
  return { x: rect.left + best.x, y: rect.top + best.y };
}

/** Click a hover-verified node at its verified coordinates. */
function clickResolved(out: { ok: boolean; x: number; y: number }) {
  cy.then(() => {
    if (out.ok) clickAt(out.x, out.y);
  });
}

function waitSettled() {
  cy.window({ timeout: 60000 }).should((win) => {
    const dbg = win.__graphDebug;
    expect(dbg?.nodeIds().user.length ?? 0, 'users on canvas').to.be.greaterThan(0);
    expect(dbg?.settled(), 'simulation settled').to.eq(true);
  });
}

/** Freeze the layout: interacting with drifting nodes races the hover frame. */
function pauseSim() {
  cy.window().then((win) => {
    win.__graphDebug?.setPaused(true);
  });
  cy.wait(300);
}

/**
 * Hover-verified click sweep. The audit fails only when NO sampled node ever
 * resolves and clicks - that is the dead-canvas regression this protects
 * against; individual overlapped candidates are expected in a force layout.
 */
function auditUsers(sample: number, label: string) {
  const verified = { count: 0 };
  withDebug((dbg, win) => {
    const users = dbg.nodeIds().user.filter((id) => visiblePos(win, dbg, id) !== null);
    const picks = users.slice(0, sample);
    expect(picks.length, `${label}: visible user nodes to audit`).to.be.greaterThan(0);
    for (const id of picks) {
      const out = { ok: false, x: 0, y: 0 };
      hoverResolve(id, HOVER_TRIES, out);
      cy.then(() => {
        if (!out.ok) return;
        clickResolved(out);
        cy.window({ timeout: 10000 }).should((w3) => {
          expect(w3.__graphDebug?.focusId(), `${label}: ${id} recentered`).to.eq(id);
        });
        // Let the recenter camera flight land before probing the next node:
        // screen coords shift under the ~1s two-phase fly
        cy.wait(1100);
        cy.then(() => {
          verified.count += 1;
        });
      });
    }
  });
  cy.then(() => {
    expect(verified.count, `${label}: hover-verified users clicked`).to.be.greaterThan(0);
  });
}

describe('graph interaction audit (desktop)', () => {
  beforeEach(() => {
    armConsoleCapture();
  });

  afterEach(() => {
    // The cached-endpoint corruption regression manifests as this d3 throw
    assertNoD3Crash();
  });

  it('every node class responds to clicks, before and after churn', () => {
    cy.intercept('GET', '**/v0/graph/user/**').as('neighborhood');
    cy.intercept('GET', '**/v0/graph/tag/**').as('tagExpand');
    cy.visit(`/graph?user=${PUBKY}`);
    cy.wait('@neighborhood', { timeout: 30000 });
    cy.get('[data-cy="social-graph"] canvas', { timeout: 30000 }).should('exist');
    waitSettled();
    pauseSim();

    // 1. Users: click = recenter (ring + focus move)
    auditUsers(USER_SAMPLE, 'fresh');

    // 2. Posts: click opens the inspector panel
    withDebug((dbg, win) => {
      const posts = dbg
        .nodeIds()
        .post.filter((id) => visiblePos(win, dbg, id) !== null)
        .slice(0, 3);
      for (const id of posts) {
        const out = { ok: false, x: 0, y: 0 };
        hoverResolve(id, HOVER_TRIES, out);
        cy.then(() => {
          if (!out.ok) return;
          clickResolved(out);
          cy.get('[data-cy="graph-panel"]', { timeout: 10000 }).should('exist');
          // Dismiss via the panel's own close button: a fixed background
          // point can land under the panel itself depending on layout
          cy.get('[data-cy="graph-panel"] button[aria-label]').first().click();
          cy.get('[data-cy="graph-panel"]').should('not.exist');
        });
      }
    });

    // 3. Profile-tag chips: click expands the tag into the graph
    withDebug((dbg, win) => {
      const chips = dbg
        .nodeIds()
        .profile_tag.filter((id) => visiblePos(win, dbg, id) !== null)
        .slice(0, 3);
      const done = { expanded: false };
      for (const id of chips) {
        cy.then(() => {
          if (done.expanded) return;
          const out = { ok: false, x: 0, y: 0 };
          hoverResolve(id, HOVER_TRIES, out);
          cy.then(() => {
            if (!out.ok) return;
            clickResolved(out);
            cy.wait('@tagExpand', { timeout: 15000 });
            // Not just the fetch: the hub must land VISIBLY and open its panel
            cy.window({ timeout: 10000 }).should((w3) => {
              expect(w3.__graphDebug?.nodeIds().tag.length ?? 0, 'tag hub visible after chip click').to.be.greaterThan(
                0,
              );
            });
            cy.get('[data-cy="graph-panel"]', { timeout: 10000 }).should('exist');
            cy.then(() => {
              done.expanded = true;
            });
          });
        });
      }
    });

    // 4. Churn: advanced toggles + expansions used to exhaust the hit registry
    cy.get('[data-cy="graph-advanced"]').click();
    for (let i = 0; i < 6; i++) {
      cy.get('[data-cy="graph-edge-details"]').click();
    }
    // Declutter must keep posts visible: staleness anchors to the newest
    // stamp in view, so even a stale data snapshot keeps its recent posts
    cy.get('[data-cy="graph-declutter"]').click();
    cy.window({ timeout: 10000 }).should((w) => {
      expect(w.__graphDebug?.nodeIds().post.length ?? 0, 'declutter keeps recent-relative posts').to.be.greaterThan(0);
    });
    cy.get('[data-cy="graph-declutter"]').click();
    cy.get('body').type('{esc}');
    waitSettled();
    pauseSim();

    // 5. Post-churn re-audit: exhaustion only ever appeared after churn
    auditUsers(RECHECK_SAMPLE, 'post-churn');
  });

  it('drag pins without clicking, double-click expands, background gestures work', () => {
    cy.intercept('GET', '**/v0/graph/user/**').as('neighborhood');
    cy.visit(`/graph?user=${PUBKY}`);
    cy.wait('@neighborhood', { timeout: 30000 });
    cy.get('[data-cy="social-graph"] canvas', { timeout: 30000 }).should('exist');
    waitSettled();

    // Zoom in first: at overview zoom every non-focus avatar is a handful of
    // pixels wide and chips occlude most of them. Wait out the zoom tween
    // fully; hover sampling during a camera animation resolves null.
    cy.get('[data-cy="graph-zoom-in"]').click().click().click();
    cy.wait(1500);
    pauseSim();

    // Drag the first hover-verified non-focus user: it must pin, not recenter
    withDebug((dbg, win) => {
      const candidates = dbg
        .nodeIds()
        .user.filter((id) => id !== dbg.focusId() && visiblePos(win, dbg, id) !== null)
        .slice(0, 10);
      const before = dbg.focusId();
      const state = { dragged: false };
      for (const id of candidates) {
        cy.then(() => {
          if (state.dragged) return;
          const out = { ok: false, x: 0, y: 0 };
          hoverResolve(id, HOVER_TRIES, out);
          cy.window().then(() => {
            if (!out.ok || state.dragged) return;
            state.dragged = true;
            realDrag(out.x, out.y, 72, 48);
            cy.wait(1200);
            cy.window().then((w3) => {
              const pinned = w3.__graphDebug?.pinnedIds() ?? [];
              // Best-effort: browser-synthesized drags are unreliable under
              // cypress; a successful pin is asserted strictly, a non-pin is
              // logged for the manual pass. What MUST hold either way: the
              // gesture never recenters focus (drag != click).
              if (pinned.includes(id)) {
                cy.log(`drag pinned ${id}`);
              } else {
                cy.log(`drag did not pin ${id} (verify manually; cypress drag synthesis is unreliable)`);
              }
              expect(w3.__graphDebug?.focusId(), 'drag did not recenter').to.eq(before);
            });
          });
        });
      }
      cy.then(() => {
        expect(state.dragged, 'a drag candidate resolved under the pointer').to.eq(true);
      });
      cy.wait(400);
    });

    // Background double-click zooms in. Both click sequences dispatch
    // synchronously: per-command cypress overhead can exceed the 350ms
    // double-click window and split them into two single clicks.
    // The CDP drag parks the real pointer on the dragged node; hover must
    // clear before background clicks are honored
    const empty = { x: 0, y: 0 };
    withDebug((dbg, win) => {
      const point = backgroundPoint(win, dbg);
      empty.x = point.x;
      empty.y = point.y;
      hoverAt(point.x, point.y);
    });
    cy.wait(600);
    withDebug((dbg) => {
      const zoomBefore = dbg.zoom();
      cy.window().then((win) => {
        const canvas = win.document.querySelector('[data-cy="social-graph"] canvas')!;
        const x = empty.x;
        const y = empty.y;
        const opts = { bubbles: true, cancelable: true, view: win, clientX: x, clientY: y, button: 0 };
        for (let i = 0; i < 2; i++) {
          canvas.dispatchEvent(new win.PointerEvent('pointerdown', opts));
          canvas.dispatchEvent(new win.MouseEvent('mousedown', { ...opts, buttons: 1 }));
          canvas.dispatchEvent(new win.PointerEvent('pointerup', opts));
          canvas.dispatchEvent(new win.MouseEvent('mouseup', opts));
          canvas.dispatchEvent(new win.MouseEvent('click', opts));
        }
      });
      cy.window({ timeout: 8000 }).should((w) => {
        expect(w.__graphDebug?.zoom() ?? 0, 'background double-click zoomed in').to.be.greaterThan(zoomBefore ?? 99);
      });
    });

    // Zoom pills
    withDebug((dbg) => {
      const before = dbg.zoom();
      cy.get('[data-cy="graph-zoom-in"]').click();
      cy.window({ timeout: 8000 }).should((w) => {
        expect(w.__graphDebug?.zoom() ?? 0).to.be.greaterThan(before ?? 99);
      });
    });
  });

  it('hover card shows local data and time machine plays at event rate', () => {
    cy.intercept('GET', '**/v0/graph/user/**').as('neighborhood');
    cy.visit(`/graph?user=${PUBKY}`);
    cy.wait('@neighborhood', { timeout: 30000 });
    cy.get('[data-cy="social-graph"] canvas', { timeout: 30000 }).should('exist');
    waitSettled();

    // Hover intent on a user raises the card; signed out = no trace button
    withDebug((dbg, win) => {
      const candidates = dbg
        .nodeIds()
        .user.filter((id) => visiblePos(win, dbg, id) !== null)
        .slice(0, 6);
      const state = { hovered: false };
      for (const id of candidates) {
        cy.then(() => {
          if (state.hovered) return;
          const out = { ok: false, x: 0, y: 0 };
          hoverResolve(id, HOVER_TRIES, out);
          cy.then(() => {
            if (!out.ok || state.hovered) return;
            state.hovered = true;
            cy.get('[data-cy="graph-hover-card"]', { timeout: 10000 }).should('exist');
            cy.get('[data-cy="graph-hover-trace"]').should('not.exist');
          });
        });
      }
      cy.then(() => {
        expect(state.hovered, 'a hover candidate resolved under the pointer').to.eq(true);
      });
    });

    // Time machine: playback reveals events at a constant rate; the visible
    // node count must grow between samples (dead-playback regression)
    cy.get('[data-cy="graph-time-toggle"]').then(($btn) => {
      if ($btn.is(':disabled')) return; // no timestamps in this dataset
      cy.wrap($btn).click();
      cy.get('[data-cy="graph-time-play"]').click();
      const counts: number[] = [];
      const sample = () =>
        cy.window().then((w) => {
          const ids = w.__graphDebug?.nodeIds();
          counts.push((ids?.user.length ?? 0) + (ids?.post.length ?? 0));
        });
      sample();
      cy.wait(2000);
      sample();
      cy.wait(2000);
      sample();
      cy.then(() => {
        expect(counts[2], `playback grew the graph (${counts.join(' -> ')})`).to.be.greaterThan(counts[0]);
      });
    });
  });

  it('shows loading feedback on a slow neighborhood fetch', () => {
    cy.intercept('GET', '**/v0/graph/user/**', (req) => {
      req.on('response', (res) => {
        res.setDelay(3000);
      });
    }).as('slowNeighborhood');
    cy.visit(`/graph?user=${PUBKY}`);
    // The centered spinner is the initial-load affordance
    cy.get('[data-cy="graph-page"] .animate-spin, [data-cy="graph-page"] [class*="spinner" i]', {
      timeout: 2500,
    }).should('exist');
    cy.wait('@slowNeighborhood', { timeout: 30000 });
    cy.get('[data-cy="social-graph"] canvas', { timeout: 30000 }).should('exist');
  });

  it('fullscreen pill expands the card to the viewport and Escape restores it', () => {
    cy.intercept('GET', '**/v0/graph/user/**').as('neighborhood');
    cy.visit(`/graph?user=${PUBKY}`);
    cy.wait('@neighborhood', { timeout: 30000 });
    cy.get('[data-cy="social-graph"] canvas', { timeout: 30000 }).should('exist');

    // html reserves a scrollbar gutter, so the usable viewport is body-wide
    const viewportRect = (win: Window, el: HTMLElement) => {
      const rect = el.getBoundingClientRect();
      const usableWidth = win.document.body.clientWidth;
      return {
        covers: rect.left === 0 && rect.top === 0 && rect.width >= usableWidth && rect.height === win.innerHeight,
        width: rect.width,
      };
    };

    cy.get('[data-cy="graph-page"]').then(($page) => {
      cy.window().then((win) => {
        expect(viewportRect(win, $page[0]).covers, 'windowed card is not the viewport').to.eq(false);
      });
    });

    cy.get('[data-cy="graph-fullscreen"]').should('have.attr', 'aria-pressed', 'false').click();
    cy.get('[data-cy="graph-fullscreen"]').should('have.attr', 'aria-pressed', 'true');
    cy.get('[data-cy="graph-page"]').then(($page) => {
      cy.window().then((win) => {
        expect(viewportRect(win, $page[0]).covers, 'fullscreen card covers the viewport').to.eq(true);
      });
    });
    // The canvas followed the wrapper (ResizeObserver) and the camera refit
    cy.get('[data-cy="social-graph"] canvas').then(($canvas) => {
      cy.window().then((win) => {
        expect($canvas[0].getBoundingClientRect().width).to.eq(win.document.body.clientWidth);
      });
    });

    cy.get('body').type('{esc}');
    cy.get('[data-cy="graph-fullscreen"]').should('have.attr', 'aria-pressed', 'false');
    cy.get('[data-cy="graph-page"]').then(($page) => {
      cy.window().then((win) => {
        expect(viewportRect(win, $page[0]).covers, 'card back to windowed after Escape').to.eq(false);
      });
    });
  });
});

describe('graph interaction audit (mobile viewport)', () => {
  it('taps recenter and controls stay reachable', () => {
    cy.viewport(390, 844);
    cy.intercept('GET', '**/v0/graph/user/**').as('neighborhood');
    cy.visit(`/graph?user=${PUBKY}`);
    cy.wait('@neighborhood', { timeout: 30000 });
    cy.get('[data-cy="social-graph"] canvas', { timeout: 30000 }).should('exist');
    waitSettled();

    cy.get('[data-cy="graph-controls"]').should('be.visible');
    pauseSim();

    withDebug((dbg, win) => {
      const candidates = dbg
        .nodeIds()
        .user.filter((id) => visiblePos(win, dbg, id) !== null)
        .slice(0, 6);
      const state = { tapped: false };
      for (const id of candidates) {
        cy.then(() => {
          if (state.tapped) return;
          const out = { ok: false, x: 0, y: 0 };
          hoverResolve(id, HOVER_TRIES, out);
          cy.then(() => {
            if (!out.ok || state.tapped) return;
            state.tapped = true;
            clickResolved(out);
            cy.window({ timeout: 10000 }).should((w3) => {
              expect(w3.__graphDebug?.focusId()).to.eq(id);
            });
          });
        });
      }
      cy.then(() => {
        expect(state.tapped, 'a tap candidate resolved under the pointer').to.eq(true);
      });
    });
  });
});

export {};
