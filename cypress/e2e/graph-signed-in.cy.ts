import { BackupType } from '../support/types/enums';

/**
 * Signed-in graph surface against a live stack: hover-card actions and the
 * how-are-we-connected mode. A fresh throwaway account exists only on the
 * homeserver, so the path endpoint is stubbed with a canned payload; that
 * still exercises the full frontend path machinery (trace entry, exclusive
 * filtering, exit). Real path data and the feed graph layout need an
 * indexed account and stay on the CI/manual pass.
 */

const CENTER = Cypress.env('GRAPH_PUBKY') ?? 'gujx6qd8ksydh1makdphd3bxu351d9b8waqka8hfg6q7hnqkxexo';
const MID = 'nkcct8tzquo8n4z5ysz9t963ye9kq1w7gb55aad1z4tmsgjjhmto';

type DebugSurface = NonNullable<Window['__graphDebug']>;

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
        out.ok = true;
        out.x = hx;
        out.y = hy;
        return;
      }
      if (hovered !== null) return;
      hoverResolve(id, tries - 1, out);
    });
  });
}

describe('graph signed-in surface', () => {
  it('hover card offers follow + how-connected, and path mode filters exclusively', () => {
    cy.onboardAsNewUser('Graph QA', 'temporary audit account', [BackupType.RecoveryPhraseWithoutConfirmation]);

    cy.window().then((win) => {
      // Canned shortest path: me -> mid -> center, using real clone users for
      // the intermediate hops so satellites/avatars behave
      const mePk = win.localStorage.getItem('pubky') ?? '';
      cy.intercept('GET', '**/v0/graph/path/**', (req) => {
        const me = decodeURIComponent(req.url.split('/v0/graph/path/')[1].split('/')[0]);
        req.reply({
          nodes: [
            { kind: 'user', id: `user:${me}`, pubky: me, name: 'Me', image: null },
            { kind: 'user', id: `user:${MID}`, pubky: MID, name: 'Mid', image: null },
            { kind: 'user', id: `user:${CENTER}`, pubky: CENTER, name: 'Center', image: null },
          ],
          edges: [
            { source: `user:${me}`, target: `user:${MID}`, type: 'FOLLOWS' },
            { source: `user:${MID}`, target: `user:${CENTER}`, type: 'FOLLOWS' },
          ],
        });
      }).as('path');
      void mePk;
    });

    cy.intercept('GET', '**/v0/graph/user/**').as('neighborhood');
    cy.visit(`/graph?user=${CENTER}`);
    cy.wait('@neighborhood', { timeout: 30000 });
    cy.get('[data-cy="social-graph"] canvas', { timeout: 30000 }).should('exist');
    cy.window({ timeout: 60000 }).should((win) => {
      expect(win.__graphDebug?.nodeIds().user.length ?? 0).to.be.greaterThan(0);
      expect(win.__graphDebug?.settled()).to.eq(true);
    });
    cy.window().then((win) => {
      win.__graphDebug?.setPaused(true);
    });
    cy.wait(300);

    // Signed in: the recenter-to-me pill exists
    cy.get('[data-cy="graph-recenter"]').should('exist');

    // Hover a user: card shows the signed-in action set
    cy.window().then((win) => {
      const dbg = win.__graphDebug!;
      const candidates = dbg.nodeIds().user.filter((id) => visiblePos(win, dbg, id) !== null);
      const state = { done: false };
      for (const id of candidates.slice(0, 6)) {
        cy.then(() => {
          if (state.done) return;
          const out = { ok: false, x: 0, y: 0 };
          hoverResolve(id, 4, out);
          cy.then(() => {
            if (!out.ok || state.done) return;
            state.done = true;
            cy.get('[data-cy="graph-hover-card"]', { timeout: 10000 }).should('exist');
            cy.get('[data-cy="graph-hover-trace"]', { timeout: 10000 }).should('exist');
            // Enter path mode through the design's entry point
            cy.get('[data-cy="graph-hover-trace"]').click();
            cy.wait('@path', { timeout: 15000 });
            // Exclusive view: only the canned path users (+ their satellites)
            cy.window({ timeout: 15000 }).should((w3) => {
              const users = w3.__graphDebug?.nodeIds().user ?? [];
              expect(users.length, `path mode shows only path users (${users.length})`).to.be.within(2, 3);
              expect(w3.__graphDebug?.pathIds(), 'pathIds set').to.not.eq(null);
            });
            cy.get('[data-cy="graph-path-exit"]').should('exist');
            cy.get('[data-cy="graph-path-exit"]').click();
            cy.window({ timeout: 15000 }).should((w4) => {
              expect(w4.__graphDebug?.pathIds(), 'path cleared').to.eq(null);
              expect(w4.__graphDebug?.nodeIds().user.length ?? 0, 'full view restored').to.be.greaterThan(3);
            });
          });
        });
      }
      cy.then(() => {
        expect(state.done, 'a hover candidate resolved').to.eq(true);
      });
    });
  });
});

export {};
