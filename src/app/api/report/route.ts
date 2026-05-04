import { NextRequest, NextResponse } from 'next/server';
import { HttpStatusCode } from '@/libs/http/http.types';
import { handleApiError } from '@/libs/api/route-error-handler';
import { ReportController } from '@/controllers/report/report';
/**
 * API Route for post report submission to Chatwoot
 *
 * This endpoint receives report data from the UI and processes it through
 * the controller layer following Franky's architecture.
 *
 * All validation is handled by the controller layer.
 * This route only parses the request body and delegates to the controller.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { pubky, postUrl, issueType, reason, name } = body;

    // Delegate to controller - validation happens there
    await ReportController.submit({ pubky, postUrl, issueType, reason, name });

    return NextResponse.json({ message: 'Success' });
  } catch (error) {
    return handleApiError(error, 'api.report.POST');
  }
}

export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed. Use POST instead.' },
    { status: HttpStatusCode.METHOD_NOT_ALLOWED },
  );
}

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
