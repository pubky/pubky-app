import { ReportApplication } from '@/application/report/report';
import { ReportValidators } from '@/pipes/report/report.validators';
import type { TReportSubmitParams } from './report.types';

/**
 * Controller for post report submission.
 * Entry point for the report feature, called from the API route.
 */
export class ReportController {
  private constructor() {}

  /**
   * Submit a post report to Chatwoot.
   *
   * Validates all inputs via pipes layer before delegating to application.
   *
   * @param params.pubky - Reporter's public key
   * @param params.postUrl - URL of the post being reported
   * @param params.issueType - Type of issue being reported
   * @param params.reason - User's description of the issue
   * @param params.name - Reporter's display name
   * @throws AppError if validation fails or submission fails
   */
  static async submit(params: TReportSubmitParams): Promise<void> {
    // Validate and normalize inputs using pipes layer
    const pubky = ReportValidators.validatePubky(params.pubky);
    const postUrl = ReportValidators.validatePostUrl(params.postUrl);
    const issueType = ReportValidators.validateIssueType(params.issueType);
    const reason = ReportValidators.validateReason(params.reason);
    const name = ReportValidators.validateName(params.name);

    await ReportApplication.submit({ pubky, postUrl, issueType, reason, name });
  }
}
