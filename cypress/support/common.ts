import * as path from 'path';

export const defaultBackupFilename = (): string => {
  // return `pubky_recovery_${moment().utc().format('YYYY-MM-DD')}.pkarr`
  return 'recovery.pkarr';
};

export const backupDownloadFilePath = (filename?: string): string => {
  const filenameWithExtension = filename ? `${filename}.pkarr` : defaultBackupFilename();
  const downloadsFolder = Cypress.config('downloadsFolder');
  return path.join(downloadsFolder, filenameWithExtension);
};

export const userIdFromPubky = (pubky: string): string => {
  if (!pubky.startsWith('pubky')) {
    throw new Error(`Expected pubky to start with 'pubky': ${pubky}`);
  }
  return pubky.substring('pubky'.length);
};

export interface NetworkRequest {
  timestamp: string;
  method: string;
  url: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  requestBody: any;
}

export const interceptNetworkRequest = (interceptedRequests: NetworkRequest[]) => {
  cy.intercept('**/api/invite-code', (req) => {
    const requestData: NetworkRequest = {
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.url,
      requestBody: req.body,
    };
    interceptedRequests.push(requestData);
  });
};

export const saveNetworkRequestLog = (interceptedRequests: NetworkRequest[], testSuite: string) => {
  const logFilePath = `dist/cypress/apps/web-e2e/invite-code-network-logs/${testSuite}.json`;
  cy.writeFile(logFilePath, JSON.stringify(interceptedRequests, null, 2), { flag: 'w' }).then(() => {
    console.log('Network log saved to', logFilePath);
  });
};

export const verifyNotificationCounter = (expectedCount?: number) => {
  if (expectedCount === 0) {
    cy.get('[data-cy="header-notification-counter"]').should('not.exist');
  } else {
    cy.get('[data-cy="header-notification-counter"]', { timeout: 30_000 })
      .should('be.visible')
      .should('have.text', expectedCount);
  }
};

/**
 * Returns a timeout options object with doubled timeout when not in CI
 * Useful for commands that may need extra time in local development
 */
export const extendedTimeout = (): Partial<Cypress.Timeoutable> => {
  return Cypress.expose('ci')
    ? { timeout: Cypress.config('defaultCommandTimeout') * 1.2 }
    : { timeout: Cypress.config('defaultCommandTimeout') * 2 };
};
